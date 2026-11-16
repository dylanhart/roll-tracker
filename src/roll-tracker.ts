import { registerSettings } from './settings';
import { renderPlayerButtons } from './player-list';
import { trackMessage, reportTrackingError } from './tracking';

// This PF2e snapshot uses an unknown[] fallback for these two hook names.
Hooks.on('createChatMessage', (message) => {
    void trackMessage(message as ChatMessage).catch(reportTrackingError);
});
Hooks.on('renderPlayers', (_app, element) => renderPlayerButtons(element as HTMLElement));
Hooks.once('init', registerSettings);
Handlebars.registerHelper('indexToOrdinal', (value) => Number(value) + 1);

export { RollStats } from './statistics';
