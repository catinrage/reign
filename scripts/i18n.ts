/**
 * Translation check. Collects every English message the game can show and compares each
 * language file against it.
 *
 *   pnpm i18n                     how complete each language is
 *   pnpm i18n missing de          the German file's missing messages, as JSON to stdout
 *   pnpm i18n keys                every message, as JSON to stdout
 *
 * Where messages come from:
 * - the client: literal first arguments of t(), tParts() and msg() in src/client;
 * - rule texts in src/shared (names, traits, powers, events, map names, errors): string
 *   literals that start with a capital letter or hold a space, shown through t() or tx();
 * - server errors in src/server: sentences ending in . ! or ?, shown through tx().
 * Template literals become messages with {slots} named after the expression they held.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { slotsOf } from '../src/client/i18n/format';
import { LANGUAGES, SOURCE_LANGUAGE } from '../src/client/i18n/languages';

const ROOT = join(import.meta.dirname, '..');

function walk(dir: string, exts: string[]): string[] {
	const out: string[] = [];
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) {
			if (name !== 'locales') out.push(...walk(p, exts));
		} else if (exts.some((e) => name.endsWith(e))) out.push(p);
	}
	return out;
}

/** Literal first arguments of t( / tParts( / msg( in client code. */
const CALL = /(?<![\w.$])(?:t|tParts|msg)\(\s*('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\$]|\\.)*`)/g;

function clientKeys(): Map<string, string> {
	const keys = new Map<string, string>();
	for (const file of walk(join(ROOT, 'src/client'), ['.svelte', '.ts'])) {
		const src = readFileSync(file, 'utf8');
		for (const m of src.matchAll(CALL)) {
			const text = new Function(`return ${m[1]}`)() as string;
			if (text.trim()) keys.set(text, relative(ROOT, file));
		}
	}
	return keys;
}

function slotName(expr: ts.Expression): string {
	let e: ts.Node = expr;
	while (ts.isPropertyAccessExpression(e) || ts.isCallExpression(e) || ts.isNonNullExpression(e) || ts.isParenthesizedExpression(e)) {
		if (ts.isPropertyAccessExpression(e)) return e.name.text;
		if (ts.isCallExpression(e)) e = e.expression;
		else e = (e as ts.NonNullExpression | ts.ParenthesizedExpression).expression;
	}
	if (ts.isIdentifier(e)) return e.text;
	return 'value';
}

function literals(file: string): string[] {
	const src = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
	const out: string[] = [];
	const visit = (node: ts.Node) => {
		if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
		if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
			// Skip object keys, type literals and `x === 'kind'` comparisons.
			const parent = node.parent;
			if (ts.isPropertyAssignment(parent) && parent.name === node) return;
			if (ts.isLiteralTypeNode(parent) || ts.isCaseClause(parent)) return;
			if (ts.isBinaryExpression(parent) && /=/.test(parent.operatorToken.getText())) return;
			if (ts.isElementAccessExpression(parent)) return;
			out.push(node.text);
		} else if (ts.isTemplateExpression(node)) {
			let text = node.head.text;
			const used = new Map<string, number>();
			for (const span of node.templateSpans) {
				let name = slotName(span.expression);
				const n = (used.get(name) ?? 0) + 1;
				used.set(name, n);
				if (n > 1) name += n;
				text += `{${name}}` + span.literal.text;
			}
			out.push(text);
			return;
		}
		ts.forEachChild(node, visit);
	};
	visit(src);
	return out;
}

const looksLikeCode = (s: string) => /[=<>\\/_@#;|[\]]|^\w+\(|\.\w+\(|^[a-z]+[A-Z]\w*$|^https?:/.test(s) || !/[A-Za-z]/.test(s);

function sharedKeys(): Map<string, string> {
	const keys = new Map<string, string>();
	for (const file of walk(join(ROOT, 'src/shared'), ['.ts'])) {
		if (file.endsWith('cheats.ts')) continue; // dev-only, stays English
		// A random world's made-up names are its own proper nouns, never translated.
		if (/conquest[\\/](names|world)\.ts$/.test(file)) continue;
		for (const s of literals(file)) {
			const text = s.trim();
			if (text !== s || text.length < 2 || looksLikeCode(text)) continue;
			if (/^[A-Z]/.test(text) || /\s/.test(text)) keys.set(text, relative(ROOT, file));
		}
	}
	for (const file of walk(join(ROOT, 'src/server'), ['.ts'])) {
		for (const s of literals(file)) {
			if (/^[A-Z{].*\s.*[.!?]$/s.test(s) && !looksLikeCode(s.replace(/\{\w+\}/g, ''))) keys.set(s, relative(ROOT, file));
		}
	}
	return keys;
}

export function allKeys(): Map<string, string> {
	return new Map([...sharedKeys(), ...clientKeys()]);
}

async function locale(code: string): Promise<Record<string, string>> {
	try {
		return (await import(`../src/client/i18n/locales/${code}.ts`)).default;
	} catch {
		return {};
	}
}

async function main() {
	const [cmd, arg] = process.argv.slice(2);
	const keys = allKeys();
	if (cmd === 'keys') {
		console.log(JSON.stringify([...keys.keys()], null, '\t'));
		return;
	}
	if (cmd === 'missing') {
		const dict = await locale(arg);
		console.log(JSON.stringify([...keys.keys()].filter((k) => !dict[k]), null, '\t'));
		return;
	}
	console.log(`${keys.size} messages`);
	for (const lang of LANGUAGES) {
		if (lang.code === SOURCE_LANGUAGE) continue;
		const dict = await locale(lang.code);
		const missing = [...keys.keys()].filter((k) => !dict[k]);
		const stale = Object.keys(dict).filter((k) => !keys.has(k));
		const slots = Object.entries(dict).filter(([k, v]) => slotsOf(k).join() !== slotsOf(v).join());
		console.log(
			`${lang.code.padEnd(6)} ${String(keys.size - missing.length).padStart(5)} translated, ${missing.length} missing, ${stale.length} no longer used${slots.length ? `, ${slots.length} with different {slots}` : ''}`
		);
		for (const [k, v] of slots) console.log(`  slots differ: ${JSON.stringify(k)} -> ${JSON.stringify(v)}`);
	}
}

if (process.argv[1] && import.meta.filename === process.argv[1]) void main();
