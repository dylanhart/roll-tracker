import { ID, FLAGS } from './config';
import { RollStats, type StatsFlag } from './statistics';

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

export function readUserStats(user: User): RollStats {
    const flagData = user.getFlag(ID, FLAGS.ROLL_STATS);
    return flagData == null ? new RollStats() : RollStats.fromFlagData(flagData as StatsFlag);
}

export function clearTrackedRolls(user: User): Promise<void> {
    return enqueue(user, async () => {
        await user.unsetFlag(ID, FLAGS.ROLL_STATS);
    });
}

export function trackRolls(user: User, rolls: readonly Roll[]): Promise<void> {
    if (game.userId !== user.id) return Promise.resolve();
    // All d20s in one chat message are committed together.
    const results = rolls.flatMap((roll) =>
        roll.dice
            .filter((die) => die.faces === 20)
            .flatMap((die) => die.results.map((result) => result.result)),
    );
    if (results.length === 0) return Promise.resolve();
    return enqueue(user, async () => {
        const stats = readUserStats(user);
        for (const result of results) stats.update(result);
        await user.setFlag(ID, FLAGS.ROLL_STATS, stats.toFlagData());
    });
}
