/** TODO:
 * SETTINGS - CAN PLAYERS CLEAR THEIR OWN ROLLS? TREAT FORTUNE/MISFORTUNE AS ONLY THE ROLL TAKEN OR BOTH ROLLED?
 * * HAVE CHECKBOXES FOR WHAT KIND OF ROLLS ARE CONSIDERED - VERY SYSTEM SPECIFIC
 * SIZE OF DICE TO BE TRACKED
 * NEW FEATURES - One click clear everyone's rolls
 *              - Session logs - collect all the rolls for a given log in session and store it. Access past session logs, maybe you can combine them.
 */

// Whenever a chat message is created, check if it contains a roll. If so, parse it to determine
// whether it should be tracked, according to our module settings
Hooks.on('createChatMessage', (chatMessage) => {
    if (chatMessage.isRoll) {
        RollTracker.parseMessage(chatMessage, RollTracker.SYSTEM)
    }
})

// This adds our icon to the player list
Hooks.on('renderPlayerList', (playerList, html) => {

    if (game.user.isGM) {
        if (game.settings.get(RollTracker.ID, RollTracker.SETTINGS.GM_SEE_PLAYERS)) {
            // This adds our icon to ALL players on the player list, if the setting is toggled
            // tooltip
            const tooltip = game.i18n.localize('ROLL-TRACKER.button-title')
            // create the button where we want it to be
            for (let user of game.users) {
                const buttonPlacement = html.find(`[data-user-id="${user.id}"]`)
                buttonPlacement.append(
                    `<button type="button" title='${tooltip}' class="roll-tracker-item-button flex0" id="${user.id}"><i class="fas fa-dice-d20"></i></button>`
                )
                html.on('click', `#${user.id}`, (event) => {
                    new RollTrackerDialog(user).render(true);
                })
            }
        }
        else {
            // Put the roll tracker icon only beside the GM's name
            const loggedInUser = html.find(`[data-user-id="${game.userId}"]`)

            const tooltip = game.i18n.localize('ROLL-TRACKER.button-title')

            loggedInUser.append(
                `<button type="button" title='${tooltip}' class="roll-tracker-item-button flex0" id="${game.userId}"><i class="fas fa-dice-d20"></i></button>`
            )
            html.on('click', `#${game.userId}`, (event) => {
                new RollTrackerDialog(game.user).render(true);
            })
        }
    }
    else if (game.settings.get(RollTracker.ID, RollTracker.SETTINGS.PLAYERS_SEE_PLAYERS)) {
        // find the element which has our logged in user's id
        const loggedInUser = html.find(`[data-user-id="${game.userId}"]`)

        const tooltip = game.i18n.localize('ROLL-TRACKER.button-title')

        loggedInUser.append(
            `<button type="button" title='${tooltip}' class="roll-tracker-item-button flex0" id="${game.userId}"><i class="fas fa-dice-d20"></i></button>`
        )
        html.on('click', `#${game.userId}`, (event) => {
            new RollTrackerDialog(game.user).render(true);
        })
    }
})

// Register our module with the Dev Mode module, for logging purposes
Hooks.once('devModeReady', ({ registerPackageDebugFlag }) => {
    registerPackageDebugFlag(RollTracker.ID)
})

// Initialize dialog and settings on foundry boot up
Hooks.once('init', () => {
    RollTracker.initialize()
})

// We're using sockets to ensure the streak message is always transmitted by the GM.
// This allows us to completely hide it from players if a part of the streak was blind, or if
// the Hide All Streak Messages setting is enabled
Hooks.once('ready', () => {
    // game.socket.on("module.roll-tracker", (data) => {
    //     if (game.user.isGM) {
    //         ChatMessage.create(data)
    //     }
    // })
})

// The following helper functions help us to make and display the right strings for chat cards and the comparison card
// Mostly they're checking for multiple modes, or ties in the case of the comparison card
Handlebars.registerHelper('isOne', function (value) {
    return value === 1;
});

Handlebars.registerHelper('isTwo', function (value) {
    return value === 2;
});

Handlebars.registerHelper('isThreePlus', function (value) {
    return value > 2;
});

// If the length of the input array is more than one, there is a tie (whether in mode or for a given statistic like highest mean)
Handlebars.registerHelper('isTie', function (value) {
    return value.length > 1;
});

// To check if the current item being iterated over is the last item in the array
Handlebars.registerHelper('isLast', function (index, length) {
    if (length - index === 1) return true
});

// To check if the current item being iterated over is the second last item in the array
Handlebars.registerHelper('isSecondLast', function (index, length) {
    if (length - index === 2) return true
});

// To check if the Combat checkbox is checked in the Roll Tracker Dialog
Handlebars.registerHelper('isCombatToggled', function (value) {
    if (value === 'sorted') return false
    else if (value === 'combat') return true
});


// Store basic module info
class RollTracker {
    static ID = 'roll-tracker'

    static FLAGS = {
        ROLL_STATS: 'roll-stats',
    }

    static TEMPLATES = {
        ROLLTRACK: `modules/${this.ID}/templates/${this.ID}.hbs`,
        CHATMSG: `modules/${this.ID}/templates/${this.ID}-chat.hbs`,
    }

    // This logging function ties in with the Developer Mode module. It will log a custom, module namespaced
    // message in the dev console when RollTracker.log() is called. When Developer Mode is not enabled (as in
    // most non-dev environments) the log will not show. Prevents logs leaking into full releases
    static log(force, ...args) {
        const shouldLog = force || game.modules.get('_dev-mode')?.api?.getPackageDebugValue(this.ID)

        if (shouldLog) {
            console.log(this.ID, '|', ...args)
        }
    }

    static SETTINGS = {
        GM_SEE_PLAYERS: 'gm_see_players',
        PLAYERS_SEE_PLAYERS: 'players_see_players',
        ROLL_STORAGE: 'roll_storage',
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

        // A setting to determine how many rolls should be stored at any one time
        game.settings.register(this.ID, this.SETTINGS.ROLL_STORAGE, {
            name: `ROLL-TRACKER.settings.${this.SETTINGS.ROLL_STORAGE}.Name`,
            default: 50,
            type: Number,
            range: {
                min: 10,
                max: 500,
                step: 10
            },
            scope: 'world',
            config: true,
            hint: `ROLL-TRACKER.settings.${this.SETTINGS.ROLL_STORAGE}.Hint`,
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
    static async parseMessage(chatMessage, system) {
        // Wait for 3d dice
        if (chatMessage.isContentVisible) {
            await RollTrackerHelper.waitFor3DDiceMessage(chatMessage.id);
        }

        const countHidden = game.settings.get(this.ID, this.SETTINGS.COUNT_HIDDEN);

        chatMessage.rolls.forEach(roll => {
            const isBlind = chatMessage.blind
            const rollRequirements = {
                blindCheck: (!isBlind || countHidden || roll.roller.isGM),
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
                RollTrackerData.createTrackedRoll(chatMessage.user, roll, isBlind)
            }
        });
    }
}

class RollTrackerHelper {
    // Functions that don't specifically manipulate data but are referenced or used
    // If Dice So Nice is enabled, this will help us wait until after the animation is shown
    // to send chat messages such as the Streak chat message, so we don't ruin the surprise of
    // the roll
    static async waitFor3DDiceMessage(targetMessageId) {
        function buildHook(resolve) {
            Hooks.once('diceSoNiceRollComplete', (messageId) => {
                if (targetMessageId === messageId)
                    resolve(true);
                else
                    buildHook(resolve)
            });
        }
        return new Promise((resolve, reject) => {
            if (game.dice3d) {
                buildHook(resolve);
            } else {
                resolve(true);
            }
        });
    }
}

class Streak {
    constructor(last, count) {
        this.last = last;
        this.count = count;
    }

    static fromFlagData(flagData) {
        return new Streak(flagData.last, flagData.count);
    }

    toFlagData() {
        return {
            last: this.last,
            count: this.count,
        };
    }

    update(number) {
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

class RollStats {
    constructor() {
        this.histogram = new Array(20);
        this.clear();
    }

    static fromFlagData(flagData) {
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

    update(number) {
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
        let modes = [];
        let count = 0;
        this.histogram.forEach((curr, idx) => {
            if (curr > count) {
                modes = [idx + 1];
                count = curr
            } else if (curr == count) {
                modes.push(curr);
            }
        });

        return { modes, count };
    }
}

class RollTrackerData {
    // Our main data workhorse class
    static readUserStats(user) {
        const flagData = user.getFlag(RollTracker.ID, RollTracker.FLAGS.ROLL_STATS);
        if (flagData == null) {
            return new RollStats();
        }
        return RollStats.fromFlagData(flagData);
    }

    static async writeUserStats(rollStats) {
        const flagData = rollStats.toFlagData();
        return await user.setFlag(RollTracker.ID, RollTracker.FLAGS.ROLL_STATS, flagData);
    }

    static async clearTrackedRolls(user) {
        return await user.unsetFlag(RollTracker.ID, RollTracker.FLAGS.ROLL_STATS);
    }

    static async createTrackedRoll(user, roll, isBlind) {
        // We are running client-side, so we should only update our own roll data.
        if (game.userId !== user.id) {
            return;
        }

        const stats = this.getUserStats(user);

        roll.dice.forEach(die => {
            if (die.faces != 20) {
                return;
            }

            stats.update(number);
        });

        user = await this.writeUserStats(stats);
    }
}

class RollTrackerDialog extends FormApplication {
    constructor(user, options = {}) {
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

    async getData(options) {
        return {
            user: this.object,
            stats: RollTrackerData.getUserStats(this.object),
        };
    }

    activateListeners(html) {
        super.activateListeners(html);

        const clickHandler = this._handleButtonClick.bind(this);
        html.querySelectorAll("[data-action]").forEach(btn => {
            btn.addEventListener("click", clickHandler);
        });
    }

    async _handleButtonClick(event) {
        const clickedElement = $(event.currentTarget)
        const action = clickedElement.data().action
        const user = this.object;
        switch (action) {
            case 'clear': {
                const confirmed = await Dialog.confirm({
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
                const content = await renderTemplate(RollTracker.TEMPLATES.CHATMSG, this.getData());
                ChatMessage.create({ content })
                break
            }
        }
    }

}