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
        values.forEach((value) => {
            stats.update(value);
        });
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

test('d10000 statistics compute exact values and extrema with repeated rolls', () => {
    const stats = new RollStats(10000);
    for (const value of [10000, 1, 1, 2, 9999, 5000, 5000, 5000]) stats.update(value);
    assert.equal(stats.count, 8);
    assert.equal(stats.sum, 35003);
    assert.equal(stats.mean, 4375.375);
    assert.throws(() => stats.median, /not retained/);
    assert.deepEqual(stats.lowest, [1, 1, 2, 5000, 5000]);
    assert.deepEqual(stats.highest, [10000, 9999, 5000, 5000, 5000]);
    assert.deepEqual(stats.streak.toFlagData(), { last: null, count: 0 });
    const flag = stats.toBoundedFlagData();
    assert.equal(flag.counts, null);
    assert.equal(flag.histogram.length, 20);
    assert.equal(flag.count, 8);
    assert.equal(flag.sum, 35003);
    assert.deepEqual(RollStats.fromBoundedFlagData(flag).toBoundedFlagData(), flag);
    for (const invalid of [0, 10001, 1.5, NaN, Infinity]) assert.throws(() => stats.update(invalid));
    stats.clear();
    assert.equal(stats.count, 0);
    assert.deepEqual(stats.lowest, []);
    assert.deepEqual(stats.highest, []);
});

test('d10000 storage remains bounded after every possible result and further duplicates', () => {
    const stats = new RollStats(10000);
    for (let value = 1; value <= 10000; value++) stats.update(value);
    for (let i = 0; i < 10000; i++) stats.update(1);
    const flag = stats.toBoundedFlagData();
    assert.equal(stats.histogram.length, 20);
    assert.equal(flag.histogram.length, 20);
    assert.equal(flag.lowest.length, 5);
    assert.equal(flag.highest.length, 5);
    assert.equal(flag.count, 20000);
    assert.equal(flag.counts, null);
    assert.equal(flag.nat1s, 10001);
    assert.deepEqual(flag.lowest, [1, 1, 1, 1, 1]);
    assert.deepEqual(flag.highest, [10000, 9999, 9998, 9997, 9996]);
    assert.ok(JSON.stringify(flag).length < 512);
});
