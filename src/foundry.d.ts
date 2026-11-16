// Narrow contracts for the Foundry v13 APIs used by this module.
// These are host-provided globals, not bundled runtime dependencies.
export interface StreakFlag { last: number | null; count: number }
export interface StatsFlag { histogram: number[]; streak: StreakFlag }
export interface TrackerUser {
    id: string;
    isGM: boolean;
    name: string;
    getFlag(scope: string, key: string): StatsFlag | undefined;
    setFlag(scope: string, key: string, data: StatsFlag): Promise<TrackerUser>;
    unsetFlag(scope: string, key: string): Promise<TrackerUser>;
}
export interface TrackerRoll {
    dice: { faces: number; results: { result: number }[] }[];
}
export interface TrackerMessage {
    id: string;
    isRoll: boolean;
    isContentVisible: boolean;
    blind: boolean;
    author: TrackerUser;
    rolls: TrackerRoll[];
    flags: {
        dnd5e?: { roll?: { type?: string } };
        pf2e?: { context?: { type?: string } };
    };
}
export interface ClickEvent { currentTarget: HTMLElement }
export interface JQueryElement {
    on(event: string, selector: string, handler: (event: ClickEvent) => Promise<void>): void;
    data(): { action?: string };
}
interface SettingsOptions {
    name: string; default: boolean | string | number; type: BooleanConstructor | StringConstructor | NumberConstructor;
    scope: 'world'; config: boolean; hint: string; onChange?: () => void;
    choices?: Record<string, string>; range?: { min: number; max: number; step: number };
}
interface ApplicationOptions { height?: string | number; id?: string; template?: string; title?: string }
declare class TrackerFormApplication {
    constructor(object: TrackerUser, options?: ApplicationOptions);
    object: TrackerUser;
    static get defaultOptions(): ApplicationOptions;
    render(force?: boolean): this;
    activateListeners(html: JQueryElement): void;
}
declare global {
    const Hooks: {
        on(event: 'createChatMessage', callback: (message: TrackerMessage) => void): void;
        on(event: 'renderPlayers', callback: (app: unknown, element: HTMLElement) => void): void;
        once(event: 'init', callback: () => void): void;
        once(event: 'diceSoNiceRollComplete', callback: (id: string) => void): void;
    };
    const game: {
        user: TrackerUser; userId: string; users: Iterable<TrackerUser>; system: { id: string }; dice3d?: unknown;
        i18n: { localize(key: string): string };
        settings: { get(scope: string, key: string): unknown; register(scope: string, key: string, options: SettingsOptions): void };
    };
    const ui: { players: { render(): void } };
    const Handlebars: { registerHelper(name: string, fn: (value: unknown, options: unknown) => number): void };
    const foundry: {
        utils: { mergeObject<T extends object>(original: T, other: Partial<T>): T };
        appv1: { api: { FormApplication: typeof TrackerFormApplication; Dialog: { confirm(options: { title: string; content: string }): Promise<boolean> } } };
        applications: { handlebars: { renderTemplate(path: string, data: unknown): Promise<string> } };
    };
    const ChatMessage: { create(data: { content: string }): Promise<unknown> };
    const $: (element: HTMLElement) => JQueryElement;
}
