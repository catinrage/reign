<script module lang="ts">
	/** The games whose mission card has opened by itself already (by their deal and mission). */
	const seen = new Set<string>();
</script>

<script lang="ts">
	import { t } from '../../i18n/index.svelte';
	import { client } from '../../state/client.svelte';
	import { PIXEL } from '../pixel';
	import { sfx } from '../sound';
	import { missionSteps, missionText } from './missions';
	import { cqPlay } from './play.svelte';
	import { playerName } from './text';

	/**
	 * Your secret mission on a sealed card: what it asks and how far you have come with it. It opens
	 * by itself as the war begins, and again from the mission chip beside the round.
	 */
	const v = $derived(cqPlay.view!);
	const mission = $derived(v.me >= 0 && !client.spectating && !client.replaying ? (v.players[v.me]?.mission ?? null) : null);
	const steps = $derived(mission ? missionSteps(v, v.me, mission) : []);

	$effect(() => {
		if (!mission || v.round > 1) return;
		const dealt = v.log.find((e) => e.type === 'dealt');
		if (dealt?.type !== 'dealt') return;
		const key = JSON.stringify([dealt.owner, mission]);
		if (seen.has(key)) return;
		seen.add(key);
		sfx.open();
		cqPlay.missionOpen = true;
	});

	function close() {
		sfx.close();
		cqPlay.missionOpen = false;
	}
</script>

{#if cqPlay.missionOpen && mission}
	<div class="modal-backdrop orders" role="dialog" aria-modal="true" aria-label={t('Your secret mission')}>
		<div class="card panel">
			<div class="ribbon" style="--rib: var(--art-ribbon-gold)">
				<img class="icon-px" src={PIXEL.letter} alt="" />
				{t('Your secret mission')}
			</div>
			<p class="ask">{missionText(v, mission)}</p>
			{#if mission.kind === 'territories' && mission.instead !== undefined}
				<p class="changed">{t('{player} was knocked out by someone else, so your mission changed.', { player: playerName(v, mission.instead) })}</p>
			{/if}
			<ul class="steps">
				{#each steps as s (s.label)}
					<li class:count={s.left !== undefined}>
						<span class="label">{s.label}</span>
						{#if s.left !== undefined}
							<b class="n" class:done={s.left === 0}>{s.left === 0 ? t('Done!') : s.left}</b>
						{:else}
							<span class="bar" aria-hidden="true"><i style="width:{(s.done / s.of) * 100}%"></i></span>
							<b class="n" class:done={s.done >= s.of}>{s.done}/{s.of}</b>
						{/if}
					</li>
				{/each}
			</ul>
			<p class="tip">{t('Complete it and you win at once; taking every territory wins too. Keep it to yourself!')}</p>
			<button class="btn green shine" onclick={close}>{t('To war!')}</button>
		</div>
	</div>
{/if}

<style>
	.orders {
		z-index: 45;
		pointer-events: auto;
	}
	.card {
		position: relative;
		width: min(400px, calc(100vw / var(--ui-zoom) - 24px));
		padding: 30px 18px 14px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		animation: pop-in 0.35s cubic-bezier(0.2, 1.3, 0.4, 1) both;
	}
	.ribbon {
		position: absolute;
		top: -16px;
		left: 50%;
		transform: translateX(-50%);
		display: inline-flex;
		align-items: center;
		gap: 8px;
		white-space: nowrap;
	}
	.ribbon img {
		width: 24px;
		height: 24px;
	}
	.ask {
		margin: 4px 0 0;
		font-family: var(--px);
		font-size: 19px;
		line-height: 1.35;
		text-align: center;
		color: #fff2d2;
		text-shadow: var(--outline-dark);
	}
	.changed {
		margin: 0;
		font-size: 13px;
		text-align: center;
		color: #ffd27a;
	}
	.steps {
		list-style: none;
		margin: 0;
		padding: 8px 10px;
		width: 100%;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 6px;
		background: rgba(20, 10, 4, 0.35);
		border-radius: 6px;
	}
	.steps li {
		display: grid;
		grid-template-columns: 1fr 110px auto;
		align-items: center;
		gap: 8px;
		font-size: 14px;
		color: #e2cba8;
	}
	.steps li.count {
		grid-template-columns: 1fr auto;
	}
	.bar {
		height: 8px;
		border-radius: 4px;
		background: rgba(0, 0, 0, 0.45);
		box-shadow: inset 0 1px 0 rgba(0, 0, 0, 0.5);
		overflow: hidden;
	}
	.bar i {
		display: block;
		height: 100%;
		background: linear-gradient(#ffe08a, #e0a83a);
		transition: width 0.4s ease-out;
	}
	.n {
		font-weight: 900;
		color: #fff2d2;
		min-width: 3.5ch;
		text-align: right;
	}
	.n.done {
		color: #9fe36a;
	}
	.tip {
		margin: 0;
		font-size: 12px;
		line-height: 1.35;
		text-align: center;
		color: var(--muted);
	}
</style>
