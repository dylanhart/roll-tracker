import { FLAGS, ID } from './config';
import { type DieFaces, isSupportedDie, SUPPORTED_DICE } from './dice';
import { RollStats, type SparseStatsFlag, type StatsFlag } from './statistics';

// Reading inside the queue ensures each operation sees the preceding committed write.
const writes = new Map<string, Promise<void>>();
function enqueue(user: User, operation: () => Promise<void>): Promise<void> {
    const next = (writes.get(user.id) ?? Promise.resolve()).then(operation);
    // A failed write must not prevent later rolls from being saved.
    const settled = next.catch(() => {});
    writes.set(user.id, settled);
    void settled.then(() => {
        if (writes.get(user.id) === settled) writes.delete(user.id);
    });
    return next;
}

function flagKey(faces: DieFaces): string {
    return faces === 20 ? FLAGS.ROLL_STATS : FLAGS.D10000_STATS;
}

export function readUserStats(user: User, faces: DieFaces = 20): RollStats {
    const flagData = user.getFlag(ID, flagKey(faces));
    if (flagData == null) return new RollStats(faces);
    return faces === 20
        ? RollStats.fromFlagData(flagData as StatsFlag)
        : RollStats.fromSparseFlagData(flagData as SparseStatsFlag, faces);
}

export function clearTrackedRolls(user: User, faces: DieFaces = 20): Promise<void> {
    return enqueue(user, async () => {
        await user.unsetFlag(ID, flagKey(faces));
    });
}

export function trackRolls(
    user: User,
    rolls: readonly Roll[],
    allowedFaces: readonly DieFaces[] = SUPPORTED_DICE,
): Promise<void> {
    if (game.userId !== user.id) return Promise.resolve();
    const results = new Map<DieFaces, number[]>();
    for (const roll of rolls) {
        for (const die of roll.dice) {
            if (!isSupportedDie(die.faces) || !allowedFaces.includes(die.faces)) continue;
            const values = results.get(die.faces) ?? [];
            values.push(...die.results.map((result) => result.result));
            if (values.length) results.set(die.faces, values);
        }
    }
    if (results.size === 0) return Promise.resolve();
    return enqueue(user, async () => {
        for (const [faces, values] of results) {
            const stats = readUserStats(user, faces);
            for (const value of values) stats.update(value);
            await user.setFlag(
                ID,
                flagKey(faces),
                faces === 20 ? stats.toFlagData() : stats.toSparseFlagData(),
            );
        }
    });
}
