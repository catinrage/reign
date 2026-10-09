<script lang="ts">
	import { MAP_PRESETS, mapName, presetById } from '../../shared/board/maps';
	import { CHARACTERS, STEWARD_EXTRA } from '../../shared/rules/characters';
	import { DISCARD_THRESHOLD, PLAYER_COLORS, VICTORY_POINTS_TO_WIN } from '../../shared/rules/config';
	import { RANDOM_SHAPE_INFO } from '../../shared/board/random';
	import {
		GAME_MODES,
		HAND_LIMIT_MAX,
		HAND_LIMIT_MIN,
		MODE_INFO,
		POINT_GOALS,
		POINTS_MIN,
		characterPool,
		maxPointsFor,
		suggestedPoints
	} from '../../shared/rules/modes';
	import { CLASSIC_PLAYERS, MIN_PLAYERS, TURN_TIMES } from '../../shared/protocol';
	import { account } from '../state/account.svelte';
	import { client } from '../state/client.svelte';
	import Avatar from './account/Avatar.svelte';
	import Friends from './account/Friends.svelte';
	import { ACCOUNT_ICONS } from './account/icons';
	import BuildingRules from './extended/BuildingRules.svelte';
	import EventRules from './extended/EventRules.svelte';
	import CharacterPicker from './extended/CharacterPicker.svelte';
	import MapPicker from './extended/MapPicker.svelte';
	import MapPreview from './extended/MapPreview.svelte';
	import { generateIsland } from './extended/randomIsland';
	import Portrait from './extended/Portrait.svelte';
	import CodeTiles from './menu/CodeTiles.svelte';
	import Embers from './menu/Embers.svelte';
	import Modal from './menu/Modal.svelte';
	import { sideLayout } from './menu/sideLayout';
	import { PIXEL } from './pixel';
	import { sceneRef } from './sceneRef';

	const lobby = $derived(client.lobby!);
	const mySeat = $derived(lobby.seats.find((s) => s.id === client.seat));
	const open = $derived(Math.max(0, lobby.maxPlayers - lobby.seats.length));
	// The host can only start once every other settler has said they are ready.
	const notReady = $derived(lobby.seats.filter((s) => !s.ready));
	const enough = $derived(lobby.seats.length >= MIN_PLAYERS);
	// Seven or eight at the table: slimmer seat rows so the lobby still fits on one screen.
	const many = $derived(lobby.seats.length + open > 6);
	let copied = $state(false);
	let inviting = $state(false);
	const settings = $derived(lobby.settings);
	const extended = $derived(settings.mode === 'extended');
	const pool = $derived(characterPool({ ...settings, characters: true }));
	const mapTiles = $derived(
		'preset' in settings.map ? (presetById(settings.map.preset)?.tiles ?? []) : settings.map.custom.tiles
	);
	const random = $derived('custom' in settings.map ? settings.map.custom.random : undefined);
	const mapBlurb = $derived(
		'preset' in settings.map
			? (presetById(settings.map.preset)?.blurb ?? '')
			: random
				? `A random island: ${RANDOM_SHAPE_INFO[random.shape].text.toLowerCase().replace(/\.$/, '')}${random.lakes ? ', with lakes' : ''}.`
				: 'A map made in the map maker.'
	);
	// Island size, players and points go together: a small island with a big table can't
	// reach a big goal, so the server caps it and the picks above the cap are greyed out.
	const pointsCap = $derived(maxPointsFor(mapTiles.length, lobby.seats.length));
	const pointsTip = $derived(
		`${mapTiles.length} tiles and ${lobby.seats.length} players: about ${suggestedPoints(mapTiles.length, lobby.seats.length)} plays well, ${pointsCap} at most`
	);
	let picking = $state<'character' | 'map' | null>(null);
	const CLASSIC_TILES = MAP_PRESETS[0].tiles;
	// The table shows the island that will be played.
	$effect(() => sceneRef.current?.showMenuMap(extended ? mapTiles : null));

	// The lobby spreads over two columns, so the table slides over to the middle of the space
	// left beside it.
	$effect(() => sideLayout(wideShift));

	function wideShift() {
		const w = window.innerWidth;
		const right = Math.max(24, w * 0.04) + 880;
		return Math.min(0.36, right / (2 * w));
	}
	/** Any whole number of points in range; anything else snaps back to the current goal. */
	function otherGoal(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const n = Math.round(Number(input.value));
		if (input.value.trim() && Number.isFinite(n)) {
			const points = Math.max(POINTS_MIN, Math.min(pointsCap, n));
			client.send({ t: 'setPointsToWin', points });
			if (points !== n) input.value = String(points);
		} else {
			input.value = POINT_GOALS.includes(settings.pointsToWin) ? '' : String(settings.pointsToWin);
		}
	}
	function names(seats: { name: string }[]) {
		const n = seats.map((s) => s.name);
		return n.length < 2 ? n.join('') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
	}
	function shortTime(t: number) {
		return !t ? 'Unlimited' : t < 120 ? `${t} sec` : `${t / 60} min`;
	}
	/** The same, for the one-row picker of the wide lobby. */
	function tinyTime(t: number) {
		return !t ? 'Off' : t < 120 ? `${t}s` : `${t / 60}m`;
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
	<div class="column wide">
		<div class="card panel wide">
			<div class="ribbon head">Gather your table</div>

			<div class="cols">
				<div class="col">
					<div class="invite">
						<span class="label">Room code</span>
						<CodeTiles value={lobby.code} size="big" />
						<button class="btn small wood" onclick={copy}>
							<img class="icon-px" src={copied ? PIXEL.check : PIXEL.letter} alt="" />{copied
								? 'Link copied!'
								: 'Copy invite link'}
						</button>
						<button class="btn small" onclick={() => (inviting = true)}>
							<img class="icon-px" src={ACCOUNT_ICONS.friends} alt="" />Invite friends{#if account.onlineFriends.length}
								<span class="online">{account.onlineFriends.length} online</span>{/if}
						</button>
					</div>


					<div class="divider">
						<i></i><span>Settlers {lobby.seats.length}/{lobby.maxPlayers}</span><i></i>
					</div>

					<div class="seats" class:many>
						{#each lobby.seats as s (s.id)}
							<div class="seat plaque" class:me={s.id === client.seat} class:ext={extended}>
								{#if s.avatar}
									<span class="face">
										<Avatar id={s.avatar} size={40} />
										<span class="shield mini" style="--shield: var(--art-shield-{s.color})"></span>
									</span>
								{:else}
									<span class="shield" style="--shield: var(--art-shield-{s.color})">
										{#if s.isBot}<img class="icon-px" src={PIXEL.bot} alt="bot" />{:else}{s.name.slice(0, 1).toUpperCase()}{/if}
									</span>
								{/if}
								<span class="name title">
									<span class="who">
										<span>
											{s.name}
											{#if s.id === client.seat}<em>you</em>{/if}
										</span>
									</span>
								</span>
								{#if s.isHost}<img class="icon-px tag" src={PIXEL.crown} alt="host" title="Host" />{/if}
								{#if !s.connected}<span class="away">away</span>{/if}
								{#if !s.isHost && !s.isBot && s.connected}
									{#if s.ready}
										<span class="ready on" title="Ready"><img class="icon-px" src={PIXEL.check} alt="" />Ready</span>
									{:else}
										<span class="ready" title="Not ready yet">Not ready</span>
									{/if}
								{/if}
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

					<div class="end">
						<div class="foot">
							<button class="btn wood" onclick={() => client.leave()}
								><img class="icon-px" src={PIXEL.door} alt="" />Leave</button
							>
							{#if client.isHost}
								<button
									class="btn big shine start"
									disabled={!enough || notReady.length > 0}
									onclick={() => client.send({ t: 'start' })}
								>
									<img src={PIXEL.play} alt="" />Start game
								</button>
							{:else if mySeat}
								<button
									class="btn big ready-btn"
									class:shine={!mySeat.ready}
									class:green={mySeat.ready}
									aria-pressed={mySeat.ready}
									onclick={() => client.send({ t: 'setReady', ready: !mySeat.ready })}
								>
									<img src={mySeat.ready ? PIXEL.check : PIXEL.hourglass} alt="" />{mySeat.ready
										? 'Ready!'
										: 'I am ready'}
								</button>
							{/if}
						</div>
						{#if client.isHost && !enough}
							<p class="hint">Send the link to friends, or add a bot to start.</p>
						{:else if client.isHost && notReady.length}
							<p class="hint">Waiting for {names(notReady)} to be ready.</p>
						{:else if !client.isHost && mySeat?.ready}
							<p class="hint">Waiting for the host to start. Tap again if you are not ready.</p>
						{:else if !client.isHost}
							<p class="hint">The host can start once everyone is ready.</p>
						{/if}
					</div>
				</div>
				<div class="col">
					<div class="modes" role="radiogroup" aria-label="Game mode">
						{#each GAME_MODES as m (m)}
							<button
								class="mode plaque"
								class:on={settings.mode === m}
								role="radio"
								aria-checked={settings.mode === m}
								disabled={!client.isHost || (m === 'classic' && lobby.seats.length > CLASSIC_PLAYERS)}
								title={m === 'classic' && lobby.seats.length > CLASSIC_PLAYERS ? 'Classic seats 4 players' : MODE_INFO[m].text}
								onclick={() => client.send({ t: 'setMode', mode: m })}
							>
								<span class="mode-name title">
									{#if m === 'extended'}<img class="icon-px" src={PIXEL.crown} alt="" />{/if}{MODE_INFO[m].name}
								</span>
								<span class="mode-text">{MODE_INFO[m].text}</span>
							</button>
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
							<button class="pick plaque" onclick={() => (picking = 'character')}>
								<span class="map-well well cast" class:off={!settings.characters}>
									{#each CHARACTERS as c (c)}
										<span class:out={!pool.includes(c)}><Portrait id={c} size={16} framed={false} tip={false} /></span>
									{/each}
								</span>
								<span class="pick-body">
									<span class="label">Characters</span>
									<span class="pick-name title"
										>{settings.characters ? 'Drafted' : 'Off'}
										{#if settings.characters}<small>{pool.length} of {CHARACTERS.length}</small>{/if}</span
									>
									<span class="trait"
										>{settings.characters
											? 'Everyone picks one at the start. The first settler picks last.'
											: 'No characters: everyone plays by the plain rules.'}</span
									>
									<span class="change">{client.isHost ? 'Change' : 'See them all'}</span>
								</span>
							</button>
							<div class="island">
								<button class="pick plaque" disabled={!client.isHost} onclick={() => (picking = 'map')}>
									<span class="map-well well"><MapPreview tiles={mapTiles} width={92} height={70} /></span>
									<span class="pick-body">
										<span class="label">Island</span>
										<span class="pick-name title">{mapName(settings.map)} <small>{mapTiles.length} tiles</small></span>
										<span class="trait">{mapBlurb}</span>
										{#if client.isHost}<span class="change">{random ? 'Change' : 'Change, generate or make your own'}</span>{/if}
									</span>
								</button>
								{#if client.isHost && random}
									<button
										class="btn small green reroll"
										title="Grow another island with the same size and shape"
										onclick={() => generateIsland(random)}>Reroll</button
									>
								{/if}
							</div>
							<div class="goal">
								<span class="goal-head">
									<span class="label">Points to win</span>
									<span class="cap" title={pointsTip}>At most {pointsCap} here</span>
								</span>
								{#if client.isHost}
									<div class="seg">
										{#each POINT_GOALS as g (g)}
											<button
												class="btn small"
												class:on={settings.pointsToWin === g}
												disabled={g > pointsCap}
												title={g > pointsCap ? `Too many for this island: ${pointsTip}.` : undefined}
												onclick={() => client.send({ t: 'setPointsToWin', points: g })}>{g}</button
											>
										{/each}
										<input
											class="input other"
											class:on={!POINT_GOALS.includes(settings.pointsToWin)}
											type="number"
											inputmode="numeric"
											min={POINTS_MIN}
											max={pointsCap}
											placeholder="Other"
											aria-label="Other points to win, {POINTS_MIN} to {pointsCap}"
											title="Any number from {POINTS_MIN} to {pointsCap}. {pointsTip}."
											value={POINT_GOALS.includes(settings.pointsToWin) ? '' : settings.pointsToWin}
											onchange={otherGoal}
											onkeydown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
										/>
									</div>
								{:else}
									<span class="chosen">{settings.pointsToWin}</span>
								{/if}
							</div>
							<div class="goal">
								<span class="goal-head">
									<span class="label">Hand limit on a 7</span>
									<span class="cap"
										>{settings.characters && pool.includes('steward')
											? `Aldous the Steward: ${settings.handLimit + STEWARD_EXTRA}`
											: 'More cards than this: discard half'}</span
									>
								</span>
								{#if client.isHost}
									<div class="seg stepper">
										<button
											class="btn small"
											aria-label="Lower the hand limit"
											disabled={settings.handLimit <= HAND_LIMIT_MIN}
											onclick={() => client.send({ t: 'setHandLimit', cards: settings.handLimit - 1 })}>−</button
										>
										<span class="chosen" title="Players holding more than this many cards discard half when a 7 is rolled"
											>{settings.handLimit} cards</span
										>
										<button
											class="btn small"
											aria-label="Raise the hand limit"
											disabled={settings.handLimit >= HAND_LIMIT_MAX}
											onclick={() => client.send({ t: 'setHandLimit', cards: settings.handLimit + 1 })}>+</button
										>
									</div>
								{:else}
									<span class="chosen">{settings.handLimit} cards</span>
								{/if}
							</div>
							<div class="duo">
								<BuildingRules />
								<EventRules />
							</div>
						</div>
					{:else}
						<!-- Classic always plays the standard island: the same card as Reign Extended's, fixed. -->
						<div class="pick plaque fixed">
							<span class="map-well well"><MapPreview tiles={CLASSIC_TILES} width={92} height={70} /></span>
							<span class="pick-body">
								<span class="label">Island</span>
								<span class="pick-name title">Classic Isle <small>{CLASSIC_TILES.length} tiles</small></span>
								<span class="trait"
									>Terrains, numbers and harbors dealt fresh each game. First to {VICTORY_POINTS_TO_WIN} points wins,
									and a 7 makes anyone holding more than {DISCARD_THRESHOLD} cards discard half.</span
								>
							</span>
						</div>
					{/if}

					<div class="timer">
						<div class="timer-head">
							<span class="label">Turn timer</span>
							<span class="chosen" title={lobby.turnTime ? 'When time runs out, the turn ends on its own.' : undefined}
								><img class="icon-px" src={PIXEL.watch} alt="" />{longTime(lobby.turnTime)}</span
							>
						</div>
						{#if client.isHost}
							<div class="seg times">
								{#each TURN_TIMES as t (t)}
									<button
										class="btn small"
										class:on={lobby.turnTime === t}
										onclick={() => client.send({ t: 'setTurnTime', seconds: t })}
										><span class="long">{shortTime(t)}</span><span class="short">{tinyTime(t)}</span></button
									>
								{/each}
							</div>
						{/if}
						{#if lobby.turnTime}
							<p class="note">When time runs out, the turn ends on its own.</p>
						{/if}
					</div>

				</div>
			</div>

		</div>
	</div>
</div>

{#if picking === 'character'}
	<CharacterPicker onclose={() => (picking = null)} />
{:else if picking === 'map'}
	<MapPicker onclose={() => (picking = null)} />
{/if}

{#if inviting}
	<Modal title="Invite friends" width={500} onclose={() => (inviting = false)}><Friends inviting /></Modal>
{/if}

<style>
	/* Buildings and Events share a row: two narrower plaques, each with its picture beside the
	   label and name and the rest underneath, so the pair fits half the lobby's width. Their
	   "Choose ..." line moves into the tooltip, to keep the lobby within a 768-pixel screen. */
	.duo {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 8px;
	}
	.duo :global(.pick) {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		column-gap: 8px;
		row-gap: 2px;
		padding: 4px 6px;
		min-width: 0;
	}
	.duo :global(.pick .pick-body) {
		display: contents;
	}
	.duo :global(.pick .face) {
		grid-row: 1 / 3;
		width: 48px;
		height: 46px;
	}
	.duo :global(.pick .face img) {
		max-width: 30px;
		max-height: 30px;
	}
	.duo :global(.pick .pick-name) {
		font-size: 15px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.duo :global(.pick .trait) {
		grid-column: 1 / -1;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.duo :global(.pick .change) {
		display: none;
	}
	@media (max-width: 520px) {
		.duo {
			grid-template-columns: 1fr;
		}
		/* Phones: the points buttons drop under their label rather than past the frame. */
		.goal {
			flex-wrap: wrap;
		}
	}
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
		/* A shadow, not the panel's drop-shadow filter: a filter would trap the lobby's dialogs
		   inside the card instead of the whole screen. */
		filter: none;
		box-shadow: 0 12px 14px rgba(0, 0, 0, 0.5);
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
	.invite .online {
		font-size: 12px;
		color: #1f6a14;
		text-shadow: none;
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
	.ready {
		display: flex;
		align-items: center;
		gap: 4px;
		flex: none;
		font-family: var(--px);
		font-weight: 700;
		font-size: 13px;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.ready.on {
		color: #9be36a;
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
	}
	.ready img {
		width: 16px;
		height: 16px;
	}
	.ready-btn img {
		height: calc(var(--s) * 8) !important;
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
	.times .short {
		display: none;
	}
	.pick.fixed {
		cursor: default;
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
	.many .seat.ext {
		min-height: 38px;
		padding-top: 0;
		padding-bottom: 0;
	}
	.many {
		gap: 4px;
	}
	.many .name {
		font-size: 16px;
	}
	/* Same button, drawn at a smaller pixel size. */
	.many .kick {
		--s: 2.2px;
	}
	/* A signed-in player's avatar, with their banner pinned to its corner. */
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
	.cast {
		display: grid;
		grid-template-columns: repeat(4, 16px);
		gap: 1px;
		place-content: center;
	}
	.cast.off,
	.cast .out {
		filter: grayscale(0.9) brightness(0.5);
	}
	.island {
		position: relative;
		display: flex;
		flex-direction: column;
	}
	.reroll {
		position: absolute;
		right: 8px;
		bottom: 8px;
	}
	.goal-head {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.cap {
		font-size: 12px;
		color: var(--muted);
		white-space: nowrap;
	}
	.stepper .chosen {
		min-width: 84px;
		justify-content: center;
	}
	.goal .seg .btn {
		min-width: 44px;
	}
	.goal .seg {
		display: flex;
		gap: 4px;
		align-items: center;
	}
	.other {
		width: 66px;
		height: calc(var(--s) * 11);
		padding: 0 2px;
		box-sizing: border-box;
		text-align: center;
		font-family: var(--px);
		font-weight: 700;
		font-size: 14px;
		-moz-appearance: textfield;
		appearance: textfield;
	}
	.other::-webkit-inner-spin-button,
	.other::-webkit-outer-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}
	.other::placeholder {
		font-size: 12px;
	}
	.other.on {
		outline: 3px solid #ffd45a;
		outline-offset: 0;
	}
	.cols {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	/* One column reads top to bottom: invite, mode, seats, then your picks. */
	.col {
		display: contents;
	}
	.invite {
		order: -2;
	}
	.modes {
		order: -1;
	}
	.end {
		order: 1;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	/* On wider screens the lobby spreads sideways instead of growing tall: invite, seats and Start
	   on the left, the game's settings on the right, in both modes. */
	@media (min-width: 820px) {
		.card.wide {
			width: min(860px, 100%);
		}
		.wide .cols {
			display: grid;
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			gap: 18px;
		}
		/* Leave and Start sit at the foot of the seats, level with the end of the settings. */
		.wide .end {
			margin-top: auto;
		}
		.wide .col {
			display: flex;
			flex-direction: column;
			gap: 9px;
		}
		.card.wide {
			gap: 9px;
			padding-bottom: 8px;
		}
		.wide .invite {
			flex-direction: row;
			flex-wrap: wrap;
			justify-content: space-between;
			row-gap: 6px;
		}
		.wide .invite :global(.tiles) {
			--t: calc(var(--s) * 12);
		}
		.wide .invite .label {
			flex-basis: 100%;
		}
		/* Settings rows kept short so the right column fits a 768-pixel-tall screen. */
		.wide .times {
			grid-template-columns: repeat(6, 1fr);
			gap: 4px;
		}
		.wide .times .long {
			display: none;
		}
		.wide .times .short {
			display: inline;
		}
		.wide .timer .note {
			display: none;
		}
		/* The two modes as one row of tabs; each says what it is in its tooltip. */
		.wide .mode {
			align-items: center;
			padding: 7px 8px 8px;
		}
		.wide .mode-name {
			font-size: 15px;
			white-space: nowrap;
		}
		.wide .mode-text {
			display: none;
		}
		/* The banner label and all eight banners on one line. */
		.wide .colors {
			flex-wrap: nowrap;
		}
		.wide .banners {
			gap: 3px;
		}
		.wide .banner {
			width: 28px;
			height: 32px;
		}
	}
	@media (min-width: 1100px) and (min-aspect-ratio: 4/3) {
		.column {
			justify-content: flex-start;
			width: 600px;
			margin-left: max(24px, 4vw);
		}
		.column.wide {
			padding-top: 26px;
			padding-bottom: 8px;
			width: 900px;
			max-width: calc(100% - 2 * max(24px, 4vw));
		}
		.card {
			margin: 0 auto;
		}
	}
</style>
