import { ID, SETTINGS } from './config';

export function registerSettings(): void {
    // A setting to toggle whether the GM can see the icon allowing them access to player roll
    // data or not
    game.settings.register(ID, SETTINGS.GM_SEE_PLAYERS, {
        name: `ROLL-TRACKER.settings.${SETTINGS.GM_SEE_PLAYERS}.Name`,
        default: true,
        type: Boolean,
        scope: 'world',
        config: true,
        hint: `ROLL-TRACKER.settings.${SETTINGS.GM_SEE_PLAYERS}.Hint`,
        onChange: () => ui.players.render(),
    });

    // A setting to determine whether players can see their own tracked rolls
    game.settings.register(ID, SETTINGS.PLAYERS_SEE_PLAYERS, {
        name: `ROLL-TRACKER.settings.${SETTINGS.PLAYERS_SEE_PLAYERS}.Name`,
        default: true,
        type: Boolean,
        scope: 'world',
        config: true,
        hint: `ROLL-TRACKER.settings.${SETTINGS.PLAYERS_SEE_PLAYERS}.Hint`,
        onChange: () => ui.players.render(),
    });

    // A setting to determine whether blind GM rolls that PLAYERS make are tracked
    // Blind GM rolls that GMs make are always tracked
    game.settings.register(ID, SETTINGS.COUNT_HIDDEN, {
        name: `ROLL-TRACKER.settings.${SETTINGS.COUNT_HIDDEN}.Name`,
        default: true,
        type: Boolean,
        scope: 'world',
        config: true,
        hint: `ROLL-TRACKER.settings.${SETTINGS.COUNT_HIDDEN}.Hint`,
    });

    // Are streaks completely disabled, are they shown only to GMs, or are they shown to everyone
    game.settings.register(ID, SETTINGS.STREAK_BEHAVIOUR, {
        name: `ROLL-TRACKER.settings.${SETTINGS.STREAK_BEHAVIOUR}.Name`,
        default: true,
        type: String,
        scope: 'world',
        config: true,
        hint: `ROLL-TRACKER.settings.${SETTINGS.STREAK_BEHAVIOUR}.Hint`,
        choices: {
            hidden: game.i18n.localize(`ROLL-TRACKER.settings.${SETTINGS.STREAK_BEHAVIOUR}.hidden`),
            disable: game.i18n.localize(`ROLL-TRACKER.settings.${SETTINGS.STREAK_BEHAVIOUR}.disable`),
            shown: game.i18n.localize(`ROLL-TRACKER.settings.${SETTINGS.STREAK_BEHAVIOUR}.shown`),
        },
    });

    // What is the threshold of consecutive rolls within 1 point of each other that should be considered
    // a streak?
    game.settings.register(ID, SETTINGS.STREAK_THRESHOLD, {
        name: `ROLL-TRACKER.settings.${SETTINGS.STREAK_THRESHOLD}.Name`,
        default: true,
        type: Number,
        range: {
            min: 2,
            max: 5,
            step: 1,
        },
        scope: 'world',
        config: true,
        hint: `ROLL-TRACKER.settings.${SETTINGS.STREAK_THRESHOLD}.Hint`,
    });

    // System specific settings
    switch (game.system.id) {
        case 'dnd5e':
            // A setting to specify that only rolls connected to an actor will be counted, not just
            // random '/r 1d20s' or the like
            game.settings.register(ID, SETTINGS.DND5E.RESTRICT_COUNTED_ROLLS, {
                name: `ROLL-TRACKER.settings.dnd5e.${SETTINGS.DND5E.RESTRICT_COUNTED_ROLLS}.Name`,
                default: true,
                type: Boolean,
                scope: 'world',
                config: true,
                hint: `ROLL-TRACKER.settings.dnd5e.${SETTINGS.DND5E.RESTRICT_COUNTED_ROLLS}.Hint`,
            });
            break;
        case 'pf2e':
            // A setting to specify that only rolls connected to an actor will be counted, not just
            // random '/r 1d20s' or the like
            game.settings.register(ID, SETTINGS.PF2E.RESTRICT_COUNTED_ROLLS, {
                name: `ROLL-TRACKER.settings.pf2e.${SETTINGS.PF2E.RESTRICT_COUNTED_ROLLS}.Name`,
                default: true,
                type: Boolean,
                scope: 'world',
                config: true,
                hint: `ROLL-TRACKER.settings.pf2e.${SETTINGS.PF2E.RESTRICT_COUNTED_ROLLS}.Hint`,
            });
            break;
    }
}
