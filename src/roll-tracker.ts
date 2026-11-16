import { renderPlayerButtons } from './player-list';
import { registerSettings } from './settings';
import { reportTrackingError, trackMessage } from './tracking';

// PF2e uses an unknown[] fallback for hooks without a specific overload.
Hooks.on('createChatMessage', (message) => {
    void trackMessage(message as ChatMessage).catch(reportTrackingError);
});
Hooks.on('renderPlayers', (_app, element) => renderPlayerButtons(element as HTMLElement));
Hooks.once('init', registerSettings);
Handlebars.registerHelper('indexToOrdinal', (value) => Number(value) + 1);

export { RollStats } from './statistics';
