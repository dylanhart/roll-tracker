import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clearTrackedRolls, compactD10000Stats, readUserStats, trackRolls } from '../src/data.ts';
import { trackMessage } from '../src/tracking.ts';

const tick = () => new Promise((resolve) => setImmediate(resolve));
const roll = (...values) => ({ dice: [{ faces: 20, results: values.map((result) => ({ result })) }] });
function storage(id) {
    const flags = new Map();
    const pending = [];
    const user = {
        id,
        isGM: false,
        getFlag: (_scope, key) => flags.get(key),
        setFlag: (_scope, key, data) =>
            new Promise((resolve) => {
                pending.push(() => {
                    flags.set(key, { ...flags.get(key), ...data });
                    resolve(user);
                });
            }),
        unsetFlag: async (_scope, key) => {
            flags.delete(key);
            return user;
        },
    };
    globalThis.game = { userId: id, user, settings: { get: () => false }, system: { id: 'generic' } };
    return {
        user,
        pending,
        flags,
        get savedLarge() {
            return flags.get('roll-stats-d10000');
        },
        get saved() {
            return flags.get('roll-stats');
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

async function finishWrites(state, promise) {
    let finished = false;
    let error;
    const completion = promise.then(
        () => {
            finished = true;
        },
        (failure) => {
            error = failure;
            finished = true;
        },
    );
    for (let step = 0; step < 20 && !finished; step++) {
        await tick();
        while (state.pending.length) state.pending.shift()();
    }
    assert.ok(finished, 'Writes did not complete');
    await completion;
    if (error) throw error;
}
const largeRoll = (...values) => ({
    dice: [{ faces: 10000, results: values.map((result) => ({ result })) }],
});

test('mixed dice messages retain separate d20 and bounded d10000 statistics', async () => {
    const state = storage('mixed-dice');
    await finishWrites(state, trackRolls(state.user, [roll(20), largeRoll(1, 10000, 10000)]));
    assert.equal(count(state), 1);
    assert.equal(state.savedLarge.count, 3);
    assert.equal(state.savedLarge.sum, 20001);
    assert.equal(state.savedLarge.counts, null);
    assert.equal(state.savedLarge.histogram.length, 20);
    const large = readUserStats(state.user, 10000);
    assert.equal(large.count, 3);
    assert.equal(large.nat1s, 1);
    assert.equal(large.natMaxs, 2);
    assert.deepEqual(large.lowest, [1, 10000, 10000]);
    assert.equal(state.saved.streak.last, 20);
});
test('d10000 writes and clears preserve legacy d20 data exactly', async () => {
    const state = storage('legacy-preservation');
    const legacy = { histogram: Array(20).fill(0), streak: { last: 7, count: 2 } };
    legacy.histogram[6] = 2;
    state.flags.set('roll-stats', legacy);
    await finishWrites(state, trackRolls(state.user, [largeRoll(1, 9999)]));
    assert.deepEqual(state.saved, legacy);
    assert.equal(readUserStats(state.user).count, 2);
    await clearTrackedRolls(state.user, 10000);
    assert.equal(state.savedLarge, undefined);
    assert.deepEqual(state.saved, legacy);
    await finishWrites(state, trackRolls(state.user, [largeRoll(10000)]));
    await clearTrackedRolls(state.user);
    assert.equal(state.saved, undefined);
    assert.equal(state.savedLarge.counts, null);
    assert.equal(state.savedLarge.histogram[19], 1);
});
test('rapid mixed messages serialize both die types without losing results', async () => {
    const state = storage('rapid-mixed');
    const writes = [
        trackRolls(state.user, [largeRoll(10000), roll(1)]),
        trackRolls(state.user, [roll(20), largeRoll(2, 2)]),
    ];
    await finishWrites(state, Promise.all(writes));
    assert.equal(count(state), 2);
    assert.equal(readUserStats(state.user, 10000).count, 3);
    assert.deepEqual(readUserStats(state.user, 10000).highest, [10000, 2, 2]);
});
test('manual d10000 rolls count under actor-link filtering while unlinked d20s do not', async () => {
    const state = storage('manual-large');
    game.system.id = 'pf2e';
    game.settings.get = (_scope, key) => key === 'restrict_counted_rolls';
    const message = {
        isRoll: true,
        author: state.user,
        blind: false,
        getFlag: () => undefined,
        rolls: [largeRoll(5000), roll(20)],
    };
    await finishWrites(state, trackMessage(message));
    assert.equal(state.saved, undefined);
    assert.equal(state.savedLarge.counts, null);
    assert.equal(state.savedLarge.histogram[9], 1);
    await trackMessage({ ...message, blind: true });
    assert.equal(state.pending.length, 0);
    assert.equal(readUserStats(state.user, 10000).count, 1);
});

test('existing per-result data is compacted and the old map is overwritten during flag merging', async () => {
    const state = storage('compact-existing');
    const counts = Object.fromEntries(Array.from({ length: 10000 }, (_, i) => [i + 1, 1]));
    state.flags.set('roll-stats-d10000', { counts });
    const d20 = { histogram: Array(20).fill(0), streak: { last: null, count: 0 } };
    state.flags.set('roll-stats', d20);
    await finishWrites(state, compactD10000Stats(state.user));
    assert.equal(state.savedLarge.counts, null);
    assert.equal(state.savedLarge.version, 2);
    assert.equal(state.savedLarge.count, 10000);
    assert.equal(state.savedLarge.histogram.length, 20);
    assert.ok(state.savedLarge.histogram.every((count) => count === 500));
    assert.deepEqual(state.savedLarge.lowest, [1, 2, 3, 4, 5]);
    assert.deepEqual(state.savedLarge.highest, [10000, 9999, 9998, 9997, 9996]);
    assert.equal(readUserStats(state.user, 10000).mean, 5000.5);
    assert.ok(JSON.stringify(state.savedLarge).length < 512);
    assert.deepEqual(state.saved, d20);
    await compactD10000Stats(state.user);
    assert.equal(state.pending.length, 0);
});
