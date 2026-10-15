import { conquestMap } from '../../../shared/conquest/queries';
import type { CardSymbol, CqEvent, CqView } from '../../../shared/conquest/types';
import { msg, t } from '../../i18n/index.svelte';
import { OMEN_INFO } from '../../../shared/conquest/omens';
import { WARLORD_INFO } from '../../../shared/conquest/warlords';
import { PLAYER_CSS } from '../helpers';

/** Words for Conquest's interface: names on the map, whose turn it is, the chronicle's lines. */

export const SYMBOL_LABEL: Record<CardSymbol, string> = {
	footman: msg('Footman'),
	knight: msg('Knight'),
	catapult: msg('Catapult'),
	wild: msg('Wild')
};

export function territoryName(v: CqView, i: number): string {
	return t(conquestMap(v.settings).territories[i]?.name ?? '');
}

export function regionName(v: CqView, r: number): string {
	return t(conquestMap(v.settings).regions[r]?.name ?? '');
}

export function playerName(v: CqView, p: number): string {
	return v.players[p]?.name ?? '?';
}

export function cqColor(v: CqView, p: number): string {
	return PLAYER_CSS[v.players[p]?.color ?? 'white'] ?? '#fff';
}

/** Every territory and region name the board shows, in the player's language. */
export function boardNames() {
	const map = conquestMap();
	return {
		territories: map.territories.map((x) => t(x.name)),
		regions: map.regions.map((r) => t(r.name)),
		legend: t('Regions')
	};
}

export type CqLogPart = { text: string; player?: number; place?: number };

/** A chronicle line for an event, as parts (players in their colors), or null for none. */
export function cqEventParts(e: CqEvent, v: CqView): CqLogPart[] | null {
	const P = (p: number): CqLogPart => ({ text: playerName(v, p), player: p });
	const T = (i: number): CqLogPart => ({ text: territoryName(v, i), place: i });
	const say = (text: string, slots: Record<string, CqLogPart>, params?: Record<string, string | number>): CqLogPart[] => {
		// Translate with markers in the slots, then cut the sentence at them.
		const marks: Record<string, string> = {};
		for (const k of Object.keys(slots)) marks[k] = `\u0001${k}\u0001`;
		const out: CqLogPart[] = [];
		for (const piece of t(text, { ...params, ...marks }).split('\u0001')) {
			if (!piece) continue;
			if (piece in slots) out.push(slots[piece]);
			else out.push({ text: piece });
		}
		return out;
	};
	switch (e.type) {
		case 'gameStarted':
			return [{ text: t('The war for the Realm begins.') }];
		case 'deployDone':
			return say(msg('{player} placed their starting armies.'), { player: P(e.player) });
		case 'turnStarted':
			return say(msg('Round {round}: {player} takes the field.'), { player: P(e.player) }, { round: e.round });
		case 'reinforcements':
			return say(msg('{player} musters {n, plural, one {# army} other {# armies}}.'), { player: P(e.player) }, { n: e.total });
		case 'cardsTraded':
			return say(
				msg('{player} traded in a set of cards for {n, plural, one {# army} other {# armies}}.'),
				{ player: P(e.player) },
				{ n: e.armies + (e.bonus === null ? 0 : 2) }
			);
		case 'captured':
			return say(msg('{player} took {place} from {defender}.'), { player: P(e.player), place: T(e.to), defender: P(e.defender) });
		case 'fortified':
			return say(
				msg('{player} moved {n, plural, one {# army} other {# armies}} from {from} to {to}.'),
				{ player: P(e.player), from: T(e.from), to: T(e.to) },
				{ n: e.count }
			);
		case 'cardDrawn':
			if (e.player === v.me && e.card)
				return say(msg('{player} drew a card: {card}.'), { player: P(e.player) }, {
					card: e.card.territory === null ? t(SYMBOL_LABEL.wild) : `${territoryName(v, e.card.territory)} (${t(SYMBOL_LABEL[e.card.symbol])})`
				});
			return say(msg('{player} drew a card.'), { player: P(e.player) });
		case 'eliminated':
			return e.cards
				? say(
						msg('{by} knocked {player} out of the war and took {n, plural, one {# card} other {# cards}}.'),
						{ by: P(e.by), player: P(e.player) },
						{ n: e.cards }
					)
				: say(msg('{by} knocked {player} out of the war.'), { by: P(e.by), player: P(e.player) });
		case 'turnTimedOut':
			return say(msg("{player} ran out of time."), { player: P(e.player) });
		case 'draftStarted':
			return [{ text: t('The warlords gather: each commander picks one to lead their armies.') }];
		case 'warlordPicked':
			return say(msg('{player} rides with {warlord}.'), { player: P(e.player) }, { warlord: `${t(WARLORD_INFO[e.warlord].name)} ${t(WARLORD_INFO[e.warlord].title)}` });
		case 'omen':
			return say(msg('An omen for round {round}: {omen}.'), {}, { round: e.round, omen: t(OMEN_INFO[e.omen].name) });
		case 'omenStruck':
			return e.omen === 'dragon'
				? say(msg('The dragon burns {place}: {n, plural, one {# army} other {# armies}} lost.'), { place: T(e.losses[0].territory) }, { n: e.losses[0].armies })
				: say(msg('The plague takes {n, plural, one {# army} other {# armies}} across the Realm.'), {}, { n: e.losses.reduce((a, l) => a + l.armies, 0) });
		case 'gameOver':
			return e.reason === 'majority'
				? say(msg('{player} holds two thirds of the Realm and wins!'), { player: P(e.winner) })
				: e.reason === 'mission'
					? say(msg('{player} completed their secret mission and wins!'), { player: P(e.winner) })
					: say(msg('{player} conquered the whole Realm!'), { player: P(e.winner) });
		case 'chat':
			return [P(e.player), { text: `: ${e.text}` }];
		default:
			return null;
	}
}
