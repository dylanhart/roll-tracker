export const ID = 'roll-tracker';

export const FLAGS = {
    ROLL_STATS: 'roll-stats',
    D10000_STATS: 'roll-stats-d10000',
};

export const TEMPLATES = {
    ROLLTRACK: `modules/${ID}/templates/${ID}.hbs`,
    CHATMSG: `modules/${ID}/templates/${ID}-chat.hbs`,
};

export const SETTINGS = {
    GM_SEE_PLAYERS: 'gm_see_players',
    PLAYERS_SEE_PLAYERS: 'players_see_players',
    COUNT_HIDDEN: 'count_hidden',
    STREAK_MESSAGE_HIDDEN: 'streak_message_hidden',
    STREAK_BEHAVIOUR: 'streak_behaviour',
    STREAK_THRESHOLD: 'streak_threshold',
    DND5E: {
        RESTRICT_COUNTED_ROLLS: 'restrict_counted_rolls',
    },
    PF2E: {
        RESTRICT_COUNTED_ROLLS: 'restrict_counted_rolls',
    },
};
