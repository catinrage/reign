/// <reference types="vite/client" />
/**
 * Translations. Every piece of text the player reads goes through one of these:
 *
 *   t('Create a room')                          text written in this file's language (English)
 *   t('{name} rolled {total}', { name, total }) with slots, see format.ts for plurals
 *   tParts('{player} stole {res}', slots, T)    a sentence built from parts (chronicle lines)
 *   tx(text)                                    English text made elsewhere: server errors,
 *                                               rule texts from src/shared, already filled in
 *   msg('Music')                                marks text kept in a table and translated
 *                                               later with t(label); returns it unchanged
 *
 * The English text is the key. A language file maps it to the translation; anything it
 * lacks shows in English. `t()` reads the current language, so markup re-renders on a switch.
 * `pnpm i18n` lists what each language is missing (scripts/i18n.ts).
 */
import { format, patternOf, type Params } from './format';
import { installCjkFont } from './fonts';
import { LANGUAGES, SOURCE_LANGUAGE } from './languages';

export type Messages = Record<string, string>;
export type { Params };
export { LANGUAGES };

const STORAGE_KEY = 'reign:lang';
const loaders = import.meta.glob<{ default: Messages }>('./locales/*.ts');
const dicts = new Map<string, Messages>([[SOURCE_LANGUAGE, {}]]);
/** Patterns of each language's messages with slots, for `tx`. Built on first use. */
const patterns = new Map<string, { re: RegExp; names: string[]; to: string }[]>();

export const i18n = $state({ lang: SOURCE_LANGUAGE });

function dict(): Messages {
	return dicts.get(i18n.lang) ?? {};
}

/** Translates English text, filling `{slots}` and plurals. */
export function t(text: string, params?: Params): string {
	return format(dict()[text] || text, params, i18n.lang);
}

/** Marks English text for translation without translating it yet. */
export function msg<T extends string>(text: T): T {
	return text;
}

/**
 * Translates a sentence whose slots hold parts rather than text (player names, resource
 * icons). `slots` maps a slot name to a part or a list of parts; `text` wraps the plain
 * stretches between them. Plural and plain `{params}` are filled first.
 */
export function tParts<P>(message: string, slots: Record<string, P | P[]>, text: (s: string) => P, params?: Params): P[] {
	const filled = t(message, params);
	const out: P[] = [];
	for (const piece of filled.split(/(\{\w+\})/)) {
		if (!piece) continue;
		const m = /^\{(\w+)\}$/.exec(piece);
		const slot = m ? slots[m[1]] : undefined;
		if (slot === undefined) out.push(text(piece));
		else if (Array.isArray(slot)) out.push(...slot);
		else out.push(slot);
	}
	return out;
}

/**
 * Translates English text that was filled in before it got here, such as a server error
 * ("Waiting for Ada to be ready.") or a rule text with a number in it: an exact match first,
 * then any message with slots whose pattern fits, with the slot values carried over.
 */
export function tx(text: string): string {
	const d = dict();
	if (d[text]) return d[text];
	if (i18n.lang === SOURCE_LANGUAGE || !text) return text;
	let list = patterns.get(i18n.lang);
	if (!list) {
		list = [];
		for (const [from, to] of Object.entries(d)) {
			const p = patternOf(from);
			if (p) list.push({ ...p, to });
		}
		patterns.set(i18n.lang, list);
	}
	for (const p of list) {
		const m = p.re.exec(text);
		if (!m) continue;
		const params: Params = {};
		// A value that is itself a message ("Round" in "Round isle 7") is translated too.
		p.names.forEach((n, i) => (params[n] = d[m[i + 1]] || m[i + 1]));
		return format(p.to, params, i18n.lang);
	}
	return text;
}

/** The language the browser asks for, among ours. */
function preferred(): string {
	const asked = typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language]);
	for (const tag of asked) {
		const lower = tag.toLowerCase();
		const hit = LANGUAGES.find((l) => l.code.toLowerCase() === lower || l.match.some((m) => lower === m || lower.startsWith(`${m}-`)));
		if (hit) return hit.code;
	}
	return SOURCE_LANGUAGE;
}

function saved(): string | null {
	try {
		const v = localStorage.getItem(STORAGE_KEY);
		return v && LANGUAGES.some((l) => l.code === v) ? v : null;
	} catch {
		return null;
	}
}

async function load(code: string): Promise<void> {
	if (dicts.has(code)) return;
	const loader = loaders[`./locales/${code}.ts`];
	dicts.set(code, loader ? (await loader()).default : {});
}

/** Switches the language (loading its file first) and remembers it on this device. */
export async function setLanguage(code: string): Promise<void> {
	if (!LANGUAGES.some((l) => l.code === code)) code = SOURCE_LANGUAGE;
	await load(code);
	i18n.lang = code;
	if (typeof document !== 'undefined') document.documentElement.lang = code;
	try {
		localStorage.setItem(STORAGE_KEY, code);
	} catch {
		/* ignore */
	}
}

/** Picks the saved language, else the browser's, before the interface first draws. */
export async function initLanguage(): Promise<void> {
	installCjkFont();
	const code = saved() ?? preferred();
	await load(code).catch(() => {});
	i18n.lang = dicts.has(code) ? code : SOURCE_LANGUAGE;
	if (typeof document !== 'undefined') document.documentElement.lang = i18n.lang;
}

/** Formats a number the way the current language writes it. */
export function num(n: number): string {
	return n.toLocaleString(i18n.lang);
}
