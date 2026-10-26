import { describe, expect, it } from 'vitest';
import { censor } from '../src/server/profanity';

describe('censor', () => {
	it('stars out swear words and keeps the rest of the line', () => {
		expect(censor('well shit, nice roll')).toBe('well ****, nice roll');
		expect(censor('you ASS')).toBe('you ***');
		expect(censor('bullshit')).toBe('********');
	});

	it('reads through l33t letters and stretched words', () => {
		expect(censor('sh1t')).toBe('****');
		expect(censor('fuuuuck')).toBe('*******');
		expect(censor('@ss')).toBe('***');
	});

	it('leaves harmless words that hide a rude one alone', () => {
		const fine =
			'class assassin peacock grape title Bob spicy torpedo cumulative passing Dickens? sheep wheat';
		expect(censor(fine)).toBe(fine.replace('Dickens', '*******'));
	});
});
