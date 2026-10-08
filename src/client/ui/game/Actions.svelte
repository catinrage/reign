<script lang="ts">
	import type { BuildKind } from '../../../shared/rules/config';
	import { getIcons } from '../../scene/icons';
	import { client } from '../../state/client.svelte';
	import { COSTS, buildAvailable, countsList, myTurn } from '../helpers';
	import { PIXEL } from '../pixel';
	import { ui } from './ui.svelte';

	const view = $derived(client.view!);
	const mine = $derived(myTurn(view));
	const color = $derived(view.players[view.me]?.color ?? 'white');
	const icons = getIcons().urls;

	const builds: { kind: BuildKind; label: string }[] = [
		{ kind: 'road', label: 'Road' },
		{ kind: 'settlement', label: 'Settlement' },
		{ kind: 'city', label: 'City' },
		{ kind: 'devCard', label: 'Dev card' }
	];

	function onBuild(kind: BuildKind) {
		if (kind === 'devCard') return client.act({ type: 'buyDevCard' });
		ui.build = ui.build === kind ? null : kind;
	}
	function iconFor(kind: BuildKind) {
		return kind === 'devCard' ? PIXEL.dev : icons[`${kind}:${color}`];
	}
</script>

{#if view.me >= 0 && view.phase !== 'ended'}
	<div class="actions">
		{#if mine && view.step === 'roll'}
			<button class="btn big green roll" onclick={() => client.act({ type: 'rollDice' })}>
				<span class="d">⚄</span> Roll dice
			</button>
		{/if}
		{#if mine && view.step === 'main'}
			<div class="builds panel">
				{#each builds as b}
					{@const ok = buildAvailable(view, b.kind)}
					<button class="build" class:active={ui.build === b.kind} disabled={!ok} onclick={() => onBuild(b.kind)}>
						<img class:icon-px={b.kind === 'devCard'} src={iconFor(b.kind)} alt="" />
						<span class="label title">{b.label}</span>
						<span class="cost">
							{#each countsList(COSTS[b.kind]) as c}
								{#each Array(c.n) as _}<img class="res" src={icons[c.res]} alt={c.res} />{/each}
							{/each}
						</span>
					</button>
				{/each}
			</div>
			<div class="row">
				<button class="btn wood" onclick={() => (ui.trade = !ui.trade)}>
					<img class="icon-px" src={PIXEL.trade} alt="" width="20" /> Trade
				</button>
				<button class="btn red" onclick={() => { ui.build = null; ui.trade = false; client.act({ type: 'endTurn' }); }}>End turn</button>
			</div>
		{/if}
	</div>
{/if}

<style>
	.actions {
		position: absolute;
		right: 14px;
		bottom: 14px;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 10px;
		pointer-events: none;
	}
	.roll {
		font-size: 24px;
		animation: bob 1.4s ease-in-out infinite;
	}
	.roll .d {
		font-size: 28px;
		line-height: 1;
	}
	.builds {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px;
		padding: 8px;
	}
	.build {
		pointer-events: auto;
		display: grid;
		grid-template-columns: 40px 1fr;
		grid-template-rows: auto auto;
		align-items: center;
		column-gap: 8px;
		padding: 6px 10px 6px 6px;
		border-radius: 8px;
		border: 2px solid rgba(0, 0, 0, 0.45);
		background: linear-gradient(180deg, rgba(255, 230, 190, 0.14), rgba(0, 0, 0, 0.18));
		box-shadow: inset 0 1px 0 rgba(255, 230, 190, 0.2);
		color: var(--text);
		cursor: pointer;
		text-align: left;
		transition:
			transform 0.1s,
			background 0.15s;
		min-width: 150px;
	}
	.build:hover:not(:disabled) {
		transform: translateY(-2px);
		background: linear-gradient(180deg, rgba(255, 230, 190, 0.24), rgba(0, 0, 0, 0.1));
	}
	.build.active {
		border-color: var(--gold);
		background: linear-gradient(180deg, rgba(255, 210, 110, 0.4), rgba(120, 70, 10, 0.3));
	}
	.build:disabled {
		cursor: not-allowed;
		opacity: 0.45;
		filter: grayscale(0.6);
	}
	.build > img {
		grid-row: 1 / 3;
		width: 40px;
		height: 40px;
		object-fit: contain;
		filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.4));
	}
	.label {
		font-size: 15px;
	}
	.cost {
		display: flex;
		gap: 1px;
	}
	.cost .res {
		width: 18px;
		height: 18px;
		filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.5));
	}
	.row {
		display: flex;
		gap: 8px;
	}
	@media (max-width: 900px) {
		.actions {
			right: 8px;
			bottom: 8px;
			left: 8px;
			align-items: stretch;
		}
		.builds {
			grid-template-columns: repeat(4, 1fr);
			padding: 5px;
			gap: 4px;
		}
		.build {
			min-width: 0;
			grid-template-columns: 1fr;
			justify-items: center;
			padding: 4px;
		}
		.build > img {
			grid-row: auto;
			width: 30px;
			height: 30px;
		}
		.label {
			font-size: 11px;
		}
		.cost .res {
			width: 12px;
			height: 12px;
		}
		.row {
			justify-content: flex-end;
		}
	}
</style>
