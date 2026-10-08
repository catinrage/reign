<script lang="ts">
	import { onMount } from 'svelte';
	import { PLAYER_COLORS } from '../../shared/rules/config';
	import { MIN_PLAYERS } from '../../shared/protocol';
	import { client } from '../state/client.svelte';
	import CodeTiles from './menu/CodeTiles.svelte';
	import Embers from './menu/Embers.svelte';
	import { sideLayout } from './menu/sideLayout';
	import { PIXEL } from './pixel';

	const lobby = $derived(client.lobby!);
	const mySeat = $derived(lobby.seats.find((s) => s.id === client.seat));
	const open = $derived(Math.max(0, lobby.maxPlayers - lobby.seats.length));
	let copied = $state(false);

	onMount(sideLayout);

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
	<Embers count={14} />
	<div class="column">
		<div class="card panel">
			<div class="ribbon head">Gather your table</div>

			<div class="invite">
				<span class="label">Room code</span>
				<CodeTiles value={lobby.code} size="big" />
				<button class="btn small wood" onclick={copy}>
					<img class="icon-px" src={copied ? PIXEL.check : PIXEL.letter} alt="" />{copied
						? 'Link copied!'
						: 'Copy invite link'}
				</button>
			</div>

			<div class="divider">
				<i></i><span>Settlers {lobby.seats.length}/{lobby.maxPlayers}</span><i></i>
			</div>

			<div class="seats">
				{#each lobby.seats as s (s.id)}
					<div class="seat plaque" class:me={s.id === client.seat}>
						<span class="shield" style="--shield: var(--art-shield-{s.color})">
							{#if s.isBot}<img class="icon-px" src={PIXEL.bot} alt="bot" />{:else}{s.name
									.slice(0, 1)
									.toUpperCase()}{/if}
						</span>
						<span class="name title">
							{s.name}
							{#if s.id === client.seat}<em>you</em>{/if}
						</span>
						{#if s.isHost}<img class="icon-px tag" src={PIXEL.crown} alt="host" title="Host" />{/if}
						{#if !s.connected}<span class="away">away</span>{/if}
						{#if client.isHost && s.isBot}
							<button
								class="icon-btn kick"
								onclick={() => client.send({ t: 'removeSeat', seat: s.id })}
								title="Remove bot"
								aria-label="Remove {s.name}"
							>
								<img src={PIXEL.close} alt="" />
							</button>
						{/if}
					</div>
				{/each}
				{#each Array(open) as _, k (k)}
					<div class="seat empty">
						<span class="ghost"></span>
						<span class="name">Open seat</span>
						{#if client.isHost}
							<button class="btn small wood" onclick={() => client.send({ t: 'addBot' })}
								><img class="icon-px" src={PIXEL.bot} alt="" />Add bot</button
							>
						{/if}
					</div>
				{/each}
			</div>

			{#if mySeat}
				<div class="colors">
					<span class="label">Your banner</span>
					<div class="banners">
						{#each PLAYER_COLORS as c (c)}
							{@const taken = lobby.seats.some((s) => s.color === c && s.id !== client.seat)}
							<button
								class="banner"
								class:on={mySeat.color === c}
								style="--shield: var(--art-shield-{c})"
								disabled={taken}
								title={taken ? `${c} is taken` : c}
								aria-label={c}
								onclick={() => client.send({ t: 'setColor', color: c })}
							></button>
						{/each}
					</div>
				</div>
			{/if}

			<div class="foot">
				<button class="btn wood" onclick={() => client.leave()}
					><img class="icon-px" src={PIXEL.door} alt="" />Leave</button
				>
				{#if client.isHost}
					<button
						class="btn big shine start"
						disabled={lobby.seats.length < MIN_PLAYERS}
						onclick={() => client.send({ t: 'start' })}
					>
						<img src={PIXEL.play} alt="" />Start game
					</button>
				{:else}
					<span class="wait"
						><img class="icon-px" src={PIXEL.hourglass} alt="" />Waiting for the host…</span
					>
				{/if}
			</div>
			{#if client.isHost && lobby.seats.length < MIN_PLAYERS}
				<p class="hint">Send the link to friends, or add a bot to start.</p>
			{/if}
		</div>
	</div>
</div>

<style>
	.lobby {
		position: absolute;
		inset: 0;
		overflow-y: auto;
		pointer-events: auto;
		background: radial-gradient(
			ellipse 70% 60% at 50% 46%,
			transparent 35%,
			rgba(12, 5, 2, 0.55) 100%
		);
	}
	.column {
		position: relative;
		min-height: 100%;
		box-sizing: border-box;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 40px 12px 20px;
	}
	.card {
		position: relative;
		width: min(460px, 100%);
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: calc(var(--s) * 8) 14px 14px;
		animation: pop-in 0.35s cubic-bezier(0.2, 1.3, 0.4, 1);
	}
	.head {
		--rib: var(--art-ribbon-gold);
		position: absolute;
		top: 0;
		left: 50%;
		transform: translate(-50%, -66%);
		font-size: 22px;
		padding-left: calc(var(--s) * 6);
		padding-right: calc(var(--s) * 6);
	}
	.invite {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
	}
	.invite .btn {
		gap: 8px;
	}
	.invite .btn img {
		height: 18px;
	}
	.seats {
		display: flex;
		flex-direction: column;
		gap: 7px;
	}
	.seat {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 44px;
		padding: 2px 6px 2px 4px;
		box-sizing: border-box;
		animation: pop-in 0.3s ease-out;
	}
	.seat.me {
		filter: drop-shadow(0 0 4px rgba(255, 210, 90, 0.6));
	}
	.seat .shield {
		--s: 2.4px;
		font-size: 16px;
	}
	.seat .shield img {
		width: 18px;
		height: 18px;
	}
	.seat.empty {
		border: 3px dashed rgba(255, 220, 170, 0.22);
		padding: 4px 10px 4px 8px;
	}
	.ghost {
		width: 34px;
		height: 38px;
		border: 2px dashed rgba(255, 220, 170, 0.3);
		box-sizing: border-box;
		clip-path: polygon(0 0, 100% 0, 100% 62%, 50% 100%, 0 62%);
	}
	.name {
		flex: 1;
		font-size: 18px;
		color: #fff2d2;
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: baseline;
		gap: 8px;
	}
	.name em {
		font-style: normal;
		font-size: 12px;
		color: var(--gold);
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}
	.empty .name {
		color: var(--muted);
		font-family: var(--px);
		font-weight: 700;
		font-size: 16px;
	}
	.empty .btn {
		gap: 6px;
	}
	.empty .btn img {
		height: 16px;
	}
	.tag {
		width: 22px;
		height: 22px;
	}
	.away {
		font-size: 12px;
		font-weight: 800;
		color: #ffb08a;
	}
	.kick {
		width: calc(var(--s) * 11);
		height: calc(var(--s) * 11);
		border-image-source: var(--art-btn-red);
	}
	.kick img {
		width: calc(var(--s) * 5);
		height: calc(var(--s) * 5);
	}
	.colors {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		flex-wrap: wrap;
	}
	.banners {
		display: flex;
		gap: 6px;
	}
	.banner {
		width: 32px;
		height: 37px;
		padding: 0;
		border: none;
		background: var(--shield) center / 100% 100%;
		cursor: pointer;
		pointer-events: auto;
		filter: drop-shadow(0 3px 0 rgba(0, 0, 0, 0.45));
		transition: transform 0.12s;
	}
	.banner:hover:not(:disabled) {
		transform: translateY(-3px);
	}
	.banner.on {
		transform: translateY(-4px) scale(1.08);
		filter: drop-shadow(0 0 0 #ffd45a) drop-shadow(0 0 3px #ffd45a)
			drop-shadow(0 3px 0 rgba(0, 0, 0, 0.45));
	}
	.banner:disabled {
		opacity: 0.22;
		cursor: not-allowed;
	}
	.foot {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
	}
	.foot .btn {
		gap: 8px;
	}
	.foot .btn img {
		height: calc(var(--s) * 7);
	}
	.start img {
		height: calc(var(--s) * 9) !important;
	}
	.wait {
		display: flex;
		align-items: center;
		gap: 8px;
		font-family: var(--px);
		font-weight: 700;
		color: var(--muted);
	}
	.wait img {
		width: 20px;
		height: 20px;
		animation: bob 1.2s ease-in-out infinite;
	}
	.hint {
		margin: -6px 0 0;
		color: var(--muted);
		font-size: 14px;
		text-align: right;
	}
	@media (min-width: 1100px) and (min-aspect-ratio: 4/3) {
		.column {
			justify-content: flex-start;
			width: 600px;
			margin-left: max(24px, 4vw);
		}
		.card {
			margin: 0 auto;
		}
	}
</style>
