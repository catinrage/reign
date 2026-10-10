/**
 * The languages the game speaks. English is the source: every message is written in English
 * in the code, and each other language is one file in ./locales that maps the English text to
 * its translation. Adding a language is a new locales/<code>.ts plus one line here.
 */
export type Language = {
	/** BCP 47 code, also the locale file's name. */
	code: string;
	/** The language's name in itself, as the picker shows it. */
	name: string;
	/** Browser languages (prefixes of navigator.languages) that pick this one. */
	match: string[];
};

export const LANGUAGES: Language[] = [
	{ code: 'en', name: 'English', match: ['en'] },
	{ code: 'ru', name: 'Русский', match: ['ru'] },
	{ code: 'zh-CN', name: '简体中文', match: ['zh'] },
	{ code: 'de', name: 'Deutsch', match: ['de'] },
	{ code: 'fr', name: 'Français', match: ['fr'] }
];

export const SOURCE_LANGUAGE = 'en';
