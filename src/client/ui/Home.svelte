<script lang="ts">
	import { onMount } from 'svelte';
	import { LogoView } from '../scene/logo';
	import { client } from '../state/client.svelte';
	import CodeTiles from './menu/CodeTiles.svelte';
	import Embers from './menu/Embers.svelte';
	import Modal from './menu/Modal.svelte';
	import Settings from './menu/Settings.svelte';
	import { sideLayout } from './menu/sideLayout';
	import { PIXEL } from './pixel';
	import { isMuted, setMuted, sfx } from './sound';
	import Tutorial from './tutorial/Tutorial.svelte';

	const NAMES = [
		'Aldric',
		'Brenna',
		'Corwin',
		'Dagny',
		'Elric',
		'Freya',
		'Gideon',
		'Hilde',
		'Ivo',
		'Jorunn',
		'Kestrel',
		'Leif',
		'Maren',
		'Osric',
		'Petra',
		'Rowan',
		'Sigrid',
		'Tamsin',
		'Ulric',
		'Wren'
	];

	let code = $state(new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '');
	let name = $state(client.name);
	let muted = $state(isMuted());
	let sheet = $state<'settings' | null>(null);
	let reading = $state(false);
	let canvas: HTMLCanvasElement | undefined = $state();
	let logoOk = $state(true);
	const busy = $derived(client.pendingJoin || client.status !== 'online');

	onMount(sideLayout);

	onMount(() => {
		if (!canvas) return;
		let logo: LogoView | null = null;
		try {
			logo = new LogoView(canvas);
		} catch {
			// No second WebGL context: show the title as text instead.
			logoOk = false;
		}
		const onResize = () => logo?.resize();
		window.addEventListener('resize', onResize);
		return () => {
			window.removeEventListener('resize', onResize);
			logo?.dispose();
		};
	});

	function commitName() {
		client.setName(name.trim().slice(0, 18));
	}
	function randomName() {
		const pool = NAMES.filter((n) => n !== name);
		name = pool[Math.floor(Math.random() * pool.length)];
		commitName();
	}
	function play() {
		commitName();
		client.quickPlay(3);
	}
	function create() {
		commitName();
		client.create();
	}
	function join() {
		if (code.length !== 5 || busy) return;
		commitName();
		client.join(code);
	}
	function rejoin() {
		if (!client.resumable || busy) return;
		commitName();
		client.join(client.resumable.code);
	}
	function openSheet(s: 'settings') {
		sfx.open();
		sheet = s;
	}
	function closeSheet() {
		sfx.close();
		sheet = null;
	}
	function openTutorial() {
		sfx.open();
		reading = true;
	}
	function closeTutorial() {
		sfx.close();
		reading = false;
	}
	function toggleSound() {
		muted = !muted;
		setMuted(muted);
	}
</script>

<svelte:window onkeydown={(e) => reading && e.key === 'Escape' && closeTutorial()} />

<div class="home">
	<Embers />
	{#if reading}
		<div class="book">
			<div class="board panel">
				<div class="ribbon">Tutorial</div>
				<button class="icon-btn close" onclick={closeTutorial} aria-label="Back to the menu" title="Back to the menu"
					><img src={PIXEL.close} alt="" /></button
				>
				<Tutorial />
			</div>
		</div>
	{/if}
	<!-- Hidden rather than removed while the tutorial is open, so the 3D title keeps its canvas. -->
	<div class="column" class:away={reading}>
		<header class="crest">
			<div class="logo">
				<canvas bind:this={canvas} aria-label="Reign"></canvas>
				{#if !logoOk}<h1 class="title">REIGN</h1>{/if}
			</div>
			<div class="ribbon tagline">Settle <i>·</i> Trade <i>·</i> Build</div>
		</header>

		<div class="sign panel">
			{#if client.resumable}
				{@const r = client.resumable}
				<button class="btn purple block rejoin" onclick={rejoin} disabled={busy}>
					<img src={PIXEL.door} alt="" />
					<span class="stack"
						>Rejoin game {r.code}<span class="sub"
							>{r.players.join(', ')}
							{r.players.length === 1 ? 'is' : 'are'} still playing, a bot holds your seat</span
						></span
					>
				</button>
			{/if}
			<label class="field">
				<span class="label">Your name</span>
				<div class="name-row">
					<input
						class="input"
						bind:value={name}
						maxlength="18"
						placeholder="Settler"
						onchange={commitName}
						onkeydown={(e) => e.key === 'Enter' && play()}
					/>
					<button
						class="icon-btn dice"
						onclick={randomName}
						title="Pick a random name"
						aria-label="Random name"
					>
						<img src={PIXEL.die} alt="" />
					</button>
				</div>
			</label>

			<button class="btn big block shine" onclick={play} disabled={busy}>
				<img src={PIXEL.play} alt="" />
				<span class="stack"
					>Play vs bots<span class="sub">Three rivals, start right away</span></span
				>
			</button>
			<button class="btn green block" onclick={create} disabled={busy}>
				<img src={PIXEL.house} alt="" />
				<span class="stack">Create a room<span class="sub">Invite friends with a code</span></span>
			</button>

			<div class="divider"><i></i><span>or join a friend</span><i></i></div>

			<div class="join">
				<CodeTiles bind:value={code} editable onenter={join} />
				<button class="btn wood" onclick={join} disabled={code.length !== 5 || busy}>Join</button>
			</div>
		</div>

		<nav class="extras">
			<button class="medal" onclick={openTutorial}>
				<span class="icon-btn"><img src={PIXEL.book} alt="" /></span>
				<span class="cap">Tutorial</span>
			</button>
			<button class="medal" onclick={() => openSheet('settings')}>
				<span class="icon-btn"><img src={PIXEL.gear} alt="" /></span>
				<span class="cap">Settings</span>
			</button>
			<button class="medal" onclick={toggleSound}>
				<span class="icon-btn"><img src={muted ? PIXEL.mute : PIXEL.speaker} alt="" /></span>
				<span class="cap">{muted ? 'Sound off' : 'Sound on'}</span>
			</button>
		</nav>
	</div>
</div>

{#if sheet === 'settings'}
	<Modal title="Settings" width={460} onclose={closeSheet}><Settings /></Modal>
{/if}

<style>
	.home {
		position: absolute;
		inset: 0;
		overflow-y: auto;
		overflow-x: hidden;
		pointer-events: auto;
		background:
			radial-gradient(ellipse 70% 60% at 50% 46%, transparent 35%, rgba(12, 5, 2, 0.6) 100%),
			linear-gradient(
				180deg,
				rgba(12, 5, 2, 0.45),
				transparent 30%,
				transparent 70%,
				rgba(12, 5, 2, 0.5)
			);
	}
	.column {
		position: relative;
		min-height: 100%;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 14px;
		padding: 10px 16px 44px;
	}
	.away {
		display: none;
	}
	.book {
		position: relative;
		box-sizing: border-box;
		height: 100%;
		min-height: 520px;
		display: flex;
		justify-content: center;
		padding: 46px 16px 18px;
	}
	.book .board {
		position: relative;
		width: min(1180px, 100%);
		height: 100%;
		display: flex;
		flex-direction: column;
		padding: calc(var(--s) * 9) 14px 14px;
		animation: pop-in 0.32s cubic-bezier(0.2, 1.3, 0.4, 1);
	}
	.book .ribbon {
		position: absolute;
		top: 0;
		left: 50%;
		transform: translate(-50%, -62%);
		z-index: 2;
		font-size: 24px;
		padding-left: calc(var(--s) * 6);
		padding-right: calc(var(--s) * 6);
	}
	.book .close {
		position: absolute;
		top: calc(var(--s) * -4);
		right: calc(var(--s) * -4);
		z-index: 3;
		width: calc(var(--s) * 13);
		height: calc(var(--s) * 13);
		border-image-source: var(--art-btn-red);
	}
	.book .close img {
		width: calc(var(--s) * 6);
		height: calc(var(--s) * 6);
	}
	.book .close:active {
		border-image-source: var(--art-btn-red-down);
	}
	.crest {
		display: flex;
		flex-direction: column;
		align-items: center;
		animation: drop-in 0.8s cubic-bezier(0.2, 1.2, 0.4, 1) both;
	}
	.logo {
		width: min(700px, 94vw);
		aspect-ratio: 700 / 230;
		margin-bottom: -18px;
		pointer-events: none;
	}
	.logo {
		position: relative;
	}
	.logo canvas {
		width: 100%;
		height: 100%;
		display: block;
	}
	.logo h1 {
		position: absolute;
		inset: 0;
		margin: 0;
		display: grid;
		place-items: center;
		font-size: clamp(64px, 13vw, 132px);
		color: #ffd86b;
		letter-spacing: 0.08em;
		text-shadow:
			0 4px 0 #c9781a,
			0 8px 0 #8a4410,
			0 12px 0 #4a2008,
			0 18px 24px rgba(0, 0, 0, 0.6);
	}
	.tagline {
		--rib: var(--art-ribbon-crimson);
		font-size: 18px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		padding-left: calc(var(--s) * 6);
		padding-right: calc(var(--s) * 6);
	}
	.tagline i {
		font-style: normal;
		color: var(--gold);
	}
	.sign {
		width: min(400px, 100%);
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 10px 12px 14px;
		animation: pop-in 0.5s cubic-bezier(0.2, 1.3, 0.4, 1) 0.15s both;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.name-row {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.name-row .input {
		flex: 1;
		min-width: 0;
	}
	.dice {
		width: calc(var(--s) * 14);
		height: calc(var(--s) * 14);
		flex: none;
	}
	.dice:active img {
		transform: rotate(90deg);
	}
	.sign .btn.block {
		justify-content: flex-start;
		gap: 12px;
		padding-left: calc(var(--s) * 4);
	}
	.rejoin .sub {
		white-space: normal;
	}
	.sign .btn img {
		height: calc(var(--s) * 9);
	}
	.join {
		display: flex;
		gap: 10px;
		align-items: center;
		justify-content: space-between;
	}
	.join .btn {
		flex: 1;
		min-height: calc(var(--s) * 13);
	}
	.extras {
		display: flex;
		gap: 22px;
		animation: fade-in 0.6s ease-out 0.4s both;
	}
	.medal {
		all: unset;
		pointer-events: auto;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		cursor: pointer;
	}
	.medal:hover .icon-btn {
		filter: brightness(1.15);
		transform: translateY(-1px);
	}
	.medal:active .icon-btn {
		border-image-source: var(--art-btn-wood-down);
		transform: translateY(var(--s));
	}
	.medal:focus-visible .icon-btn {
		filter: drop-shadow(0 0 5px rgba(255, 210, 90, 0.9));
	}
	.cap {
		font-family: var(--px);
		font-weight: 700;
		font-size: 14px;
		color: #fff2d2;
		text-shadow: var(--outline-dark);
	}
	@media (min-width: 1100px) and (min-aspect-ratio: 4/3) {
		.column {
			align-items: flex-start;
			width: 600px;
			margin-left: max(24px, 4vw);
		}
		.crest,
		.sign,
		.extras {
			align-self: center;
		}
		.logo {
			width: 580px;
		}
		.sign {
			width: 420px;
		}
	}
	@media (max-height: 760px) and (min-width: 701px) {
		.logo {
			width: min(560px, 80vw);
		}
	}
	@media (max-width: 700px) {
		.book {
			padding: 36px 6px 8px;
			min-height: 0;
		}
		.book .board {
			padding: calc(var(--s) * 9) 6px 8px;
		}
		.column {
			justify-content: flex-start;
			padding-top: 18px;
			gap: 12px;
		}
		.tagline {
			font-size: 14px;
		}
		.extras {
			gap: 16px;
		}
	}
</style>
