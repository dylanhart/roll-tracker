import { readUserStats } from './data';
import { type DieFaces, SUPPORTED_DICE } from './dice';

export function getLedgerContext(user: User, faces: DieFaces = 20) {
    const stats = readUserStats(user, faces);
    const format = new Intl.NumberFormat(game.i18n.lang, { maximumFractionDigits: 2 });
    const binSize = faces / 20;
    const bins = Array.from({ length: 20 }, (_, index) => {
        const start = index * binSize + 1;
        const end = (index + 1) * binSize;
        const count = stats.histogram.slice(start - 1, end).reduce((sum, n) => sum + n, 0);
        return { start, end, count };
    });
    const max = Math.max(...bins.map((bin) => bin.count));
    const compact = new Intl.NumberFormat(game.i18n.lang, { notation: 'compact', maximumFractionDigits: 1 });
    const mode = faces === 20 ? stats.mode : { modes: [], count: 0 };
    const number = (count: number) => format.format(count);
    const totalText = game.i18n.format(`ROLL-TRACKER.summary.total.${stats.count === 1 ? 'one' : 'many'}`, {
        count: number(stats.count),
    });
    const modeText =
        stats.count === 0
            ? game.i18n.localize('ROLL-TRACKER.summary.empty')
            : game.i18n.format(
                  `ROLL-TRACKER.summary.mode.${mode.modes.length > 1 ? 'tied' : 'single'}.${mode.count === 1 ? 'one' : 'many'}`,
                  {
                      count: number(mode.count),
                  },
              );
    const streakText =
        stats.streak.count === 0
            ? game.i18n.localize('ROLL-TRACKER.summary.empty')
            : game.i18n.format(`ROLL-TRACKER.summary.streak.${stats.streak.count === 1 ? 'one' : 'many'}`, {
                  count: number(stats.streak.count),
                  value: number(stats.streak.last ?? 0),
              });
    return {
        user,
        stats,
        dieLabel: `d${faces}`,
        isLargeDie: faces === 10000,
        dieTypes: SUPPORTED_DICE.map((value) => ({
            faces: value,
            label: `d${value}`,
            selected: value === faces,
        })),
        maximumLabel: game.i18n.format('ROLL-TRACKER.form-label.nat-max', { faces: number(faces) }),
        histogramUnit:
            faces === 20
                ? game.i18n.localize('ROLL-TRACKER.form-label.d20-face')
                : game.i18n.format('ROLL-TRACKER.form-label.bin-size', { size: number(binSize) }),
        summary: {
            count: format.format(stats.count),
            totalText,
            modeText,
            streakText,
            mean: format.format(stats.mean),
            median: format.format(stats.median),
            nat1s: format.format(stats.nat1s),
            natMaxs: format.format(stats.natMaxs),
            lowestValues: stats.lowest.map((value) => number(value)),
            highestValues: stats.highest.map((value) => number(value)),
            modeValues: mode.modes.map((value) => number(value)),
            modeCount: format.format(mode.count),
            streakCount: format.format(stats.streak.count),
        },
        histogram: bins.map(({ start, end, count }, index) => ({
            label: start === end ? number(start) : `${number(start)}–${number(end)}`,
            tick: faces === 20 ? number(start) : index === 0 ? '1' : compact.format(end),
            count,
            percent: format.format(stats.count === 0 ? 0 : (count / stats.count) * 100),
            height: max === 0 ? 0 : (count / max) * 100,
            showLabel: [0, 4, 9, 14, 19].includes(index),
        })),
    };
}
