import { readUserStats } from './data';

export function getLedgerContext(user: User) {
    const stats = readUserStats(user);
    const format = new Intl.NumberFormat(game.i18n.lang, { maximumFractionDigits: 2 });
    const max = Math.max(...stats.histogram);
    const mode = stats.mode;
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
        user: user,
        stats,
        summary: {
            count: format.format(stats.count),
            totalText,
            modeText,
            streakText,
            mean: format.format(stats.mean),
            median: format.format(stats.median),
            nat1s: format.format(stats.nat1s),
            nat20s: format.format(stats.nat20s),
            modeCount: format.format(stats.mode.count),
            streakCount: format.format(stats.streak.count),
        },
        histogram: stats.histogram.map((count, index) => ({
            face: index + 1,
            count,
            percent: format.format(stats.count === 0 ? 0 : (count / stats.count) * 100),
            height: max === 0 ? 0 : (count / max) * 100,
            showLabel: [0, 4, 9, 14, 19].includes(index),
        })),
    };
}
