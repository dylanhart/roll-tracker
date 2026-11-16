import { ID, SETTINGS } from './config';
import { trackRolls } from './data';
import { SUPPORTED_DICE } from './dice';

function hasType(value: unknown): boolean {
    return typeof value === 'object' && value !== null && 'type' in value && Boolean(value.type);
}

export async function trackMessage(message: ChatMessage): Promise<void> {
    if (!message.isRoll || !message.author || message.author.id !== game.userId) return;
    if (message.blind && !game.settings.get(ID, SETTINGS.COUNT_HIDDEN) && !message.author.isGM) return;
    const system = game.system.id;
    const restrictD20 =
        (system === 'dnd5e' || system === 'pf2e') &&
        game.settings.get(ID, SETTINGS.DND5E.RESTRICT_COUNTED_ROLLS) &&
        !hasType(message.getFlag(system, system === 'dnd5e' ? 'roll' : 'context'));
    // d10000 table rolls do not need an actor-linked system check.
    await trackRolls(message.author, message.rolls, restrictD20 ? [10000] : SUPPORTED_DICE);
}

export function reportTrackingError(error: unknown): void {
    console.error('Roll Tracker: failed to save roll statistics', error);
    ui.notifications.error('ROLL-TRACKER.errors.save', { localize: true });
}
