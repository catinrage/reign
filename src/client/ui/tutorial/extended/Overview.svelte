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
	import { BUILDING_INFO, EXTRA_BUILDINGS } from '../../../../shared/rules/buildings';
	import { CHARACTERS } from '../../../../shared/rules/characters';
	import { CLASSIC_PLAYERS, MAX_PLAYERS } from '../../../../shared/protocol';
	import { HAND_LIMIT_MAX, HAND_LIMIT_MIN, POINT_GOALS, POINTS_MAX, POINTS_MIN } from '../../../../shared/rules/modes';
	import { andList } from '../../helpers';
	import { PIXEL } from '../../pixel';
	import { TUT_ICON } from '../icons';

	const deck = (d: Record<string, number>) => DEV_CARDS.reduce((n, c) => n + d[c], 0);
	const rows = [
		{
			icon: TUT_ICON.scroll,
			name: 'Island',
			classic: 'The standard 19 tiles.',
			extended: `${MAP_PRESETS.length} ready-made islands, or one you draw yourself.`
		},
		{
			icon: TUT_ICON.mask,
			name: 'Characters',
			classic: 'None.',
			extended: `Each player has one of ${CHARACTERS.length}, with a trait that bends a rule.`
		},
		{
			icon: PIXEL.hammer,
			name: 'Buildings',
			classic: 'Roads, settlements and cities.',
			extended: `Also ${andList(EXTRA_BUILDINGS.map((b) => BUILDING_INFO[b].name.toLowerCase()))}, if the host keeps them on.`
		},
		{
			icon: PIXEL.star,
			name: 'Events',
			classic: 'None.',
			extended: `A card from a deck of ${EVENT_CARDS.length} turns over each round, unless the host turns them off.`
		},
		{
			icon: PIXEL.crown,
			name: 'Points to win',
			classic: `Always ${VICTORY_POINTS_TO_WIN}.`,
			extended: `The host picks ${POINT_GOALS.join(', ')}, or any number from ${POINTS_MIN} to ${POINTS_MAX}.`
		},
		{
			icon: PIXEL.bot,
			name: 'Players',
			classic: `Up to ${CLASSIC_PLAYERS}.`,
			extended: `Up to ${MAX_PLAYERS} on the bigger islands.`
		},
		{
			icon: PIXEL.cards,
			name: 'Hand limit on a 7',
			classic: `Discard half above ${DISCARD_THRESHOLD} cards.`,
			extended: `The host sets it, from ${HAND_LIMIT_MIN} to ${HAND_LIMIT_MAX} (${DISCARD_THRESHOLD} unless changed).`
		},
		{
			icon: PIXEL.cards,
			name: 'Bank and deck',
			classic: `${BANK_PER_RESOURCE} of each resource, ${deck(DEV_DECK)} cards.`,
			extended: `With 5 or 6 players: ${BANK_PER_RESOURCE_LARGE} of each, ${deck(DEV_DECK_LARGE)} cards. With 7 or 8: ${BANK_PER_RESOURCE_HUGE} of each, ${deck(DEV_DECK_HUGE)} cards.`
		}
	];
</script>

<p>
	Reign Extended is the same game with more to it. Every rule from the Classic chapters still
	applies: the same resources, building costs, robber and development cards. On top of that, the
	host shapes the table in the lobby.
</p>

<div class="compare">
	<span></span>
	<span class="label head">Classic</span>
	<span class="label head ext">Reign Extended</span>
	{#each rows as r (r.name)}
		<span class="what"><img class="icon-px" src={r.icon} alt="" /><b>{r.name}</b></span>
		<span class="cell">{r.classic}</span>
		<span class="cell ext">{r.extended}</span>
	{/each}
</div>

<h3>Setting up a game</h3>
<ul class="rows">
	<li>
		<img class="icon-px" src={PIXEL.house} alt="" /><span
			>Create a room and pick <b>Reign Extended</b> at the top of the lobby.</span
		>
	</li>
	<li>
		<img class="icon-px" src={TUT_ICON.scroll} alt="" /><span
			>Choose the island under <b>Island</b>. Bigger islands open more seats.</span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.crown} alt="" /><span
			>Set the <b>points to win</b>: lower for a quick game, higher for a long one.</span
		>
	</li>
	<li>
		<img class="icon-px" src={TUT_ICON.mask} alt="" /><span
			>Turn <b>characters</b> on or off, and leave out any you don't want. Everyone drafts one when the
			game starts.</span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.hammer} alt="" /><span
			>Under <b>Buildings</b>, pick which of the new buildings are in the game.</span
		>
	</li>
</ul>

<p class="tip">
	<img class="icon-px" src={PIXEL.book} alt="" /><span
		>Reign Extended is still growing. Whatever it adds next gets its own chapter in this book.</span
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
