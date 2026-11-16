import type { ApplicationConfiguration, ApplicationRenderOptions } from '@client/applications/_types.mjs';
import { TEMPLATES } from './config';
import { clearTrackedRolls } from './data';
import { type DieFaces, isSupportedDie } from './dice';
import { getLedgerContext } from './ledger-context';
import { reportTrackingError } from './tracking';

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

export class RollTrackerDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    readonly user: User;
    faces: DieFaces = 20;

    constructor(user: User, options: DeepPartial<ApplicationConfiguration> = {}) {
        super(options);
        this.user = user;
    }

    static override DEFAULT_OPTIONS: DeepPartial<ApplicationConfiguration> = {
        classes: ['roll-tracker-app', 'themed', 'theme-light'],
        position: { width: 440, height: 'auto' },
        window: { title: 'Roll Tracker', resizable: true },
        actions: {
            selectDie: function (this: RollTrackerDialog, _event: PointerEvent, target: HTMLElement) {
                const faces = Number(target.dataset.faces);
                if (isSupportedDie(faces)) return this.selectDie(faces).catch(reportTrackingError);
            },
            clear: function (this: RollTrackerDialog) {
                return this.clearStats().catch(reportTrackingError);
            },
            print: function (this: RollTrackerDialog) {
                return this.printStats().catch(reportTrackingError);
            },
        },
    };

    static override PARTS = {
        ledger: { template: TEMPLATES.ROLLTRACK },
    };

    protected override async _prepareContext(options: ApplicationRenderOptions) {
        return { ...(await super._prepareContext(options)), ...getLedgerContext(this.user, this.faces) };
    }

    async selectDie(faces: DieFaces): Promise<void> {
        this.faces = faces;
        await this.render();
    }

    async clearStats(): Promise<void> {
        const confirmed = await DialogV2.confirm({
            window: { title: game.i18n.localize('ROLL-TRACKER.confirms.clear_rolls.title') },
            content: game.i18n.format('ROLL-TRACKER.confirms.clear_rolls.content', { die: `d${this.faces}` }),
            rejectClose: false,
            modal: true,
        });
        if (confirmed) {
            await clearTrackedRolls(this.user, this.faces);
            await this.render();
        }
    }

    async printStats(): Promise<void> {
        const content = await foundry.applications.handlebars.renderTemplate(
            TEMPLATES.CHATMSG,
            getLedgerContext(this.user, this.faces),
        );
        await foundry.documents.ChatMessage.create({ content });
    }
}
