<script lang="ts">
	import { CHARACTERS, CHARACTER_INFO, type CharacterId } from '../../../shared/rules/characters';
	import { client } from '../../state/client.svelte';
	import Modal from '../menu/Modal.svelte';
	import Portrait from './Portrait.svelte';

	let { onclose }: { onclose: () => void } = $props();

	const lobby = $derived(client.lobby!);
	const mine = $derived(lobby.seats.find((s) => s.id === client.seat)?.character ?? null);
	const takenBy = (c: CharacterId) => lobby.seats.find((s) => s.character === c && s.id !== client.seat);

	function choose(c: CharacterId) {
		client.send({ t: 'setCharacter', character: c });
		onclose();
	}
</script>

<Modal title="Choose your character" width={760} {onclose}>
	<p>Each character bends one rule in their favor. No two players can share one.</p>
	<div class="grid">
		{#each CHARACTERS as c (c)}
			{@const info = CHARACTER_INFO[c]}
			{@const other = takenBy(c)}
			<button class="card plaque" class:on={mine === c} disabled={!!other} onclick={() => choose(c)}>
				<Portrait id={c} size={96} />
				<span class="who">
					<span class="name title">{info.name}</span>
					<span class="epithet">{info.title}</span>
				</span>
				<span class="trait">{info.trait}</span>
				<span class="text">{info.text}</span>
				{#if other}<span class="taken">{other.name}</span>{/if}
			</button>
		{/each}
	</div>
</Modal>

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 8px;
	}
	.card {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 8px 6px 10px;
		color: var(--text);
		font: inherit;
		cursor: pointer;
		text-align: center;
		transition: transform 0.12s;
	}
	.card:hover:not(:disabled) {
		transform: translateY(-3px);
	}
	.card.on {
		filter: drop-shadow(0 0 0 #ffd45a) drop-shadow(0 0 4px #ffd45a);
	}
	.card:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
	.who {
		display: flex;
		flex-direction: column;
		line-height: 1.1;
	}
	.name {
		font-size: 18px;
		color: #fff2d2;
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
	}
	.epithet {
		font-size: 12px;
		color: var(--muted);
	}
	.trait {
		font-family: var(--px);
		font-weight: 700;
		font-size: 13px;
		color: var(--gold);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.text {
		font-size: 13px;
		line-height: 1.3;
		color: #f1dfc2;
		text-wrap: balance;
	}
	.taken {
		position: absolute;
		top: 10px;
		right: 8px;
		padding: 1px 6px;
		font-size: 11px;
		font-weight: 800;
		background: rgba(20, 8, 2, 0.8);
		color: #ffb08a;
	}
</style>
