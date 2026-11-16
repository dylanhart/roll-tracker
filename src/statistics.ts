import type { DieFaces } from './dice';

export interface StreakFlag {
    last: number | null;
    count: number;
}
export interface StatsFlag {
    histogram: number[];
    streak: StreakFlag;
}

export interface D10000StatsFlag {
    version: 2;
    count: number;
    sum: number;
    nat1s: number;
    natMaxs: number;
    histogram: number[];
    lowest: number[];
    highest: number[];
    // Explicitly overwrite the old map during Foundry's recursive flag merge.
    counts: null;
}

export interface SparseStatsFlag {
    counts: Record<string, number>;
}

export class Streak {
    constructor(
        public last: number | null,
        public count: number,
    ) {}

    static fromFlagData(flagData: StreakFlag) {
        return new Streak(flagData.last, flagData.count);
    }

    toFlagData() {
        return {
            last: this.last,
            count: this.count,
        };
    }

    update(number: number) {
        if (number === this.last) {
            this.count += 1;
        } else {
            this.last = number;
            this.count = 1;
        }
    }

    clear() {
        this.last = null;
        this.count = 0;
    }
}

export class RollStats {
    histogram: number[];
    streak = new Streak(null, 0);
    private totalCount = 0;
    private totalSum = 0;
    private minimumCount = 0;
    private maximumCount = 0;
    private low: number[] = [];
    private high: number[] = [];
    constructor(public readonly faces: DieFaces = 20) {
        this.histogram = new Array(20);
        this.clear();
    }

    static fromFlagData(flagData: StatsFlag, faces: DieFaces = 20) {
        const rollStats = new RollStats(faces);
        rollStats.histogram = [...flagData.histogram];
        rollStats.streak = Streak.fromFlagData(flagData.streak);
        return rollStats;
    }

    static fromSparseFlagData(flagData: SparseStatsFlag) {
        const stats = new RollStats(10000);
        for (const [face, count] of Object.entries(flagData.counts)) {
            stats.addAggregate(Number(face), count);
        }
        return stats;
    }

    static fromBoundedFlagData(flag: D10000StatsFlag) {
        const stats = new RollStats(10000);
        const validInteger = (n: number) => Number.isSafeInteger(n) && n >= 0;
        const validResults = (values: number[]) =>
            Array.isArray(values) &&
            values.length <= 5 &&
            values.every((value) => Number.isInteger(value) && value >= 1 && value <= 10000);
        if (
            flag.version !== 2 ||
            ![flag.count, flag.sum, flag.nat1s, flag.natMaxs].every(validInteger) ||
            !Array.isArray(flag.histogram) ||
            flag.histogram.length !== 20 ||
            !flag.histogram.every(validInteger) ||
            flag.histogram.reduce((sum, count) => sum + count, 0) !== flag.count ||
            !validResults(flag.lowest) ||
            !validResults(flag.highest)
        ) {
            throw new Error('Invalid stored d10000 statistics');
        }
        stats.histogram = [...flag.histogram];
        stats.totalCount = flag.count;
        stats.totalSum = flag.sum;
        stats.minimumCount = flag.nat1s;
        stats.maximumCount = flag.natMaxs;
        stats.low = [...flag.lowest].sort((a, b) => a - b);
        stats.high = [...flag.highest].sort((a, b) => b - a);
        return stats;
    }

    toBoundedFlagData(): D10000StatsFlag {
        return {
            version: 2,
            count: this.count,
            sum: this.sum,
            nat1s: this.nat1s,
            natMaxs: this.natMaxs,
            histogram: [...this.histogram],
            lowest: [...this.low],
            highest: [...this.high],
            counts: null,
        };
    }

    private addAggregate(value: number, count: number): void {
        if (
            !Number.isInteger(value) ||
            value < 1 ||
            value > 10000 ||
            !Number.isSafeInteger(count) ||
            count < 0
        ) {
            throw new Error('Invalid d10000 result or count');
        }
        this.totalCount += count;
        this.totalSum += value * count;
        this.histogram[Math.floor((value - 1) / 500)] += count;
        if (value === 1) this.minimumCount += count;
        if (value === 10000) this.maximumCount += count;
        const candidates = new Array<number>(Math.min(5, count)).fill(value);
        this.low = [...this.low, ...candidates].sort((a, b) => a - b).slice(0, 5);
        this.high = [...this.high, ...candidates].sort((a, b) => b - a).slice(0, 5);
    }

    toFlagData() {
        return {
            histogram: [...this.histogram],
            streak: this.streak.toFlagData(),
        };
    }

    update(number: number) {
        if (!Number.isInteger(number) || number < 1 || number > this.faces) {
            throw new Error(`Dice value out of range: ${number}`);
        }

        if (this.faces === 10000) {
            this.addAggregate(number, 1);
        } else {
            this.histogram[number - 1] += 1;
            this.streak.update(number);
        }
    }

    clear() {
        this.histogram.fill(0);
        this.streak = new Streak(null, 0);
        this.totalCount = 0;
        this.totalSum = 0;
        this.minimumCount = 0;
        this.maximumCount = 0;
        this.low = [];
        this.high = [];
    }

    get count() {
        return this.faces === 10000 ? this.totalCount : this.histogram.reduce((acc, curr) => acc + curr, 0);
    }

    get nat1s() {
        return this.faces === 10000 ? this.minimumCount : this.histogram[0];
    }

    private extremes(descending: boolean): number[] {
        const values: number[] = [];
        for (let step = 0; step < this.faces && values.length < 5; step++) {
            const index = descending ? this.faces - step - 1 : step;
            const count = Math.min(this.histogram[index], 5 - values.length);
            values.push(...new Array<number>(count).fill(index + 1));
        }
        return values;
    }

    get lowest(): number[] {
        return this.faces === 10000 ? [...this.low] : this.extremes(false);
    }

    get highest(): number[] {
        return this.faces === 10000 ? [...this.high] : this.extremes(true);
    }

    get natMaxs() {
        return this.faces === 10000 ? this.maximumCount : this.histogram[19];
    }

    get nat20s() {
        return this.histogram[19];
    }

    get sum() {
        return this.faces === 10000
            ? this.totalSum
            : this.histogram.reduce((acc, curr, idx) => acc + curr * (idx + 1), 0);
    }

    get mean() {
        return this.count > 0 ? this.sum / this.count : 0;
    }

    get median() {
        if (this.faces === 10000) throw new Error('Exact d10000 median is not retained');
        if (this.count === 0) {
            return 0;
        }

        const lower = Math.floor((this.count - 1) / 2);
        const upper = Math.floor(this.count / 2);
        let position = 0;
        let lowerValue = 0;
        for (let i = 0; i < this.histogram.length; i++) {
            position += this.histogram[i];
            if (position > lower && lowerValue === 0) lowerValue = i + 1;
            if (position > upper) return (lowerValue + i + 1) / 2;
        }
        return 0;
    }

    get mode() {
        if (this.faces === 10000 || this.count === 0) {
            return {
                modes: [],
                count: 0,
            };
        }

        let modes: number[] = [];
        let count = 0;
        this.histogram.forEach((curr, idx) => {
            if (curr > count) {
                modes = [idx + 1];
                count = curr;
            } else if (curr === count) {
                modes.push(idx + 1);
            }
        });

        return { modes, count };
    }

    get percents() {
        const count = this.count;
        return this.histogram.map((n) => (count === 0 ? 0 : Math.floor((n / count) * 100)));
    }
}
