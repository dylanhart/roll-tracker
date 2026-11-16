import type { TrackerUser, TrackerRoll, TrackerMessage, StatsFlag, StreakFlag, JQueryElement, ClickEvent } from './foundry';

// Whenever a chat message is created, check if it contains a roll. If so, parse it to determine
// whether it should be tracked, according to our module settings
Hooks.on('createChatMessage', (chatMessage) => {
    if (chatMessage.isRoll) {
        RollTracker.parseMessage(chatMessage, RollTracker.SYSTEM)
    }
})

// This adds our icon to the player list
Hooks.on('renderPlayers', (_app, element) => {
    const insertRollTrackerButton = (user: TrackerUser) => {
        const row = element.querySelector(`[data-user-id="${user.id}"]`);
        if (!row || row.querySelector('.roll-tracker-item-button')) return;

        const button = document.createElement('button');
        button.type = 'button';
        button.title = game.i18n.localize('ROLL-TRACKER.button-title');
        button.className = 'roll-tracker-item-button flex0';
        button.innerHTML = '<i class="fas fa-dice-d20"></i>';
        button.addEventListener('click', () => new RollTrackerDialog(user).render(true));
        row.append(button);
    };

    if (game.user.isGM && game.settings.get(RollTracker.ID, RollTracker.SETTINGS.GM_SEE_PLAYERS)) {
        for (const user of game.users) insertRollTrackerButton(user);
    } else if (game.user.isGM || game.settings.get(RollTracker.ID, RollTracker.SETTINGS.PLAYERS_SEE_PLAYERS)) {
        insertRollTrackerButton(game.user);
    }
});

// Initialize dialog and settings on foundry boot up
Hooks.once('init', () => {
    RollTracker.initialize()
})

Handlebars.registerHelper("indexToOrdinal", (value, _options) => {
    return parseInt(String(value)) + 1;
});

// Store basic module info
class RollTracker {
    static SYSTEM: string;
    static ID = 'roll-tracker'

    static FLAGS = {
        ROLL_STATS: 'roll-stats',
    }

    static TEMPLATES = {
        ROLLTRACK: `modules/${this.ID}/templates/${this.ID}.hbs`,
        CHATMSG: `modules/${this.ID}/templates/${this.ID}-chat.hbs`,
    }

    static SETTINGS = {
        GM_SEE_PLAYERS: 'gm_see_players',
        PLAYERS_SEE_PLAYERS: 'players_see_players',
        COUNT_HIDDEN: 'count_hidden',
        STREAK_MESSAGE_HIDDEN: 'streak_message_hidden',
        STREAK_BEHAVIOUR: 'streak_behaviour',
        STREAK_THRESHOLD: 'streak_threshold',
        DND5E: {
            RESTRICT_COUNTED_ROLLS: 'restrict_counted_rolls'
        },
        PF2E: {
            RESTRICT_COUNTED_ROLLS: 'restrict_counted_rolls'
        }
    }

    static initialize() {
        // Store the current system, for settings purposes. It has to be set here, and not in the parent
        // class, because the system needs to initialize on foundry boot up before we can get its id
        this.SYSTEM = `${game.system.id}`

        // A setting to toggle whether the GM can see the icon allowing them access to player roll
        // data or not
        game.settings.register(this.ID, this.SETTINGS.GM_SEE_PLAYERS, {
            name: `ROLL-TRACKER.settings.${this.SETTINGS.GM_SEE_PLAYERS}.Name`,
            default: true,
            type: Boolean,
            scope: 'world',
            config: true,
            hint: `ROLL-TRACKER.settings.${this.SETTINGS.GM_SEE_PLAYERS}.Hint`,
            onChange: () => ui.players.render()
        })

        // A setting to determine whether players can see their own tracked rolls
        game.settings.register(this.ID, this.SETTINGS.PLAYERS_SEE_PLAYERS, {
            name: `ROLL-TRACKER.settings.${this.SETTINGS.PLAYERS_SEE_PLAYERS}.Name`,
            default: true,
            type: Boolean,
            scope: 'world',
            config: true,
            hint: `ROLL-TRACKER.settings.${this.SETTINGS.PLAYERS_SEE_PLAYERS}.Hint`,
            onChange: () => ui.players.render()
        })

        // A setting to determine whether blind GM rolls that PLAYERS make are tracked
        // Blind GM rolls that GMs make are always tracked
        game.settings.register(this.ID, this.SETTINGS.COUNT_HIDDEN, {
            name: `ROLL-TRACKER.settings.${this.SETTINGS.COUNT_HIDDEN}.Name`,
            default: true,
            type: Boolean,
            scope: 'world',
            config: true,
            hint: `ROLL-TRACKER.settings.${this.SETTINGS.COUNT_HIDDEN}.Hint`,
        })

        // Are streaks completely disabled, are they shown only to GMs, or are they shown to everyone
        game.settings.register(this.ID, this.SETTINGS.STREAK_BEHAVIOUR, {
            name: `ROLL-TRACKER.settings.${this.SETTINGS.STREAK_BEHAVIOUR}.Name`,
            default: true,
            type: String,
            scope: 'world',
            config: true,
            hint: `ROLL-TRACKER.settings.${this.SETTINGS.STREAK_BEHAVIOUR}.Hint`,
            choices: {
                hidden: game.i18n.localize(`ROLL-TRACKER.settings.${this.SETTINGS.STREAK_BEHAVIOUR}.hidden`),
                disable: game.i18n.localize(`ROLL-TRACKER.settings.${this.SETTINGS.STREAK_BEHAVIOUR}.disable`),
                shown: game.i18n.localize(`ROLL-TRACKER.settings.${this.SETTINGS.STREAK_BEHAVIOUR}.shown`)
            }
        })

        // What is the threshold of consecutive rolls within 1 point of each other that should be considered
        // a streak?
        game.settings.register(this.ID, this.SETTINGS.STREAK_THRESHOLD, {
            name: `ROLL-TRACKER.settings.${this.SETTINGS.STREAK_THRESHOLD}.Name`,
            default: true,
            type: Number,
            range: {
                min: 2,
                max: 5,
                step: 1
            },
            scope: 'world',
            config: true,
            hint: `ROLL-TRACKER.settings.${this.SETTINGS.STREAK_THRESHOLD}.Hint`
        })

        // System specific settings
        switch (this.SYSTEM) {
            case 'dnd5e':
                // A setting to specify that only rolls connected to an actor will be counted, not just
                // random '/r 1d20s' or the like
                game.settings.register(this.ID, this.SETTINGS.DND5E.RESTRICT_COUNTED_ROLLS, {
                    name: `ROLL-TRACKER.settings.dnd5e.${this.SETTINGS.DND5E.RESTRICT_COUNTED_ROLLS}.Name`,
                    default: true,
                    type: Boolean,
                    scope: 'world',
                    config: true,
                    hint: `ROLL-TRACKER.settings.dnd5e.${this.SETTINGS.DND5E.RESTRICT_COUNTED_ROLLS}.Hint`,
                })
                break;
            case 'pf2e':
                // A setting to specify that only rolls connected to an actor will be counted, not just
                // random '/r 1d20s' or the like
                game.settings.register(this.ID, this.SETTINGS.PF2E.RESTRICT_COUNTED_ROLLS, {
                    name: `ROLL-TRACKER.settings.pf2e.${this.SETTINGS.PF2E.RESTRICT_COUNTED_ROLLS}.Name`,
                    default: true,
                    type: Boolean,
                    scope: 'world',
                    config: true,
                    hint: `ROLL-TRACKER.settings.pf2e.${this.SETTINGS.PF2E.RESTRICT_COUNTED_ROLLS}.Hint`,
                })
                break;
        }
    }

    // This function creates an object containing all the requirements that need to be met for the roll
    // to be counted, taking into account all the currently active settings. If all of the conditions are
    // met, the roll is recorded.
    static async parseMessage(chatMessage: TrackerMessage, system: string) {
        // Wait for 3d dice
        if (chatMessage.isContentVisible) {
            await RollTrackerHelper.waitFor3DDiceMessage(chatMessage.id);
        }

        const countHidden = game.settings.get(this.ID, this.SETTINGS.COUNT_HIDDEN);

        chatMessage.rolls.forEach(roll => {
            const isBlind = chatMessage.blind
            const rollRequirements: Record<string, boolean> = {
                blindCheck: (!isBlind || Boolean(countHidden) || chatMessage.author.isGM),
            }
            switch (system) {
                case 'dnd5e':
                    if (game.settings.get(this.ID, this.SETTINGS.DND5E.RESTRICT_COUNTED_ROLLS)) {
                        if (chatMessage.flags.dnd5e?.roll?.type) {
                            rollRequirements.dnd5e_restrict_passed = true
                        } else {
                            rollRequirements.dnd5e_restrict_passed = false
                        }
                    }
                    break;
                case 'pf2e':
                    if (game.settings.get(this.ID, this.SETTINGS.PF2E.RESTRICT_COUNTED_ROLLS)) {
                        if (chatMessage.flags.pf2e?.context?.type) {
                            rollRequirements.pf2e_restrict_passed = true
                        } else {
                            rollRequirements.pf2e_restrict_passed = false
                        }
                    }
                    break;
            }
            const checksPassed = Object.values(rollRequirements).every(check => {
                return check === true
            })

            if (checksPassed) {
                RollTrackerData.createTrackedRoll(chatMessage.author, roll, isBlind)
            }
        });
    }
}

class RollTrackerHelper {
    // Functions that don't specifically manipulate data but are referenced or used
    // If Dice So Nice is enabled, this will help us wait until after the animation is shown
    // to send chat messages such as the Streak chat message, so we don't ruin the surprise of
    // the roll
    static async waitFor3DDiceMessage(targetMessageId: string) {
        function buildHook(resolve: (value: boolean) => void) {
            Hooks.once('diceSoNiceRollComplete', (messageId) => {
                if (targetMessageId === messageId)
                    resolve(true);
                else
                    buildHook(resolve)
            });
        }
        return new Promise<boolean>((resolve) => {
            if (game.dice3d) {
                buildHook(resolve);
            } else {
                resolve(true);
            }
        });
    }
}

class Streak {
    constructor(public last: number | null, public count: number) {
        this.last = last;
        this.count = count;
    }

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
        if (number == this.last) {
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
        let rollStats = new RollStats();
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
            throw new Error("Dice value out of range: " + number);
        }

        this.histogram[number-1] += 1;
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
        return this.histogram.reduce((acc, curr, idx) => acc + (curr * (idx + 1)), 0);
    }

    get mean() {
        return this.count > 0 ? this.sum / this.count : 0;
    }

    get median() {
        if (this.count == 0) {
            return 0;
        }

        const mid = this.count / 2;

        let pos = 0;
        for (let i = 0; i < 20; i++) {
            pos += this.histogram[i];
            if (pos >= mid) {
                return i + 1;
            }
        }
    }

    get mode() {
        if (this.count == 0) {
            return {
                modes: [],
                count: 0
            };
        }

        let modes: number[] = [];
        let count = 0;
        this.histogram.forEach((curr, idx) => {
            if (curr > count) {
                modes = [idx + 1];
                count = curr
            } else if (curr == count) {
                modes.push(idx + 1);
            }
        });

        return { modes, count };
    }

    get percents() {
        const count = this.count;
        return this.histogram.map(n => Math.floor(n / count * 100));
    }
}

class RollTrackerData {
    // Our main data workhorse class
    static readUserStats(user: TrackerUser) {
        const flagData = user.getFlag(RollTracker.ID, RollTracker.FLAGS.ROLL_STATS);
        if (flagData == null) {
            return new RollStats();
        }
        return RollStats.fromFlagData(flagData);
    }

    static async writeUserStats(user: TrackerUser, rollStats: RollStats) {
        const flagData = rollStats.toFlagData();
        return await user.setFlag(RollTracker.ID, RollTracker.FLAGS.ROLL_STATS, flagData);
    }

    static async clearTrackedRolls(user: TrackerUser) {
        return await user.unsetFlag(RollTracker.ID, RollTracker.FLAGS.ROLL_STATS);
    }

    static async createTrackedRoll(user: TrackerUser, roll: TrackerRoll, _isBlind: boolean) {
        // We are running client-side, so we should only update our own roll data.
        if (game.userId !== user.id) {
            return;
        }

        const stats = this.readUserStats(user);

        roll.dice.forEach(die => {
            if (die.faces != 20) {
                return;
            }

            die.results.forEach(res => stats.update(res.result));
        });

        user = await this.writeUserStats(user, stats);
    }
}

class RollTrackerDialog extends foundry.appv1.api.FormApplication {
    constructor(user: TrackerUser, options = {}) {
        // the first argument is the object, the second are the options
        super(user, options)
    }

    static get defaultOptions() {
        const defaults = super.defaultOptions
        const overrides = {
            height: 'auto',
            id: 'roll-tracker',
            template: RollTracker.TEMPLATES.ROLLTRACK,
            title: 'Roll Tracker',
        }
        const mergedOptions = foundry.utils.mergeObject(defaults, overrides);
        return mergedOptions
    }

    async getData() {
        return {
            user: this.object,
            stats: RollTrackerData.readUserStats(this.object),
        };
    }

    activateListeners(html: JQueryElement) {
        super.activateListeners(html);

        const clickHandler = this._handleButtonClick.bind(this);
        html.on("click", "[data-action]", clickHandler);
    }

    async _handleButtonClick(event: ClickEvent) {
        const clickedElement = $(event.currentTarget)
        const action = clickedElement.data().action
        const user = this.object;
        switch (action) {
            case 'clear': {
                const confirmed = await foundry.appv1.api.Dialog.confirm({
                    title: game.i18n.localize("ROLL-TRACKER.confirms.clear_rolls.title"),
                    content: game.i18n.localize("ROLL-TRACKER.confirms.clear_rolls.content"),
                })
                if (confirmed) {
                    await RollTrackerData.clearTrackedRolls(user);
                    this.render();
                }
                break
            }
            case 'print': {
                const content = await foundry.applications.handlebars.renderTemplate(RollTracker.TEMPLATES.CHATMSG, await this.getData());
                ChatMessage.create({ content })
                break
            }
        }
    }

}