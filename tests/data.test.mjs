import assert from 'node:assert/strict';
import { test } from 'node:test';
import { trackRolls, clearTrackedRolls } from '../src/data.ts';
import { trackMessage } from '../src/tracking.ts';

const tick = () => new Promise((resolve) => setImmediate(resolve));
const roll = (...values) => ({ dice: [{ faces: 20, results: values.map((result) => ({ result })) }] });
function storage(id) {
    let saved;
    const pending = [];
    const user = {
        id,
        isGM: false,
        getFlag: () => saved,
        setFlag: (_scope, _key, data) =>
            new Promise((resolve) => {
                pending.push(() => {
                    saved = data;
                    resolve(user);
                });
            }),
        unsetFlag: async () => {
            saved = undefined;
            return user;
        },
    };
    globalThis.game = { userId: id, user, settings: { get: () => false }, system: { id: 'generic' } };
    return {
        user,
        pending,
        get saved() {
            return saved;
        },
    };
}
const count = (state) => state.saved?.histogram.reduce((a, b) => a + b, 0) ?? 0;

test('multiple rolls in one message produce one atomic write', async () => {
    const state = storage('atomic');
    const write = trackRolls(state.user, [roll(1), roll(20)]);
    await tick();
    assert.equal(state.pending.length, 1);
    state.pending.shift()();
    await write;
    assert.equal(count(state), 2);
});
test('rapid messages are queued and read the preceding committed statistics', async () => {
    const state = storage('rapid');
    const first = trackRolls(state.user, [roll(5)]);
    const second = trackRolls(state.user, [roll(15)]);
    await tick();
    assert.equal(state.pending.length, 1);
    state.pending.shift()();
    await first;
    await tick();
    assert.equal(state.pending.length, 1);
    state.pending.shift()();
    await second;
    assert.equal(count(state), 2);
});
test('clear waits for outstanding writes and later rolls start from zero', async () => {
    const state = storage('clear');
    const first = trackRolls(state.user, [roll(5)]);
    const clear = clearTrackedRolls(state.user);
    const later = trackRolls(state.user, [roll(20)]);
    await tick();
    state.pending.shift()();
    await first;
    await clear;
    await tick();
    assert.equal(count(state), 0);
    state.pending.shift()();
    await later;
    assert.equal(count(state), 1);
    assert.equal(state.saved.histogram[19], 1);
});
test('a rejected write does not block later rolls', async () => {
    const state = storage('failure');
    const normalWrite = state.user.setFlag;
    state.user.setFlag = async () => {
        throw new Error('write failed');
    };
    await assert.rejects(trackRolls(state.user, [roll(2)]), /write failed/);
    state.user.setFlag = normalWrite;
    const later = trackRolls(state.user, [roll(20)]);
    await tick();
    state.pending.shift()();
    await later;
    assert.equal(count(state), 1);
});
test('system restrictions and hidden rolls are filtered before persistence', async () => {
    const state = storage('restrictions');
    game.system.id = 'pf2e';
    game.settings.get = (_scope, key) => key === 'restrict_counted_rolls';
    const message = {
        isRoll: true,
        author: state.user,
        blind: false,
        rolls: [roll(10)],
        getFlag: () => undefined,
    };
    await trackMessage(message);
    assert.equal(state.pending.length, 0);
    message.getFlag = () => ({ type: 'attack-roll' });
    const accepted = trackMessage(message);
    await tick();
    state.pending.shift()();
    await accepted;
    assert.equal(count(state), 1);
    await trackMessage({ ...message, blind: true });
    assert.equal(state.pending.length, 0);
    await trackMessage({ ...message, author: { ...state.user, id: 'other' } });
    assert.equal(state.pending.length, 0);
});
