/**
 * The offline build (`pnpm build:offline`): the game server runs inside the page, there are no
 * accounts, and only games against bots can be played. Vite sets this at build time, so the
 * normal build drops every offline-only branch.
 */
declare const __REIGN_OFFLINE__: boolean;

export const OFFLINE: boolean = __REIGN_OFFLINE__;
