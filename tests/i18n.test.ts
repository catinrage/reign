import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { format, patternOf, slotsOf } from '../src/client/i18n/format';
import { LANGUAGES } from '../src/client/i18n/languages';

describe('message format', () => {
	it('fills slots and leaves unknown ones open', () => {
		expect(format('{name} rolled {total}', { name: 'Ada', total: 8 }, 'en')).toBe('Ada rolled 8');
		expect(format('Pay {cost} now', {}, 'en')).toBe('Pay {cost} now');
	});

	it('picks plural forms by language', () => {
		const en = '{n, plural, one {# card} other {# cards}}';
		expect(format(en, { n: 1 }, 'en')).toBe('1 card');
		expect(format(en, { n: 3 }, 'en')).toBe('3 cards');
		const ru = '{n, plural, one {# карта} few {# карты} many {# карт} other {# карты}}';
		expect(format(ru, { n: 1 }, 'ru')).toBe('1 карта');
		expect(format(ru, { n: 3 }, 'ru')).toBe('3 карты');
		expect(format(ru, { n: 5 }, 'ru')).toBe('5 карт');
		expect(format(ru, { n: 21 }, 'ru')).toBe('21 карта');
		expect(format('{n, plural, other {# 张牌}}', { n: 2 }, 'zh-CN')).toBe('2 张牌');
		expect(format('{n, plural, =0 {no cards} other {# cards}}', { n: 0 }, 'en')).toBe('no cards');
	});

	it('fills slots inside plural branches', () => {
		expect(format('{who} has {n, plural, one {# card} other {# cards}}', { who: 'Bram', n: 2 }, 'en')).toBe('Bram has 2 cards');
		expect(format('{n, plural, other {{who} has # cards}}', { who: 'Bram', n: 2 }, 'en')).toBe('Bram has 2 cards');
	});

	it('reads text back into slots', () => {
		const p = patternOf('Waiting for {names} to be ready.')!;
		const m = p.re.exec('Waiting for Ada and Bram to be ready.')!;
		expect(p.names).toEqual(['names']);
		expect(m[1]).toBe('Ada and Bram');
		expect(patternOf('No slots here.')).toBeNull();
	});

	it('lists slots', () => {
		expect(slotsOf('{a} and {n, plural, one {# x} other {# xs}} {b}')).toEqual(['a', 'b', 'n']);
	});
});

describe('language files', () => {
	const dir = join(import.meta.dirname, '../src/client/i18n/locales');
	const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));

	it('has a file for every language but English', () => {
		const codes = files.map((f) => f.replace(/\.ts$/, '')).sort();
		expect(codes).toEqual(LANGUAGES.filter((l) => l.code !== 'en').map((l) => l.code).sort());
	});

	for (const file of files) {
		it(`${file} keeps every message's slots`, async () => {
			const dict: Record<string, string> = (await import(join(dir, file))).default;
			const bad = Object.entries(dict).filter(([k, v]) => slotsOf(k).join() !== slotsOf(v).join());
			expect(bad).toEqual([]);
		});

		it(`${file} has an "other" form for every plural`, async () => {
			const dict: Record<string, string> = (await import(join(dir, file))).default;
			const bad = Object.values(dict).filter((v) => v.includes(', plural,') && !/other\s*\{/.test(v));
			expect(bad).toEqual([]);
		});
	}
});

describe('slots in plural branches', () => {
	it('treats branch text as text', () => {
		expect(slotsOf('{rounds, plural, one {Drafted, repeats allowed.} other {Every # rounds}}')).toEqual(['rounds']);
		expect(slotsOf('{n, plural, one {Power, every round} other {{who} waits # rounds}}')).toEqual(['n', 'who']);
	});
});
