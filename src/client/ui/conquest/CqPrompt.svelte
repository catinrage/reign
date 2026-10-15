<script lang="ts">
	import { t } from '../../i18n/index.svelte';
	import { client } from '../../state/client.svelte';
	import TurnClock from '../game/TurnClock.svelte';
	import { ui } from '../game/ui.svelte';
	import { PIXEL } from '../pixel';
	import { cqPlay } from './play.svelte';
	import { playerName, territoryName } from './text';

	/** The banner at the top: what to do now, or who the table is waiting for. */
	const v = $derived(cqPlay.view!);
	const mine = $derived(cqPlay.myTurn || cqPlay.deploying);
	const ended = $derived(v.phase === 'ended');
	const color = $derived(
		v.phase === 'deploy' && v.me >= 0 ? v.players[v.me].color : (v.players[v.current]?.color ?? 'white')
	);
	const text = $derived.by(() => {
		const p = cqPlay;
		if (ended) {
			const w = v.winner ?? 0;
			return w === v.me ? t('You conquered the Realm!') : t('{player} conquered the Realm!', { player: playerName(v, w) });
		}
		if (v.phase === 'draft' && v.draft) {
			const picker = v.draft.order[v.draft.picked];
			return picker === v.me ? t('Choose your warlord') : t('{player} is choosing a warlord', { player: playerName(v, picker) });
		}
		if (v.phase === 'deploy') {
			if (p.deploying) return t('Place your starting armies: {n} left', { n: p.reserve });
			const waiting = v.players.filter((_, i) => v.reserve[i] > 0).map((pl) => pl.name);
			return waiting.length === 1
				? t('Waiting for {player} to place their armies', { player: waiting[0] })
				: t('Waiting for the others to place their armies');
		}
		if (!p.myTurn) {
			const who = playerName(v, v.current);
			if (v.step === 'reinforce') return t('{player} is reinforcing', { player: who });
			if (v.step === 'fortify') return t('{player} is fortifying', { player: who });
			return t('{player} is attacking', { player: who });
		}
		if (v.mustTrade) return t('You hold {n} cards: trade in a set', { n: v.players[v.me]?.cardCount ?? 5 });
		if (p.placing) return t('Place {n, plural, one {# army} other {# armies}} on your territories', { n: p.reserve });
		if (p.occupying) return t('Move armies into {place}', { place: territoryName(v, v.occupy!.to) });
		if (p.attacking) {
			if (p.selected === null) return t('Attack: pick one of your territories to attack from');
			return t('Attack from {place}: pick an enemy next to it', { place: territoryName(v, p.selected) });
		}
		if (p.fortifying) {
			if (p.selected === null) return t('Fortify: pick armies to move, or end your turn');
			if (p.target === null) return t('Pick where to move armies from {place}', { place: territoryName(v, p.selected) });
			return t('Move armies from {from} to {to}', { from: territoryName(v, p.selected), to: territoryName(v, p.target) });
		}
		return t('Your turn');
	});
</script>

<div class="wrap" style:--corner="{ui.cornerWidth ? 14 + ui.cornerWidth + 12 : 290}px">
	<div class="banner">
		{#key text}
			<div class="ribbon" class:mine={mine && !client.spectating} style="--rib: var(--art-ribbon-{ended ? 'gold' : color})">
				{#if !mine && !ended}<img class="icon-px" src={PIXEL.hourglass} alt="" />{/if}
				<span class="text">{text}</span>
			</div>
		{/key}
		<TurnClock {color} />
	</div>
</div>

<style>
	.wrap {
		position: absolute;
		top: 14px;
		left: 0;
		right: 0;
		display: grid;
		grid-template-columns: minmax(var(--corner), 1fr) auto minmax(290px, 1fr);
		pointer-events: none;
	}
	.banner {
		grid-column: 2;
		position: relative;
		display: flex;
		min-width: 0;
	}
	.ribbon {
		max-width: 100%;
		font-size: 19px;
		pointer-events: auto;
		animation: drop-in 0.4s cubic-bezier(0.2, 1.3, 0.4, 1);
	}
	.ribbon.mine {
		animation:
			drop-in 0.4s cubic-bezier(0.2, 1.3, 0.4, 1),
			glow 1.8s ease-in-out infinite 0.4s;
	}
	.ribbon img {
		width: 20px;
		height: 20px;
		flex: none;
		filter: drop-shadow(0 2px 0 rgba(0, 0, 0, 0.6));
	}
	.text {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	@media (max-width: 900px) {
		.wrap {
			top: 68px;
			display: flex;
			justify-content: center;
		}
		.banner {
			max-width: calc(100vw / var(--ui-zoom) - 32px);
		}
		.ribbon {
			font-size: 15px;
		}
	}
</style>
