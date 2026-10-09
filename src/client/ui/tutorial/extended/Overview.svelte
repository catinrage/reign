<script lang="ts">
	import { EVENT_CARDS } from '../../../../shared/rules/events';
	import { MAP_PRESETS } from '../../../../shared/board/maps';
	import {
		BANK_PER_RESOURCE,
		BANK_PER_RESOURCE_HUGE,
		BANK_PER_RESOURCE_LARGE,
		DEV_CARDS,
		DEV_DECK,
		DEV_DECK_HUGE,
		DEV_DECK_LARGE,
		DISCARD_THRESHOLD,
		VICTORY_POINTS_TO_WIN
	} from '../../../../shared/rules/config';
	import { EXTRA_BUILDINGS, type ExtraBuilding } from '../../../../shared/rules/buildings';
	import { CHARACTERS } from '../../../../shared/rules/characters';
	import { CLASSIC_PLAYERS, MAX_PLAYERS } from '../../../../shared/protocol';
	import { HAND_LIMIT_MAX, HAND_LIMIT_MIN, POINT_GOALS, POINTS_MAX, POINTS_MIN } from '../../../../shared/rules/modes';
	import Rich from '../../../i18n/Rich.svelte';
	import { msg, num, t } from '../../../i18n/index.svelte';
	import { PIXEL } from '../../pixel';
	import { TUT_ICON } from '../icons';

	const deck = (d: Record<string, number>) => DEV_CARDS.reduce((n, c) => n + d[c], 0);
	/** The new buildings as the table names them mid-sentence. */
	const LOWER: Record<ExtraBuilding, string> = {
		workshop: msg('workshops'),
		stoneRoad: msg('stone roads'),
		storehouse: msg('storehouses')
	};
	/** "A, B and C" in the current language. */
	const list = (items: string[]) =>
		items.reduce(
			(acc, item, i) =>
				i === 0 ? item : i < items.length - 1 ? t('{list}, {item}', { list: acc, item }) : t('{list} and {item}', { list: acc, item }),
			''
		);
	const rows = $derived([
		{
			icon: TUT_ICON.scroll,
			name: t('Island'),
			classic: t('The standard 19 tiles.'),
			extended: t('{count} ready-made islands, or one you draw yourself.', { count: MAP_PRESETS.length })
		},
		{
			icon: TUT_ICON.mask,
			name: t('Characters'),
			classic: t('None.'),
			extended: t('Each player has one of {count}, with a trait that bends a rule.', { count: CHARACTERS.length })
		},
		{
			icon: PIXEL.hammer,
			name: t('Buildings'),
			classic: t('Roads, settlements and cities.'),
			extended: t('Also {buildings}, if the host keeps them on.', { buildings: list(EXTRA_BUILDINGS.map((b) => t(LOWER[b]))) })
		},
		{
			icon: PIXEL.star,
			name: t('Events'),
			classic: t('None.'),
			extended: t('A card from a deck of {count} turns over each round, unless the host turns them off.', { count: EVENT_CARDS.length })
		},
		{
			icon: PIXEL.crown,
			name: t('Points to win'),
			classic: t('Always {points}.', { points: VICTORY_POINTS_TO_WIN }),
			extended: t('The host picks {goals}, or any number from {min} to {max}.', {
				goals: POINT_GOALS.map(num).join(', '),
				min: POINTS_MIN,
				max: POINTS_MAX
			})
		},
		{
			icon: PIXEL.bot,
			name: t('Players'),
			classic: t('Up to {players}.', { players: CLASSIC_PLAYERS }),
			extended: t('Up to {players} on the bigger islands.', { players: MAX_PLAYERS })
		},
		{
			icon: PIXEL.cards,
			name: t('Hand limit on a 7'),
			classic: t('Discard half above {limit} cards.', { limit: DISCARD_THRESHOLD }),
			extended: t('The host sets it, from {min} to {max} ({limit} unless changed).', {
				min: HAND_LIMIT_MIN,
				max: HAND_LIMIT_MAX,
				limit: DISCARD_THRESHOLD
			})
		},
		{
			icon: PIXEL.cards,
			name: t('Bank and deck'),
			classic: t('{bank} of each resource, {cards} cards.', { bank: BANK_PER_RESOURCE, cards: deck(DEV_DECK) }),
			extended: t('With 5 or 6 players: {bank} of each, {cards} cards. With 7 or 8: {bankHuge} of each, {cardsHuge} cards.', {
				bank: BANK_PER_RESOURCE_LARGE,
				cards: deck(DEV_DECK_LARGE),
				bankHuge: BANK_PER_RESOURCE_HUGE,
				cardsHuge: deck(DEV_DECK_HUGE)
			})
		}
	]);
</script>

<p>
	{t('Reign Extended is the same game with more to it. Every rule from the Classic chapters still applies: the same resources, building costs, robber and development cards. On top of that, the host shapes the table in the lobby.')}
</p>

<div class="compare">
	<span></span>
	<span class="label head">{t('Classic')}</span>
	<span class="label head ext">{t('Reign Extended')}</span>
	{#each rows as r (r.name)}
		<span class="what"><img class="icon-px" src={r.icon} alt="" /><b>{r.name}</b></span>
		<span class="cell">{r.classic}</span>
		<span class="cell ext">{r.extended}</span>
	{/each}
</div>

{#snippet bExtended()}<b>{t('Reign Extended')}</b>{/snippet}
{#snippet bIsland()}<b>{t('Island')}</b>{/snippet}
{#snippet bPoints()}<b>{t('points to win')}</b>{/snippet}
{#snippet bCharacters()}<b>{t('characters')}</b>{/snippet}
{#snippet bBuildings()}<b>{t('Buildings')}</b>{/snippet}

<h3>{t('Setting up a game')}</h3>
<ul class="rows">
	<li>
		<img class="icon-px" src={PIXEL.house} alt="" /><span
			><Rich text={t('Create a room and pick {mode} at the top of the lobby.')} slots={{ mode: bExtended }} /></span
		>
	</li>
	<li>
		<img class="icon-px" src={TUT_ICON.scroll} alt="" /><span
			><Rich text={t('Choose the island under {island}. Bigger islands open more seats.')} slots={{ island: bIsland }} /></span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.crown} alt="" /><span
			><Rich text={t('Set the {points}: lower for a quick game, higher for a long one.')} slots={{ points: bPoints }} /></span
		>
	</li>
	<li>
		<img class="icon-px" src={TUT_ICON.mask} alt="" /><span
			><Rich
				text={t("Turn {characters} on or off, and leave out any you don't want. Everyone drafts one when the game starts.")}
				slots={{ characters: bCharacters }}
			/></span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.hammer} alt="" /><span
			><Rich text={t('Under {buildings}, pick which of the new buildings are in the game.')} slots={{ buildings: bBuildings }} /></span
		>
	</li>
</ul>

<p class="tip">
	<img class="icon-px" src={PIXEL.book} alt="" /><span
		>{t('Reign Extended is still growing. Whatever it adds next gets its own chapter in this book.')}</span
	>
</p>

<style>
	.compare {
		display: grid;
		grid-template-columns: auto 1fr 1fr;
		margin: 6px 0 4px;
		background: rgba(255, 250, 235, 0.5);
		box-shadow: inset 0 0 0 2px rgba(138, 98, 54, 0.3);
	}
	.compare > span {
		padding: 8px 12px;
		border-top: 2px solid rgba(138, 98, 54, 0.2);
		line-height: 1.35;
	}
	.compare > span:nth-child(-n + 3) {
		border-top: none;
	}
	.head {
		align-self: end;
	}
	.what {
		display: flex;
		align-items: center;
		gap: 8px;
		white-space: nowrap;
	}
	.what img {
		width: 24px;
		height: 24px;
	}
	.cell {
		font-size: 14.5px;
		color: var(--ink-soft);
	}
	.ext {
		background: rgba(122, 78, 194, 0.09);
	}
	.cell.ext {
		color: var(--ink);
	}
	.label.ext {
		color: #5a3496;
	}
	@media (max-width: 760px) {
		.compare > span {
			padding: 6px 8px;
		}
		.what b {
			display: none;
		}
	}
</style>
