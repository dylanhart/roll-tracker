import { TEMPLATES } from './config';
import { clearTrackedRolls, readUserStats } from './data';
import { reportTrackingError } from './tracking';

export class RollTrackerDialog extends foundry.appv1.api.FormApplication<User> {
    constructor(user: User, options = {}) {
        // the first argument is the object, the second are the options
        super(user, options);
    }

    static get defaultOptions() {
        // biome-ignore lint/complexity/noThisInStatic: Foundry subclasses extend their inherited application defaults.
        const defaults = super.defaultOptions;
        const overrides = {
            height: 'auto',
            width: 440,
            classes: [...defaults.classes, 'roll-tracker-app'],
            id: 'roll-tracker',
            template: TEMPLATES.ROLLTRACK,
            title: 'Roll Tracker',
        };
        const mergedOptions = foundry.utils.mergeObject(defaults, overrides);
        return mergedOptions;
    }

    async getData() {
        const stats = readUserStats(this.object);
        const format = new Intl.NumberFormat(game.i18n.lang, { maximumFractionDigits: 2 });
        const max = Math.max(...stats.histogram);
        return {
            ...(await super.getData()),
            user: this.object,
            stats,
            summary: {
                count: format.format(stats.count),
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

    activateListeners(html: JQuery) {
        super.activateListeners(html);

        const clickHandler = this._handleButtonClick.bind(this);
        html.on('click', '[data-action]', (event) => {
            void clickHandler(event).catch(reportTrackingError);
        });
    }

    protected async _updateObject(): Promise<void> {}

    async _handleButtonClick(event: JQuery.ClickEvent) {
        const action = (event.currentTarget as HTMLElement).dataset.action;
        const user = this.object;
        switch (action) {
            case 'clear': {
                const confirmed = await foundry.appv1.api.Dialog.confirm({
                    title: game.i18n.localize('ROLL-TRACKER.confirms.clear_rolls.title'),
                    content: game.i18n.localize('ROLL-TRACKER.confirms.clear_rolls.content'),
                });
                if (confirmed) {
                    await clearTrackedRolls(user);
                    this.render();
                }
                break;
            }
            case 'print': {
                const content = await foundry.applications.handlebars.renderTemplate(
                    TEMPLATES.CHATMSG,
                    await this.getData(),
                );
                await ChatMessage.create({ content });
                break;
            }
        }
    }
}
