<script lang="ts">
	import { CHARACTERS, CHARACTER_INFO, traitText, type CharacterId } from '../../../shared/rules/characters';
	import { characterPool } from '../../../shared/rules/modes';
	import { client } from '../../state/client.svelte';
	import Modal from '../menu/Modal.svelte';
	import Portrait from './Portrait.svelte';

	/**
	 * The host decides which characters are in the game; players draft them when it starts, so
	 * nobody picks in the lobby. Guests can open it too, to read what each one does.
	 */
	let { onclose }: { onclose: () => void } = $props();

	const lobby = $derived(client.lobby!);
	const settings = $derived(lobby.settings);
	const host = $derived(client.isHost);
	const pool = $derived(characterPool({ ...settings, characters: true }));
	const players = $derived(lobby.seats.length);
	const short = $derived(settings.characters && pool.length < players);

	function toggle(c: CharacterId) {
		if (!host) return;
		client.send({ t: 'leaveOut', character: c, out: pool.includes(c) });
	}
</script>

<Modal title="Characters" width={780} {onclose}>
	<div class="head">
		<p>
			Each character bends one rule in their favor. When the game starts, everyone drafts one, and the
			first to place a settlement picks last.
		</p>
		{#if host}
			<div class="seg">
				<button class="btn small" class:on={settings.characters} onclick={() => client.send({ t: 'setCharacters', on: true })}
					>Draft</button
				>
				<button class="btn small" class:on={!settings.characters} onclick={() => client.send({ t: 'setCharacters', on: false })}
					>Off</button
				>
			</div>
		{/if}
	</div>
	<p class="count" class:bad={short}>
		{#if !settings.characters}
			Characters are off: everyone plays by the plain rules.
		{:else if short}
			{pool.length} of {CHARACTERS.length} in the draft, but {players} players need at least {players}.
		{:else}
			{pool.length} of {CHARACTERS.length} in the draft{host ? '. Click one to leave it out or put it back.' : '.'}
		{/if}
	</p>
	<div class="grid" class:off={!settings.characters}>
		{#each CHARACTERS as c (c)}
			{@const info = CHARACTER_INFO[c]}
			{@const out = !pool.includes(c)}
			<button
				class="card plaque"
				class:out
				class:view={!host}
				aria-pressed={!out}
				disabled={!settings.characters}
				onclick={() => toggle(c)}
			>
				<Portrait id={c} size={84} />
				<span class="who">
					<span class="name title">{info.name}</span>
					<span class="epithet">{info.title}</span>
				</span>
				<span class="trait">{info.trait}</span>
				<span class="text">{traitText(c, settings.handLimit)}</span>
				{#if out}<span class="tag">Left out</span>{/if}
			</button>
		{/each}
	</div>
</Modal>

<style>
	.head {
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.head p {
		flex: 1;
		margin: 0 !important;
		text-align: left !important;
	}
	.head .seg {
		display: flex;
		gap: 4px;
		flex: none;
	}
	.count {
		margin: 8px 0 10px !important;
		font-size: 14px;
		text-align: left !important;
	}
	.count.bad {
		color: #ffb08a !important;
		font-weight: 700;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
		gap: 8px;
	}
	.grid.off {
		opacity: 0.45;
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
		transition:
			transform 0.12s,
			filter 0.2s;
	}
	.card.view {
		cursor: default;
	}
	.card:hover:not(:disabled):not(.view) {
		transform: translateY(-3px);
	}
	.card:disabled {
		cursor: default;
	}
	.card.out {
		filter: grayscale(0.9) brightness(0.62);
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
	.tag {
		position: absolute;
		top: 40px;
		left: 50%;
		transform: translateX(-50%) rotate(-6deg);
		padding: 2px 7px;
		font-size: 11px;
		font-weight: 800;
		background: rgba(20, 8, 2, 0.82);
		color: #ffb08a;
	}
	@media (max-width: 560px) {
		.head {
			flex-direction: column;
			align-items: stretch;
		}
	}
</style>
