import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { getLedgerContext } from '../src/ledger-context.ts';
import { RollStats } from '../src/statistics.ts';

const translations = JSON.parse(readFileSync(new URL('../languages/en.json', import.meta.url), 'utf8'));
const localize = (key) => key.split('.').reduce((value, part) => value?.[part], translations) ?? key;
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
    i18n: {
        localize,
        format: (key, data) => localize(key).replace(/\{(\w+)\}/g, (_match, name) => String(data[name])),
    },
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
let confirmation = true;
let confirmConfig;
let applicationId = 0;
class ApplicationV2 {
    constructor(options = {}) {
        this.options = {
            id: `application-${++applicationId}`,
            ...this.constructor.DEFAULT_OPTIONS,
            ...options,
        };
    }
    async render(options) {
        this.lastRenderOptions = options;
        dialogs.push(this.user);
        return this;
    }
    async _prepareContext() {
        return {};
    }
}
globalThis.foundry = {
    documents: { ChatMessage: globalThis.ChatMessage },
    applications: {
        handlebars: { renderTemplate: async (_path, data) => String(data.stats.count) },
        api: {
            ApplicationV2,
            HandlebarsApplicationMixin: (Base) => class extends Base {},
            DialogV2: {
                confirm: async (config) => {
                    confirmConfig = config;
                    return confirmation;
                },
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
test('v14 player buttons respect permissions, avoid duplicates, and open the right user', async () => {
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
    await new Promise((resolve) => setImmediate(resolve));
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
    await new Promise((resolve) => setImmediate(resolve));
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
    await dialog.options.actions.print.call(dialog);
    assert.equal(printed.content, '1');
    await dialog.options.actions.clear.call(dialog);
    assert.equal(confirmConfig.rejectClose, false);
    assert.equal(confirmConfig.modal, true);
    assert.ok(confirmConfig.window.title);
    assert.equal(saved, undefined);
    assert.equal((await dialog._prepareContext({})).stats.count, 0);
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

test('v14 dialog uses Handlebars parts and native application actions with unique window IDs', async () => {
    const dialog = new RollTrackerDialog(user);
    assert.ok(dialog instanceof ApplicationV2);
    assert.notEqual(dialog.options.id, new RollTrackerDialog(user).options.id);
    assert.notEqual(dialog.options.id, new RollTrackerDialog(other).options.id);
    assert.equal(dialog.options.position.width, 440);
    assert.equal(RollTrackerDialog.PARTS.ledger.template, 'modules/roll-tracker/templates/roll-tracker.hbs');
    const context = await dialog._prepareContext({});
    assert.equal(context.histogram.length, 20);
    assert.ok(context.histogram.every((bar) => Number.isFinite(bar.height)));
});
test('dismissing the v14 confirmation preserves user statistics', async () => {
    const previous = saved;
    confirmation = null;
    try {
        await new RollTrackerDialog(user).clearStats();
        assert.equal(saved, previous);
    } finally {
        confirmation = true;
    }
});

test('streak and mode summaries distinguish die result from repetition count', () => {
    const stats = new RollStats();
    for (const value of [5, 2, 2, 2]) stats.update(value);
    const context = getLedgerContext({ getFlag: () => stats.toFlagData() });
    assert.equal(context.summary.streakText, '3 rolls of 2 in a row');
    assert.equal(context.summary.modeText, '3 rolls');
    assert.equal(context.summary.totalText, '4 total rolls');
    stats.clear();
    stats.update(2);
    stats.update(3);
    const tied = getLedgerContext({ getFlag: () => stats.toFlagData() });
    assert.equal(tied.summary.modeText, '1 roll each');
    assert.equal(tied.summary.streakText, '1 roll of 3');
    stats.clear();
    const empty = getLedgerContext({ getFlag: () => stats.toFlagData() });
    assert.equal(empty.summary.modeText, 'No rolls yet');
    assert.equal(empty.summary.streakText, 'No rolls yet');
    assert.equal(empty.summary.totalText, '0 total rolls');
});

test('d10000 ledger bins all faces once and reports exact lowest and highest rolls', () => {
    const large = new RollStats(10000);
    for (const value of [1, 500, 501, 10000]) large.update(value);
    const context = getLedgerContext(
        { getFlag: (_scope, key) => (key === 'roll-stats-d10000' ? large.toSparseFlagData() : undefined) },
        10000,
    );
    assert.equal(context.isLargeDie, true);
    assert.equal(context.histogram.length, 20);
    assert.equal(context.histogram[0].label, '1–500');
    assert.equal(context.histogram[0].count, 2);
    assert.equal(context.histogram[1].count, 1);
    assert.equal(context.histogram[19].count, 1);
    assert.equal(
        context.histogram.reduce((sum, bin) => sum + bin.count, 0),
        4,
    );
    assert.deepEqual(context.summary.lowestValues, ['1', '500', '501', '10,000']);
    assert.deepEqual(context.summary.highestValues, ['10,000', '501', '500', '1']);
});
test('die picker, printing, and clearing operate on the selected die only', async () => {
    const d20 = new RollStats();
    d20.update(20);
    const d10000 = new RollStats(10000);
    d10000.update(10000);
    d10000.update(1);
    const flags = new Map([
        ['roll-stats', d20.toFlagData()],
        ['roll-stats-d10000', d10000.toSparseFlagData()],
    ]);
    const selectedUser = {
        id: 'die-picker',
        getFlag: (_scope, key) => flags.get(key),
        unsetFlag: async (_scope, key) => {
            flags.delete(key);
            return selectedUser;
        },
    };
    const dialog = new RollTrackerDialog(selectedUser);
    await dialog.options.actions.selectDie.call(dialog, {}, { dataset: { faces: '10000' } });
    assert.equal(dialog.faces, 10000);
    assert.equal((await dialog._prepareContext({})).stats.count, 2);
    await dialog.printStats();
    assert.equal(printed.content, '2');
    await dialog.clearStats();
    assert.ok(confirmConfig.content.includes('d10000'));
    assert.equal(flags.has('roll-stats-d10000'), false);
    assert.deepEqual(flags.get('roll-stats'), d20.toFlagData());
    await dialog.options.actions.selectDie.call(dialog, {}, { dataset: { faces: '6' } });
    assert.equal(dialog.faces, 10000);
    await dialog.selectDie(20);
    assert.equal((await dialog._prepareContext({})).stats.count, 1);
});
