<script lang="ts">
	import { PLAYER_COLORS } from '../../shared/rules/config';
	import { MIN_PLAYERS } from '../../shared/protocol';
	import { client } from '../state/client.svelte';
	import { PLAYER_CSS } from './helpers';
	import { PIXEL } from './pixel';

	const lobby = $derived(client.lobby!);
	const mySeat = $derived(lobby.seats.find((s) => s.id === client.seat));
	let copied = $state(false);

	async function copy() {
		try {
			await navigator.clipboard.writeText(client.inviteLink);
			copied = true;
			setTimeout(() => (copied = false), 1600);
		} catch {
			client.toast(client.inviteLink);
		}
	}
</script>

<div class="lobby">
	<div class="box panel">
		<div class="head">
			<div>
				<div class="label title">Game code</div>
				<div class="code title">{lobby.code}</div>
			</div>
			<button class="btn wood" onclick={copy}>{copied ? 'Link copied!' : 'Copy invite link'}</button>
		</div>

		<div class="seats">
			{#each lobby.seats as s (s.id)}
				<div class="seat" style="--c:{PLAYER_CSS[s.color]}">
					<span class="dot"></span>
					<span class="name title">
						{s.name}
						{#if s.id === client.seat}<em>(you)</em>{/if}
					</span>
					{#if s.isBot}<img class="icon-px tag" src={PIXEL.bot} alt="bot" />{/if}
					{#if s.isHost}<img class="icon-px tag" src={PIXEL.crown} alt="host" title="Host" />{/if}
					{#if !s.connected}<span class="away">away</span>{/if}
					{#if client.isHost && s.isBot}
						<button class="btn small red" onclick={() => client.send({ t: 'removeSeat', seat: s.id })}>Remove</button>
					{/if}
				</div>
			{/each}
			{#each Array(Math.max(0, lobby.maxPlayers - lobby.seats.length)) as _}
				<div class="seat empty">
					<span class="dot"></span><span class="name">Open seat</span>
					{#if client.isHost}
						<button class="btn small wood" onclick={() => client.send({ t: 'addBot' })}>Add bot</button>
					{/if}
				</div>
			{/each}
		</div>

		{#if mySeat}
			<div class="colors">
				<span class="label title">Your color</span>
				<div class="swatches">
					{#each PLAYER_COLORS as c}
						{@const taken = lobby.seats.some((s) => s.color === c && s.id !== client.seat)}
						<button
							class="sw"
							class:on={mySeat.color === c}
							style="--c:{PLAYER_CSS[c]}"
							disabled={taken}
							title={c}
							aria-label={c}
							onclick={() => client.send({ t: 'setColor', color: c })}
						></button>
					{/each}
				</div>
			</div>
		{/if}

		<div class="foot">
			<button class="btn wood" onclick={() => client.leave()}>Leave</button>
			{#if client.isHost}
				<button class="btn big green" disabled={lobby.seats.length < MIN_PLAYERS} onclick={() => client.send({ t: 'start' })}>
					Start game
				</button>
			{:else}
				<span class="wait title">Waiting for the host to start…</span>
			{/if}
		</div>
		{#if client.isHost && lobby.seats.length < MIN_PLAYERS}
			<p class="hint">Share the link with friends or add a bot to start.</p>
		{/if}
	</div>
</div>

<style>
	.lobby {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 16px;
		background: radial-gradient(ellipse at 50% 55%, transparent 30%, rgba(10, 5, 2, 0.5) 100%);
	}
	.box {
		width: min(480px, 100%);
		box-sizing: border-box;
		padding: 22px;
		display: flex;
		flex-direction: column;
		gap: 18px;
		animation: pop-in 0.3s ease-out;
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		flex-wrap: wrap;
	}
	.label {
		font-size: 13px;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.12em;
	}
	.code {
		font-size: 44px;
		color: var(--gold);
		letter-spacing: 0.2em;
		text-shadow: 0 3px 0 #6a3a10;
	}
	.seats {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.seat {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border-radius: 8px;
		background: rgba(0, 0, 0, 0.22);
		box-shadow: inset 0 0 0 2px rgba(255, 220, 170, 0.08);
	}
	.dot {
		width: 22px;
		height: 22px;
		border-radius: 5px;
		background: var(--c, transparent);
		border: 2px solid rgba(0, 0, 0, 0.5);
		box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.4);
	}
	.empty .dot {
		border-style: dashed;
		border-color: rgba(255, 220, 170, 0.3);
	}
	.name {
		flex: 1;
		font-size: 19px;
	}
	.name em {
		font-style: normal;
		color: var(--muted);
		font-size: 14px;
	}
	.empty .name {
		color: var(--muted);
		font-family: var(--px);
	}
	.tag {
		width: 22px;
		height: 22px;
	}
	.away {
		font-size: 12px;
		color: #ffb08a;
	}
	.colors {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		flex-wrap: wrap;
	}
	.swatches {
		display: flex;
		gap: 8px;
	}
	.sw {
		width: 34px;
		height: 34px;
		border-radius: 7px;
		background: var(--c);
		border: 3px solid rgba(0, 0, 0, 0.5);
		box-shadow:
			inset 0 3px 0 rgba(255, 255, 255, 0.45),
			inset 0 -3px 0 rgba(0, 0, 0, 0.25);
		cursor: pointer;
		pointer-events: auto;
		transition: transform 0.1s;
	}
	.sw:hover:not(:disabled) {
		transform: translateY(-2px);
	}
	.sw.on {
		outline: 3px solid var(--gold);
		outline-offset: 2px;
	}
	.sw:disabled {
		opacity: 0.25;
		cursor: not-allowed;
	}
	.foot {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
	}
	.wait {
		color: var(--muted);
	}
	.hint {
		margin: -6px 0 0;
		color: var(--muted);
		font-size: 14px;
		text-align: right;
	}
</style>
