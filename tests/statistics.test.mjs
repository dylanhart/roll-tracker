import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RollStats } from '../src/statistics.ts';

test('statistics retain the existing flag format and streak behavior', () => {
    const stats = new RollStats();
    for (const value of [1, 10, 20, 20]) stats.update(value);
    assert.equal(stats.count, 4);
    assert.equal(stats.mean, 12.75);
    assert.deepEqual(stats.mode, { modes: [20], count: 2 });
    assert.deepEqual(stats.streak.toFlagData(), { last: 20, count: 2 });
    assert.deepEqual(RollStats.fromFlagData(stats.toFlagData()).toFlagData(), stats.toFlagData());
    assert.throws(() => stats.update(21));
    stats.clear();
    assert.equal(stats.count, 0);
});

test('median averages the middle pair for even samples', () => {
    for (const [values, expected] of [
        [[1, 20], 10.5],
        [[1, 2, 19, 20], 10.5],
        [[3, 3], 3],
        [[1, 4, 20], 4],
        [[], 0],
    ]) {
        const stats = new RollStats();
        values.forEach((value) => stats.update(value));
        assert.equal(stats.median, expected);
    }
});
test('empty and cleared statistics have finite zero-height histogram bars', () => {
    const stats = new RollStats();
    assert.deepEqual(stats.percents, Array(20).fill(0));
    stats.update(10);
    stats.clear();
    assert.deepEqual(stats.percents, Array(20).fill(0));
});
