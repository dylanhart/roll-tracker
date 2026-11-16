import { compactD10000Stats } from './data';
import { renderPlayerButtons } from './player-list';
import { registerSettings } from './settings';
import { reportTrackingError, trackMessage } from './tracking';

// PF2e uses an unknown[] fallback for hooks without a specific overload.
Hooks.on('createChatMessage', (message) => {
    void trackMessage(message as ChatMessage).catch(reportTrackingError);
});
Hooks.on('renderPlayers', (_app, element) => renderPlayerButtons(element as HTMLElement));
Hooks.once('init', registerSettings);
Hooks.once('ready', () => {
    void compactD10000Stats(game.user).catch(reportTrackingError);
});
Handlebars.registerHelper('indexToOrdinal', (value) => Number(value) + 1);

export { RollStats } from './statistics';
