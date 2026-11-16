import assert from 'node:assert/strict';
import { test } from 'node:test';

const hooks = new Map();
const settings = new Map();
const dialogs = [];
let saved;
const user = {
    id: 'one',
    name: 'Player',
    isGM: false,
    getFlag: () => saved,
    unsetFlag: async () => {
        saved = undefined;
        return user;
    },
    setFlag: async (_scope, _key, value) => {
        saved = value;
        return user;
    },
};
const other = { ...user, id: 'two' };
globalThis.Hooks = {
    on: (name, callback) => hooks.set(name, callback),
    once: (name, callback) => hooks.set(name, callback),
};
globalThis.Handlebars = { registerHelper() {} };
globalThis.game = {
    user,
    userId: user.id,
    users: [user, other],
    system: { id: 'generic' },
    i18n: { localize: (key) => key },
    settings: { get: (_scope, key) => settings.get(key), register() {} },
};
const notices = [];
let printed;
globalThis.ChatMessage = {
    create: async (data) => {
        printed = data;
    },
};
globalThis.ui = { notifications: { error: (...args) => notices.push(args) } };
globalThis.foundry = {
    applications: { handlebars: { renderTemplate: async (_path, data) => String(data.stats.count) } },
    appv1: {
        api: {
            Dialog: { confirm: async () => true },
            FormApplication: class {
                constructor(object) {
                    this.object = object;
                }
                render() {
                    dialogs.push(this.object);
                }
                getData() {
                    return { object: this.object };
                }
            },
        },
    },
};
globalThis.document = {
    createElement: () => ({
        addEventListener(_name, handler) {
            this.click = handler;
        },
    }),
};
await import('../src/roll-tracker.ts');
const { RollTrackerDialog } = await import('../src/dialog.ts');
hooks.get('init')();

function playerList() {
    const rows = new Map(
        [user, other].map((u) => [
            u.id,
            {
                button: null,
                querySelector() {
                    return this.button;
                },
                append(button) {
                    this.button = button;
                },
            },
        ]),
    );
    return { rows, querySelector: (selector) => rows.get(selector.match(/"(.*?)"/)[1]) };
}
test('v13 player buttons respect permissions, avoid duplicates, and open the right user', () => {
    settings.set('players_see_players', true);
    const element = playerList();
    const render = hooks.get('renderPlayers');
    render({}, element);
    const button = element.rows.get(user.id).button;
    assert.ok(button);
    assert.equal(element.rows.get(other.id).button, null);
    render({}, element);
    assert.equal(element.rows.get(user.id).button, button);
    button.click();
    assert.equal(dialogs.pop(), user);
    settings.set('players_see_players', false);
    const hidden = playerList();
    render({}, hidden);
    assert.equal(hidden.rows.get(user.id).button, null);
    user.isGM = true;
    settings.set('gm_see_players', true);
    const gm = playerList();
    render({}, gm);
    gm.rows.get(other.id).button.click();
    assert.equal(dialogs.pop(), other);
    settings.set('gm_see_players', false);
    const self = playerList();
    render({}, self);
    assert.ok(self.rows.get(user.id).button);
    assert.equal(self.rows.get(other.id).button, null);
    user.isGM = false;
});
test('chat hook tracks only own d20 rolls and respects hidden-roll settings', async () => {
    const roll = {
        dice: [
            { faces: 20, results: [{ result: 12 }] },
            { faces: 6, results: [{ result: 6 }] },
        ],
    };
    const message = {
        id: 'message',
        isRoll: true,
        isContentVisible: false,
        blind: false,
        author: user,
        rolls: [roll],
        flags: {},
    };
    hooks.get('createChatMessage')(message);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(saved.histogram[11], 1);
    hooks.get('createChatMessage')({ ...message, author: other });
    hooks.get('createChatMessage')({ ...message, blind: true });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(saved.histogram[11], 1);
});

test('tracking does not wait for Dice So Nice, even when animation never completes', async () => {
    saved = undefined;
    game.dice3d = {};
    const roll = { dice: [{ faces: 20, results: [{ result: 7 }] }] };
    hooks.get('createChatMessage')({
        isRoll: true,
        isContentVisible: true,
        blind: false,
        author: user,
        rolls: [roll],
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(saved.histogram[6], 1);
    assert.ok(!hooks.has('diceSoNiceRollComplete'));
    delete game.dice3d;
});
test('dialog print and clear buttons use persisted statistics', async () => {
    const dialog = new RollTrackerDialog(user);
    await dialog._handleButtonClick({ currentTarget: { dataset: { action: 'print' } } });
    assert.equal(printed.content, '1');
    await dialog._handleButtonClick({ currentTarget: { dataset: { action: 'clear' } } });
    assert.equal(saved, undefined);
    assert.equal((await dialog.getData()).stats.count, 0);
});
test('failed tracking writes surface an error to the user', async () => {
    const originalSet = user.setFlag;
    const originalError = console.error;
    const logged = [];
    user.setFlag = async () => {
        throw new Error('disconnected');
    };
    console.error = (...args) => logged.push(args);
    try {
        hooks.get('createChatMessage')({
            isRoll: true,
            blind: false,
            author: user,
            rolls: [{ dice: [{ faces: 20, results: [{ result: 8 }] }] }],
        });
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(notices.length, 1);
        assert.equal(logged.length, 1);
    } finally {
        user.setFlag = originalSet;
        console.error = originalError;
    }
});
