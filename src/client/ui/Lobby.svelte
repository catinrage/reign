<script lang="ts">
	import { onMount } from 'svelte';
	import { mapName, presetById } from '../../shared/board/maps';
	import { CHARACTER_INFO } from '../../shared/rules/characters';
	import { PLAYER_COLORS } from '../../shared/rules/config';
	import { GAME_MODES, MODE_INFO, POINT_GOALS } from '../../shared/rules/modes';
	import { MIN_PLAYERS, TURN_TIMES } from '../../shared/protocol';
	import { client } from '../state/client.svelte';
	import CharacterPicker from './extended/CharacterPicker.svelte';
	import MapPicker from './extended/MapPicker.svelte';
	import MapPreview from './extended/MapPreview.svelte';
	import Portrait from './extended/Portrait.svelte';
	import CodeTiles from './menu/CodeTiles.svelte';
	import Embers from './menu/Embers.svelte';
	import { sideLayout } from './menu/sideLayout';
	import { PIXEL } from './pixel';
	import { sceneRef } from './sceneRef';

	const lobby = $derived(client.lobby!);
	const mySeat = $derived(lobby.seats.find((s) => s.id === client.seat));
	const open = $derived(Math.max(0, lobby.maxPlayers - lobby.seats.length));
	let copied = $state(false);
	const settings = $derived(lobby.settings);
	const extended = $derived(settings.mode === 'extended');
	const myChar = $derived(mySeat?.character ? CHARACTER_INFO[mySeat.character] : null);
	const mapTiles = $derived(
		'preset' in settings.map ? (presetById(settings.map.preset)?.tiles ?? []) : settings.map.custom.tiles
	);
	const mapBlurb = $derived('preset' in settings.map ? (presetById(settings.map.preset)?.blurb ?? '') : 'A map made in the map maker.');
	let picking = $state<'character' | 'map' | null>(null);
	// The table shows the island that will be played.
	$effect(() => sceneRef.current?.showMenuMap(extended ? mapTiles : null));

	onMount(sideLayout);

	function shortTime(t: number) {
		return !t ? 'Unlimited' : t < 120 ? `${t} sec` : `${t / 60} min`;
	}
	function longTime(t: number) {
		return !t ? 'Unlimited' : t < 120 ? `${t} seconds a turn` : `${t / 60} minutes a turn`;
	}

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

			<div class="modes" role="radiogroup" aria-label="Game mode">
				{#each GAME_MODES as m (m)}
					<button
						class="mode plaque"
						class:on={settings.mode === m}
						role="radio"
						aria-checked={settings.mode === m}
						disabled={!client.isHost}
						onclick={() => client.send({ t: 'setMode', mode: m })}
					>
						<span class="mode-name title">
							{#if m === 'extended'}<img class="icon-px" src={PIXEL.crown} alt="" />{/if}{MODE_INFO[m].name}
						</span>
						<span class="mode-text">{MODE_INFO[m].text}</span>
					</button>
				{/each}
			</div>

			<div class="divider">
				<i></i><span>Settlers {lobby.seats.length}/{lobby.maxPlayers}</span><i></i>
			</div>

			<div class="seats">
				{#each lobby.seats as s (s.id)}
					<div class="seat plaque" class:me={s.id === client.seat} class:ext={extended}>
						{#if extended}
							<span class="face">
								<Portrait id={s.character} size={46} />
								<span class="shield mini" style="--shield: var(--art-shield-{s.color})"></span>
							</span>
						{:else}
							<span class="shield" style="--shield: var(--art-shield-{s.color})">
								{#if s.isBot}<img class="icon-px" src={PIXEL.bot} alt="bot" />{:else}{s.name
										.slice(0, 1)
										.toUpperCase()}{/if}
							</span>
						{/if}
						<span class="name title">
							<span class="who">
								<span>
									{s.name}
									{#if s.id === client.seat}<em>you</em>{/if}
									{#if extended && s.isBot}<img class="icon-px botmark" src={PIXEL.bot} alt="bot" />{/if}
								</span>
								{#if extended && s.character}
									<small>{CHARACTER_INFO[s.character].name} {CHARACTER_INFO[s.character].title}</small>
								{/if}
							</span>
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

			{#if extended}
				<div class="extended">
					{#if mySeat}
						<button class="pick plaque" onclick={() => (picking = 'character')}>
							<Portrait id={mySeat.character} size={78} />
							<span class="pick-body">
								<span class="label">Your character</span>
								{#if myChar}
									<span class="pick-name title">{myChar.name} <small>{myChar.title}</small></span>
									<span class="trait"><b>{myChar.trait}.</b> {myChar.text}</span>
								{:else}
									<span class="pick-name title">Pick a character</span>
								{/if}
								<span class="change">Change</span>
							</span>
						</button>
					{/if}
					<button class="pick plaque" disabled={!client.isHost} onclick={() => (picking = 'map')}>
						<span class="map-well well"><MapPreview tiles={mapTiles} width={92} height={70} /></span>
						<span class="pick-body">
							<span class="label">Island</span>
							<span class="pick-name title">{mapName(settings.map)} <small>{mapTiles.length} tiles</small></span>
							<span class="trait">{mapBlurb}</span>
							{#if client.isHost}<span class="change">Change or make your own</span>{/if}
						</span>
					</button>
					<div class="goal">
						<span class="label">Points to win</span>
						{#if client.isHost}
							<div class="seg">
								{#each POINT_GOALS as g (g)}
									<button
										class="btn small"
										class:on={settings.pointsToWin === g}
										onclick={() => client.send({ t: 'setPointsToWin', points: g })}>{g}</button
									>
								{/each}
							</div>
						{:else}
							<span class="chosen">{settings.pointsToWin}</span>
						{/if}
					</div>
				</div>
			{/if}

			<div class="timer">
				<div class="timer-head">
					<span class="label">Turn timer</span>
					<span class="chosen"
						><img class="icon-px" src={PIXEL.watch} alt="" />{longTime(lobby.turnTime)}</span
					>
				</div>
				{#if client.isHost}
					<div class="seg times">
						{#each TURN_TIMES as t (t)}
							<button
								class="btn small"
								class:on={lobby.turnTime === t}
								onclick={() => client.send({ t: 'setTurnTime', seconds: t })}>{shortTime(t)}</button
							>
						{/each}
					</div>
				{/if}
				{#if lobby.turnTime}
					<p class="note">When time runs out, the turn ends on its own.</p>
				{/if}
			</div>

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

{#if picking === 'character'}
	<CharacterPicker onclose={() => (picking = null)} />
{:else if picking === 'map'}
	<MapPicker onclose={() => (picking = null)} />
{/if}

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
	.timer {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.timer-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}
	.chosen {
		display: flex;
		align-items: center;
		gap: 6px;
		font-family: var(--px);
		font-weight: 700;
		font-size: 15px;
		color: #fff2d2;
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
	}
	.chosen img {
		width: 20px;
		height: 22px;
	}
	.times {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 5px;
	}
	.note {
		margin: 0;
		color: var(--muted);
		font-size: 13px;
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
	.modes {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px;
	}
	.mode {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		padding: 6px 8px 8px;
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: pointer;
		opacity: 0.62;
		transition:
			opacity 0.15s,
			transform 0.12s;
	}
	.mode:hover:not(:disabled) {
		opacity: 0.9;
		transform: translateY(-2px);
	}
	.mode.on {
		opacity: 1;
		filter: drop-shadow(0 0 0 #ffd45a) drop-shadow(0 0 4px #ffd45a);
	}
	.mode:disabled {
		cursor: default;
	}
	.mode-name {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 17px;
		color: #fff2d2;
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
	}
	.mode-name img {
		width: 18px;
		height: 18px;
	}
	.mode-text {
		font-size: 12.5px;
		line-height: 1.25;
		color: var(--muted);
	}
	.seat.ext {
		min-height: 56px;
	}
	.face {
		position: relative;
		flex: none;
	}
	.shield.mini {
		position: absolute;
		right: -6px;
		bottom: -5px;
		--s: 1.4px;
		width: 16px;
		height: 19px;
		padding: 0;
	}
	.who {
		display: flex;
		flex-direction: column;
		line-height: 1.1;
	}
	.who small {
		font-family: var(--body);
		font-weight: 700;
		font-size: 12.5px;
		color: var(--muted);
		text-shadow: none;
	}
	.botmark {
		width: 15px;
		height: 15px;
		vertical-align: -1px;
		opacity: 0.8;
	}
	.extended {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.pick {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 8px;
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: pointer;
		transition: transform 0.12s;
	}
	.pick:hover:not(:disabled) {
		transform: translateY(-2px);
	}
	.pick:disabled {
		cursor: default;
	}
	.pick-body {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.pick-name {
		font-size: 18px;
		color: #fff2d2;
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
	}
	.pick-name small {
		font-size: 13px;
		color: var(--muted);
	}
	.trait {
		font-size: 13px;
		line-height: 1.3;
		color: #f1dfc2;
	}
	.trait b {
		color: var(--gold);
	}
	.change {
		font-family: var(--px);
		font-weight: 700;
		font-size: 12px;
		color: var(--gold);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.map-well {
		display: grid;
		place-items: center;
		padding: 2px;
		background: radial-gradient(ellipse, #2f6f98, #1d4664);
		background-clip: padding-box;
	}
	.goal {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}
	.goal .seg .btn {
		min-width: 44px;
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
