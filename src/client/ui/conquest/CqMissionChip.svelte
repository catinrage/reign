<script lang="ts">
	import { t } from '../../i18n/index.svelte';
	import { client } from '../../state/client.svelte';
	import { PIXEL } from '../pixel';
	import { sfx } from '../sound';
	import { CQ_PIXEL } from './icons';
	import { missionShort, missionSteps, missionText } from './missions';
	import { cqPlay } from './play.svelte';
	import { playerName } from './text';

	/**
	 * Your secret mission beside the round: how far along it is (or, against a player, how many
	 * territories they have left), the mission itself in the tooltip, and its card on a click.
	 */
	const v = $derived(cqPlay.view);
	const mission = $derived(v && v.me >= 0 && !client.spectating && !client.replaying ? (v.players[v.me]?.mission ?? null) : null);
	const lines = $derived(
		v && mission
			? [missionText(v, mission), ...missionSteps(v, v.me, mission).map((s) => `${s.label}: ${s.left ?? `${s.done}/${s.of}`}`)].join('\n')
			: ''
	);

	// Your target knocked out by someone else: say so, and show the new mission.
	let last: string | null = null;
	$effect(() => {
		const key = mission ? JSON.stringify(mission) : null;
		if (v && last && key !== last && mission?.kind === 'territories' && mission.instead !== undefined) {
			client.toast(
				t('{player} was knocked out by someone else: your mission is now to hold {n} territories.', {
					player: playerName(v, mission.instead),
					n: mission.count
				})
			);
			cqPlay.missionOpen = true;
		}
		last = key;
	});
</script>

{#if v && mission}
	<button
		class="mission-chip plaque"
		title={lines}
		data-tip-head={t('Secret mission')}
		data-tip-note={t('Click to see your mission card.')}
		aria-label={t('Secret mission')}
		onclick={() => {
			sfx.open();
			cqPlay.missionOpen = !cqPlay.missionOpen;
		}}
	>
		<img class="icon-px" src={mission.kind === 'destroy' ? CQ_PIXEL.skull : PIXEL.letter} alt="" />
		<span class="n">{missionShort(v, v.me, mission)}</span>
	</button>
{/if}

<style>
	.mission-chip {
		margin: 0;
		font: inherit;
		pointer-events: auto;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: calc(var(--s) * 16);
		box-sizing: border-box;
		padding: 0 calc(var(--s) * 3) 0 calc(var(--s) * 2);
		font-family: var(--body);
		font-weight: 900;
		font-size: 17px;
		color: #fff2d2;
		text-shadow: var(--outline-dark);
		white-space: nowrap;
		animation: pop-in 0.35s cubic-bezier(0.2, 1.3, 0.4, 1) both;
	}
	.mission-chip img {
		width: 22px;
		height: 22px;
	}
</style>
