import { conquestMap } from '../../../shared/conquest/queries';
import { OMEN_INFO, OMEN_TONE_LABEL, type OmenId, type OmenTone } from '../../../shared/conquest/omens';
import type { CqView } from '../../../shared/conquest/types';
import { WARLORD_INFO, type WarlordId } from '../../../shared/conquest/warlords';
import { t } from '../../i18n/index.svelte';
import { PIXEL } from '../pixel';
import { CQ_PIXEL } from './icons';
import { playerName, regionName } from './text';

/** Conquest's warlords and omens on screen: their emblems, names and what they do, in words. */

/** Each warlord's emblem: what their trait is about. */
export const WARLORD_ICON: Record<WarlordId, string> = {
	aldric: PIXEL.sword,
	morwen: PIXEL.shieldIcon,
	kael: CQ_PIXEL.knight,
	tobin: PIXEL.cards,
	ysra: PIXEL.anchor,
	dunstan: PIXEL.hammer,
	rowan: PIXEL.clover,
	brannoc: CQ_PIXEL.troops,
	gorm: CQ_PIXEL.skull,
	vey: PIXEL.eye
};

/** "Aldric the Siegemaster", translated. */
export function warlordTitle(w: WarlordId): string {
	const info = WARLORD_INFO[w];
	return `${t(info.name)} ${t(info.title)}`;
}

/** The trait's name and what it does, for a tooltip. */
export function warlordTip(w: WarlordId): string {
	const info = WARLORD_INFO[w];
	return `${t(info.trait)}: ${t(info.text)}`;
}

/** Each kind of omen's emblem and color. */
export const OMEN_TONE_STYLE: Record<OmenTone, { icon: string; color: string }> = {
	blessing: { icon: PIXEL.star, color: '#ffd45a' },
	reprieve: { icon: PIXEL.shieldIcon, color: '#9be36a' },
	upheaval: { icon: PIXEL.raincloud, color: '#8fc8ff' },
	calamity: { icon: CQ_PIXEL.skull, color: '#ff7a5a' }
};

export function omenName(o: OmenId): string {
	return t(OMEN_INFO[o].name);
}

export function omenTone(o: OmenId): string {
	return t(OMEN_TONE_LABEL[OMEN_INFO[o].tone]);
}

/** What this round's omen does, with whom or where it falls on named. */
export function omenText(v: CqView): string {
	const o = v.omens?.current;
	if (!o) return '';
	const text = t(OMEN_INFO[o].text);
	if (o === 'snowbound' && v.omens!.region !== null)
		return `${text} ${t('This round: {region}.', { region: regionName(v, v.omens!.region) })}`;
	if ((o === 'truce' || o === 'mercenaries') && v.omens!.target !== null)
		return `${text} ${t('This round: {player}.', { player: playerName(v, v.omens!.target) })}`;
	return text;
}

/** The world's own name: a random world's as made, the Realm's in the player's language. */
export function worldTitle(v: Pick<CqView, 'settings'>): string {
	const map = conquestMap(v.settings);
	return map.generated ? map.name : t(map.name);
}
