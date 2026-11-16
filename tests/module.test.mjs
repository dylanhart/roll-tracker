import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';

const hooks = new Map();
const settings = new Map();
const dialogs = [];
let saved;
const user = { id: 'one', name: 'Player', isGM: false,
    getFlag: () => saved,
    setFlag: async (_scope, _key, value) => { saved = value; return user; },
};
const other = { ...user, id: 'two' };
globalThis.Hooks = { on: (name, callback) => hooks.set(name, callback), once: (name, callback) => hooks.set(name, callback) };
globalThis.Handlebars = { registerHelper() {} };
globalThis.game = { user, userId: user.id, users: [user, other], system: { id: 'generic' },
    i18n: { localize: key => key }, settings: { get: (_scope, key) => settings.get(key), register() {} } };
globalThis.foundry = { appv1: { api: { FormApplication: class {
    constructor(object) { this.object = object; }
    render() { dialogs.push(this.object); }
} } } };
globalThis.document = { createElement: () => ({ addEventListener(_name, handler) { this.click = handler; } }) };
const { RollStats } = await import('../dist/scripts/roll-tracker.js');
hooks.get('init')();

function playerList() {
    const rows = new Map([user, other].map(u => [u.id, {
        button: null, querySelector() { return this.button; }, append(button) { this.button = button; },
    }]));
    return { rows, querySelector: selector => rows.get(selector.match(/"(.*?)"/)[1]) };
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
    const hidden = playerList(); render({}, hidden);
    assert.equal(hidden.rows.get(user.id).button, null);
    user.isGM = true;
    settings.set('gm_see_players', true);
    const gm = playerList(); render({}, gm);
    gm.rows.get(other.id).button.click();
    assert.equal(dialogs.pop(), other);
    settings.set('gm_see_players', false);
    const self = playerList(); render({}, self);
    assert.ok(self.rows.get(user.id).button);
    assert.equal(self.rows.get(other.id).button, null);
    user.isGM = false;
});
test('statistics retain the existing flag format and streak behavior', () => {
    const stats = new RollStats();
    for (const value of [1, 10, 20, 20]) stats.update(value);
    assert.equal(stats.count, 4);
    assert.equal(stats.mean, 12.75);
    assert.deepEqual(stats.mode, { modes: [20], count: 2 });
    assert.deepEqual(stats.streak.toFlagData(), { last: 20, count: 2 });
    assert.deepEqual(RollStats.fromFlagData(stats.toFlagData()).toFlagData(), stats.toFlagData());
    assert.throws(() => stats.update(21));
    stats.clear(); assert.equal(stats.count, 0);
});
test('chat hook tracks only own d20 rolls and respects hidden-roll settings', async () => {
    const roll = { dice: [{ faces: 20, results: [{ result: 12 }] }, { faces: 6, results: [{ result: 6 }] }] };
    const message = { id: 'message', isRoll: true, isContentVisible: false, blind: false, author: user, rolls: [roll], flags: {} };
    hooks.get('createChatMessage')(message);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(saved.histogram[11], 1);
    hooks.get('createChatMessage')({ ...message, author: other });
    hooks.get('createChatMessage')({ ...message, blind: true });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(saved.histogram[11], 1);
});
test('release ZIP contains runtime assets and the exact standalone manifest', () => {
    const sourceManifest = JSON.parse(readFileSync('module.json', 'utf8'));
    assert.equal(sourceManifest.download, `${sourceManifest.url}/releases/latest/download/roll-tracker.zip`);
    const files = unzipSync(readFileSync('release/roll-tracker.zip'));
    const manifestText = readFileSync('release/module.json', 'utf8');
    assert.equal(strFromU8(files['module.json']), manifestText);
    const manifest = JSON.parse(manifestText);
    for (const path of [...manifest.esmodules, ...manifest.styles, ...manifest.languages.map(l => l.path), 'templates/roll-tracker.hbs', 'templates/roll-tracker-chat.hbs']) assert.ok(files[path], path);
    assert.ok(!Object.keys(files).some(path => path.startsWith('src/') || path.startsWith('node_modules/')));
    assert.equal(manifest.manifest, 'https://github.com/dylanhart/roll-tracker/releases/latest/download/module.json');
    assert.equal(manifest.download, `https://github.com/dylanhart/roll-tracker/releases/download/v${manifest.version}/roll-tracker.zip`);
});

test('packager refuses a tag that does not match the manifest version', () => {
    const result = spawnSync(process.execPath, ['scripts/package.mjs'], {
        encoding: 'utf8', env: { ...process.env, GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v0.0.0' },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Release tag must match module version/);
});
