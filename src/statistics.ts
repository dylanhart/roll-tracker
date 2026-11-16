export interface StreakFlag {
    last: number | null;
    count: number;
}
export interface StatsFlag {
    histogram: number[];
    streak: StreakFlag;
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
    constructor() {
        this.histogram = new Array(20);
        this.clear();
    }

    static fromFlagData(flagData: StatsFlag) {
        const rollStats = new RollStats();
        rollStats.histogram = [...flagData.histogram];
        rollStats.streak = Streak.fromFlagData(flagData.streak);
        return rollStats;
    }

    toFlagData() {
        return {
            histogram: [...this.histogram],
            streak: this.streak.toFlagData(),
        };
    }

    update(number: number) {
        if (number < 1 || number > 20) {
            throw new Error(`Dice value out of range: ${number}`);
        }

        this.histogram[number - 1] += 1;
        this.streak.update(number);
    }

    clear() {
        this.histogram.fill(0, 0, 20);
        this.streak = new Streak(null, 0);
    }

    get count() {
        return this.histogram.reduce((acc, curr) => acc + curr, 0);
    }

    get nat1s() {
        return this.histogram[0];
    }

    get nat20s() {
        return this.histogram[19];
    }

    get sum() {
        return this.histogram.reduce((acc, curr, idx) => acc + curr * (idx + 1), 0);
    }

    get mean() {
        return this.count > 0 ? this.sum / this.count : 0;
    }

    get median() {
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
        if (this.count === 0) {
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
