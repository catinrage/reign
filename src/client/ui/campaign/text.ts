import { presetById, type MapChoice } from '../../../shared/board/maps';
import { ACTS, type CampaignGoal, type Mission } from '../../../shared/campaign/missions';
import { BAN_TEXT } from '../../../shared/rules/campaign';
import { CHARACTER_INFO, type CharacterId } from '../../../shared/rules/characters';
import { BUILDING_INFO, EXTRA_BUILDINGS } from '../../../shared/rules/buildings';
import { t } from '../../i18n/index.svelte';
import { cardsText } from '../helpers';
import { PIXEL } from '../pixel';

/** Roman numerals for the acts. */
export function actNumber(n: number): string {
	return ['I', 'II', 'III', 'IV', 'V'][n - 1] ?? String(n);
}

export function actTitle(n: number): string {
	const act = ACTS.find((a) => a.n === n);
	return act ? t('Act {n}: {title}', { n: actNumber(n), title: t(act.title) }) : '';
}

/** A rival's name and epithet, as the story calls them: "Leofric the Baron". */
export function rivalName(c: CharacterId): string {
	const info = CHARACTER_INFO[c];
	return t('{character} {epithet}', { character: t(info.name), epithet: t(info.title) });
}

function mapLabel(map: MapChoice | undefined): string {
	if (map && 'preset' in map) return t(presetById(map.preset)?.name ?? 'Great Isle');
	if (map && 'custom' in map) return t(map.custom.name);
	return t('Great Isle');
}

/** The star for an optional goal, in a line. */
export function goalText(g: CampaignGoal): string {
	switch (g.kind) {
		case 'rounds':
			return t('Win by the end of round {n}', { n: g.max });
		case 'longestRoad':
			return t('Win holding the Longest Road');
		case 'largestArmy':
			return t('Win holding the Largest Army');
		case 'cities':
			return t('{n, plural, one {Win with a city} other {Win with # cities}}', { n: g.n });
		case 'workshops':
			return t('{n, plural, one {Win with a workshop} other {Win with # workshops}}', { n: g.n });
		case 'lostAtMost':
			return t('{n, plural, =0 {Lose no cards to thieves} one {Lose no more than # card to thieves} other {Lose no more than # cards to thieves}}', { n: g.n });
		case 'noDiscard':
			return t('Never discard on a 7');
	}
}

/** What a mission's rules are, a line each, with an icon: the island, the goal, the challenge. */
export function missionRules(m: Mission): { icon: string; text: string; hard?: boolean }[] {
	const out: { icon: string; text: string; hard?: boolean }[] = [];
	if (m.mode === 'classic') out.push({ icon: PIXEL.book, text: t('Classic rules on the standard island') });
	else {
		out.push({ icon: PIXEL.book, text: t('Reign Extended on {map}', { map: mapLabel(m.map) }) });
		const built = EXTRA_BUILDINGS.filter((b) => m.settings?.buildings?.[b]).map((b) => t(BUILDING_INFO[b].label));
		if (built.length) out.push({ icon: PIXEL.hammer, text: t('Buildings: {list}', { list: built.join(', ') }) });
		if (m.settings?.events?.on) out.push({ icon: PIXEL.raincloud, text: m.settings.events.wild ? t('The Events deck, wild cards included') : t('The Events deck, gentle cards only') });
		if (m.hero?.character) {
			out.push({
				icon: PIXEL.crown,
				text: m.settings?.powers === false
					? t('You play {character}, with traits but no powers', { character: rivalName(m.hero.character) })
					: t('You play {character}, with traits and powers', { character: rivalName(m.hero.character) })
			});
		}
		if (m.settings?.handLimit !== undefined && m.settings.handLimit !== 7) {
			out.push({ icon: PIXEL.cards, text: t('On a 7, anyone holding more than {n} cards discards half', { n: m.settings.handLimit }) });
		}
	}
	out.push({ icon: PIXEL.victoryPoint, text: t('First to {n, plural, one {# point} other {# points}} wins', { n: m.points }) });
	if (m.hero?.seat === 'first') out.push({ icon: PIXEL.play, text: t('You place and roll first') });
	if (m.hero?.start) out.push({ icon: PIXEL.cards, text: t('You start with {cards}', { cards: cardsText(m.hero.start) }) });
	if (m.roundLimit) out.push({ icon: PIXEL.hourglass, text: t('Win by the end of round {n}, or lose', { n: m.roundLimit }), hard: true });
	for (const b of m.bans ?? []) out.push({ icon: PIXEL.lock, text: t(BAN_TEXT[b].text), hard: true });
	for (const r of m.rivals) {
		const who = t(CHARACTER_INFO[r.character].name);
		if (r.vp) out.push({ icon: PIXEL.victoryPoint, text: t('{name} starts with {n, plural, one {a hidden victory point} other {# hidden victory points}}', { name: who, n: r.vp }), hard: true });
		if (r.start) out.push({ icon: PIXEL.cards, text: t('{name} starts with {cards}', { name: who, cards: cardsText(r.start) }), hard: true });
	}
	if (m.tribute) {
		const boss = m.rivals.find((r) => r.boss);
		const text = m.tribute.all || !boss
			? t('{n, plural, one {Every rival takes a card of tribute from the bank each round} other {Every rival takes a card of tribute from the bank every # rounds}}', { n: m.tribute.every })
			: t('{n, plural, one {{name} takes a card of tribute from the bank each round} other {{name} takes a card of tribute from the bank every # rounds}}', {
					n: m.tribute.every,
					name: t(CHARACTER_INFO[boss.character].name)
				});
		out.push({ icon: PIXEL.crown, text, hard: true });
	}
	return out;
}
