/**
 * A plain profanity filter for what players write to each other: chat lines and pigeons. Swear
 * words and slurs come out as asterisks, the rest of the line stays as written. It reads through
 * the usual dodges: capitals, l33t letters (sh1t, @ss) and stretched words (fuuuck).
 * CrazyGames asks for at least this much on any game with chat (docs.crazygames.com/requirements/multiplayer).
 */

/** Rude inside any word ("motherfucker", "bullshit"). */
const ANYWHERE = [
	'fuck',
	'shit',
	'cunt',
	'bitch',
	'whore',
	'slut',
	'pussy',
	'nigger',
	'nigga',
	'faggot',
	'retard',
	'wank',
	'twat',
	'bastard',
	'asshole',
	'dickhead',
	'cocksuck',
	'jerkoff',
	'blowjob',
	'handjob',
	'dildo',
	'porn',
	'hentai',
	'kike',
	'tranny',
	'rapist',
	'molest',
	'pedophil'
];
/** Rude at the start of a word, but found inside harmless ones (peacock, grape, scrape). */
const WORD_START = ['dick', 'cock', 'rape', 'piss', 'prick', 'bollock', 'boob', 'penis', 'vagina'];
/** Rude only as the whole word (class, cumulative, title and assassin are fine). */
const WHOLE = [
	'ass',
	'arse',
	'cum',
	'tit',
	'tits',
	'fag',
	'fags',
	'kys',
	'nazi',
	'wtf',
	'stfu',
	'milf',
	'jizz',
	'spic',
	'chink',
	'pedo'
];

const LEET: Record<string, string> = {
	'0': 'o',
	'1': 'i',
	'!': 'i',
	'3': 'e',
	'4': 'a',
	'@': 'a',
	'5': 's',
	$: 's',
	'7': 't'
};

/** Lowercase with l33t letters read as letters, and runs of 3+ of one letter down to 2. */
function plain(word: string) {
	return word
		.toLowerCase()
		.replace(/[01!34@5$7]/g, (c) => LEET[c])
		.replace(/(.)\1{2,}/g, '$1$1');
}

/** Every run of one letter down to a single letter (fuuck → fuck). */
function single(word: string) {
	return word.replace(/(.)\1+/g, '$1');
}

const hasDouble = (w: string) => /(.)\1/.test(w);

function rude(word: string): boolean {
	const p = plain(word);
	const s = single(p);
	if (WHOLE.includes(p) || WHOLE.includes(s)) return true;
	// A word with a double letter is matched as written (boob, not Bob), the rest stretched or not.
	if (WORD_START.some((r) => (hasDouble(r) ? p : s).startsWith(r))) return true;
	return ANYWHERE.some((r) => (hasDouble(r) ? p : s).includes(r));
}

/** `text` with every rude word swapped for asterisks of the same length. */
export function censor(text: string): string {
	return text.replace(/[\p{L}\p{N}@$!]+/gu, (w) => (rude(w) ? '*'.repeat(w.length) : w));
}
