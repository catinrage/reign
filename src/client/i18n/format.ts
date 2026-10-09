/**
 * The message format behind `t()`: English text with `{name}` slots and ICU-style plurals.
 *
 *   'Bram rolled {total}'                         → {total} is filled in
 *   '{n, plural, one {# card} other {# cards}}'   → # is n; categories come from Intl.PluralRules
 *   '{n, plural, =0 {no cards} other {# cards}}'  → an exact match wins over the category
 *
 * Plural categories are the language's own: Russian uses one / few / many / other, Chinese
 * only other. Slots with no value stay as `{name}`, which is how `tParts` finds them.
 */

export type Params = Record<string, string | number>;

const rulesCache = new Map<string, Intl.PluralRules>();
function pluralRules(lang: string): Intl.PluralRules {
	let r = rulesCache.get(lang);
	if (!r) rulesCache.set(lang, (r = new Intl.PluralRules(lang)));
	return r;
}

/** Index of the brace that closes the one at `open`. */
function closing(s: string, open: number): number {
	let depth = 0;
	for (let i = open; i < s.length; i++) {
		if (s[i] === '{') depth++;
		else if (s[i] === '}' && --depth === 0) return i;
	}
	return -1;
}

function plural(body: string, value: number, lang: string): string {
	// body: "one {# card} few {# cards} other {# cards}"
	const cases = new Map<string, string>();
	let i = 0;
	while (i < body.length) {
		const open = body.indexOf('{', i);
		if (open < 0) break;
		const close = closing(body, open);
		if (close < 0) break;
		cases.set(body.slice(i, open).trim(), body.slice(open + 1, close));
		i = close + 1;
	}
	const text = cases.get(`=${value}`) ?? cases.get(pluralRules(lang).select(value)) ?? cases.get('other') ?? '';
	return text.replace(/#/g, String(value));
}

/** Fills `{slots}` and plurals in a message for the given language. */
export function format(message: string, params: Params | undefined, lang: string): string {
	if (!message.includes('{')) return message;
	let out = '';
	let i = 0;
	while (i < message.length) {
		const open = message.indexOf('{', i);
		if (open < 0) break;
		const close = closing(message, open);
		if (close < 0) break;
		out += message.slice(i, open);
		const inner = message.slice(open + 1, close);
		const comma = inner.indexOf(',');
		if (comma < 0) {
			const v = params?.[inner.trim()];
			out += v === undefined ? `{${inner}}` : String(v);
		} else {
			const name = inner.slice(0, comma).trim();
			const rest = inner.slice(comma + 1);
			const kind = rest.slice(0, rest.indexOf(',')).trim();
			const body = rest.slice(rest.indexOf(',') + 1);
			const v = params?.[name];
			if (kind === 'plural' && v !== undefined) out += plural(body, Number(v), lang).replace(/\{(\w+)\}/g, (m, k) => (params?.[k] !== undefined ? String(params[k]) : m));
			else out += `{${inner}}`;
		}
		i = close + 1;
	}
	return out + message.slice(i);
}

/** The `{name}` slots of a message, plural variables included (plural branch text is not a slot). */
export function slotsOf(message: string): string[] {
	const found = new Set<string>();
	const scan = (text: string) => {
		let i = 0;
		while (i < text.length) {
			const open = text.indexOf('{', i);
			if (open < 0) return;
			const close = closing(text, open);
			if (close < 0) return;
			const inner = text.slice(open + 1, close);
			const m = /^\s*(\w+)\s*(?:,\s*plural\s*,([\s\S]*))?$/.exec(inner);
			if (m) {
				found.add(m[1]);
				// Each branch's body is message text again: "one {# card} other {# cards}".
				if (m[2] !== undefined) for (const body of branches(m[2])) scan(body);
			}
			i = close + 1;
		}
	};
	scan(message);
	return [...found].sort();
}

function branches(body: string): string[] {
	const out: string[] = [];
	let i = 0;
	while (i < body.length) {
		const open = body.indexOf('{', i);
		if (open < 0) break;
		const close = closing(body, open);
		if (close < 0) break;
		out.push(body.slice(open + 1, close));
		i = close + 1;
	}
	return out;
}

/**
 * A pattern that matches text produced from a message, for text that arrives already
 * filled in (server errors, rule texts). Returns null for a message without slots.
 */
export function patternOf(message: string): { re: RegExp; names: string[] } | null {
	if (!/\{\w+\}/.test(message) || message.includes(', plural,')) return null;
	const names: string[] = [];
	const src = message
		.split(/(\{\w+\})/)
		.map((piece) => {
			const m = /^\{(\w+)\}$/.exec(piece);
			if (!m) return piece.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			names.push(m[1]);
			return '(.+?)';
		})
		.join('');
	return { re: new RegExp(`^${src}$`, 's'), names };
}
