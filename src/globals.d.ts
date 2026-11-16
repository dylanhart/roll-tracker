import type Game from '@client/game.mjs';
import type * as UI from '@client/ui.mjs';
import type * as HandlebarsAPI from 'handlebars';

declare global {
    const game: Game;
    const ui: typeof UI;
    const Handlebars: typeof HandlebarsAPI;
}
