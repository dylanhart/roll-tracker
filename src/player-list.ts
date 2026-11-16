import { ID, SETTINGS } from './config';
import { RollTrackerDialog } from './dialog';

export function renderPlayerButtons(element: HTMLElement): void {
    const insertRollTrackerButton = (user: User) => {
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

    if (game.user.isGM && game.settings.get(ID, SETTINGS.GM_SEE_PLAYERS)) {
        for (const user of game.users) insertRollTrackerButton(user);
    } else if (game.user.isGM || game.settings.get(ID, SETTINGS.PLAYERS_SEE_PLAYERS)) {
        insertRollTrackerButton(game.user);
    }
}
