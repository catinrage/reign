<script lang="ts" module>
	type Tab = 'interface' | 'sound' | 'graphics' | 'game';
	/** The tab last looked at, so the panel opens where the player left it this visit. */
	let tab = $state<Tab>('interface');
</script>

<script lang="ts">
	import { PIXEL } from '../pixel';
	import { CHANNELS, FPS_CAPS, SIZE_MAX, SIZE_MIN, settings } from '../settings.svelte';
	import { isMuted, setMuted } from '../sound';
	import { msg, t } from '../../i18n/index.svelte';
	import LanguagePicker from '../../i18n/LanguagePicker.svelte';
	import { OFFLINE } from '../../offline/flag';
	import { OFFER_WAITS } from '../../../shared/protocol';
	import { client } from '../../state/client.svelte';

	const TABS: { id: Tab; label: string; icon: string }[] = [
		{ id: 'interface', label: msg('Interface'), icon: PIXEL.window },
		{ id: 'sound', label: msg('Sound'), icon: PIXEL.volume },
		{ id: 'graphics', label: msg('Graphics'), icon: PIXEL.eye },
		{ id: 'game', label: msg('Game'), icon: PIXEL.die }
	];


	let muted = $state(isMuted());
	function toggleMute(m: boolean) {
		muted = m;
		setMuted(m);
	}

	/**
	 * The menu size shown while its slider is dragged. The menus (this one too) only change size
	 * once it is let go, or the slider would slide away under the pointer.
	 */
	let menuDrag = $state<number | null>(null);
	const sizes = $derived([
		{
			label: msg('Game HUD'),
			value: settings.hudSize,
			set: (v: number) => settings.setHudSize(v)
		},
		{
			label: msg('Menus'),
			value: menuDrag ?? settings.menuSize,
			drag: (v: number) => (menuDrag = v),
			set: (v: number) => {
				menuDrag = null;
				settings.setMenuSize(v);
			}
		}
	]);
	const fill = (v: number) => ((v - SIZE_MIN) / (SIZE_MAX - SIZE_MIN)) * 100;
	const standard = $derived(settings.hudSize === 1 && settings.menuSize === 1);
	function resetSizes() {
		settings.setHudSize(1);
		settings.setMenuSize(1);
	}
</script>

<div class="settings">
	<div class="tabs" role="tablist">
		{#each TABS as tb (tb.id)}
			<button
				class="tab"
				class:on={tab === tb.id}
				role="tab"
				aria-selected={tab === tb.id}
				aria-controls="settings-{tb.id}"
				onclick={() => (tab = tb.id)}
				><img class="icon-px" src={tb.id === 'sound' && muted ? PIXEL.volumeOff : tb.icon} alt="" />{t(
					tb.label
				)}</button
			>
		{/each}
	</div>

	<!-- Every tab sits in the same cell, so the panel keeps the tallest one's height and doesn't
	     jump when switching. -->
	<div class="pages">
		<div
			class="page"
			class:shown={tab === 'interface'}
			role="tabpanel"
			id="settings-interface"
			aria-hidden={tab !== 'interface'}
		>
			<section>
				<div class="divider"><i></i><span>{t('Language')}</span><i></i></div>
				<LanguagePicker />
			</section>

			<section>
				<div class="divider"><i></i><span>{t('Interface size')}</span><i></i></div>
				{#each sizes as s (s.label)}
					<label class="row">
						<span class="name">{t(s.label)}</span>
						<input
							class="slider"
							type="range"
							min={SIZE_MIN}
							max={SIZE_MAX}
							step="0.05"
							value={s.value}
							style="--fill:{fill(s.value)}%"
							oninput={(e) => (s.drag ?? s.set)(Number(e.currentTarget.value))}
							onchange={(e) => s.set(Number(e.currentTarget.value))}
						/>
						<span class="val wide">{Math.round(s.value * 100)}%</span>
					</label>
				{/each}
				<div class="row reset">
					<p class="hint">
						{t('Bigger or smaller panels, cards and buttons. Menus change size when you let go.')}
					</p>
					<button class="btn small" disabled={standard} onclick={resetSizes}>{t('Default')}</button>
				</div>
			</section>

			<section>
				<div class="divider"><i></i><span>{t('Display')}</span><i></i></div>
				<div class="row">
					<span class="name">{t('Show FPS and ping')}</span>
					<div class="seg">
						<button
							class="btn small"
							class:on={!settings.showStats}
							onclick={() => settings.setShowStats(false)}>{t('Off')}</button
						>
						<button
							class="btn small"
							class:on={settings.showStats}
							onclick={() => settings.setShowStats(true)}>{t('On')}</button
						>
					</div>
				</div>
				<p class="hint">
					{OFFLINE
						? t('A small readout in the corner with how many frames a second your device draws.')
						: t(
								'A small readout in the corner with how many frames a second your device draws and how long a message takes to reach the server and back (ping).'
							)}
				</p>
				<div class="row">
					<span class="name">{t('Reduce motion')}</span>
					<div class="seg">
						<button
							class="btn small"
							class:on={!settings.reduceMotion}
							onclick={() => settings.setReduceMotion(false)}>{t('Off')}</button
						>
						<button
							class="btn small"
							class:on={settings.reduceMotion}
							onclick={() => settings.setReduceMotion(true)}>{t('On')}</button
						>
					</div>
				</div>
			</section>
		</div>
		<div
			class="page"
			class:shown={tab === 'sound'}
			role="tabpanel"
			id="settings-sound"
			aria-hidden={tab !== 'sound'}
		>
			<section>
				<div class="row">
					<span class="name"
						><img class="icon-px" src={muted ? PIXEL.volumeOff : PIXEL.volume} alt="" />{t(
							'Sound'
						)}</span
					>
					<div class="seg">
						<button class="btn small" class:on={!muted} onclick={() => toggleMute(false)}
							>{t('On')}</button
						>
						<button class="btn small" class:on={muted} onclick={() => toggleMute(true)}
							>{t('Off')}</button
						>
					</div>
				</div>
				{#each CHANNELS as c (c.id)}
					{@const v = settings.volumes[c.id]}
					<label class="row" class:off={muted}>
						<span class="name">{t(c.label)}</span>
						<input
							class="slider"
							type="range"
							min="0"
							max="1"
							step="0.05"
							value={v}
							style="--fill:{v * 100}%"
							oninput={(e) => settings.setVolume(c.id, Number(e.currentTarget.value))}
						/>
						<span class="val">{Math.round(v * 100)}</span>
					</label>
				{/each}
			</section>
		</div>
		<div
			class="page"
			class:shown={tab === 'graphics'}
			role="tabpanel"
			id="settings-graphics"
			aria-hidden={tab !== 'graphics'}
		>
			<section>
				<div class="row">
					<span class="name"><img class="icon-px" src={PIXEL.moon} alt="" />{t('Night mode')}</span>
					<div class="seg">
						<button
							class="btn small"
							class:on={!settings.night}
							onclick={() => settings.setNight(false)}>{t('Off')}</button
						>
						<button
							class="btn small"
							class:on={settings.night}
							onclick={() => settings.setNight(true)}>{t('On')}</button
						>
					</div>
				</div>
				<p class="hint">
					{t(
						"Puts the room's lights out for a cozy evening by the fire, with the houses lit from within. Only you see it, and it changes nothing in the game."
					)}
				</p>
				<div class="row">
					<span class="name">{t('Quality')}</span>
					<div class="seg wrap">
						<button
							class="btn small"
							class:on={settings.quality === 'high'}
							onclick={() => settings.setQuality('high')}>{t('High')}</button
						>
						<button
							class="btn small"
							class:on={settings.quality === 'medium'}
							onclick={() => settings.setQuality('medium')}>{t('Medium')}</button
						>
						<button
							class="btn small"
							class:on={settings.quality === 'low'}
							onclick={() => settings.setQuality('low')}>{t('Low')}</button
						>
					</div>
				</div>
				<p class="hint">
					{t(
						'Medium is lighter on your device. Low is for old devices: it turns off shadows, blur and glow, and draws fewer pixels on big screens. The game reloads to apply it.'
					)}
				</p>
				<div class="row">
					<span class="name">{t('Board detail')}</span>
					<div class="seg wrap">
						<button
							class="btn small"
							class:on={settings.detail === 1}
							onclick={() => settings.setDetail(1)}>{t('Standard')}</button
						>
						<button
							class="btn small"
							class:on={settings.detail === 2}
							onclick={() => settings.setDetail(2)}>{t('Fine')}</button
						>
					</div>
				</div>
				<p class="hint">
					{t(
						"Fine builds every game's board from voxels half the size, for more detail. Standard is lighter on old devices. Switching takes a moment to rebuild."
					)}
				</p>
				<div class="row">
					<span class="name">{t('Frame rate cap')}</span>
					<div class="seg wrap">
						{#each FPS_CAPS as cap (cap)}
							<button class="btn small" class:on={settings.fpsCap === cap} onclick={() => settings.setFpsCap(cap)}
								>{cap ? t('{n} fps', { n: cap }) : t('No cap')}</button
							>
						{/each}
					</div>
				</div>
				<p class="hint">{t('Draw at most this many frames a second, to spare a laptop battery or a hot phone. No cap draws as many as the screen shows.')}</p>
			</section>
		</div>
		<div
			class="page"
			class:shown={tab === 'game'}
			role="tabpanel"
			id="settings-game"
			aria-hidden={tab !== 'game'}
		>
			<section>
				<div class="divider"><i></i><span>{t('Trade offers')}</span><i></i></div>
				<div class="row">
					<span class="name">{t("Hide offers I can't accept")}</span>
					<div class="seg">
						<button
							class="btn small"
							class:on={!settings.hideOffers}
							onclick={() => client.setHideOffers(false)}>{t('Off')}</button
						>
						<button
							class="btn small"
							class:on={settings.hideOffers}
							onclick={() => client.setHideOffers(true)}>{t('On')}</button
						>
					</div>
				</div>
				<p class="hint">
					{t("An offer you haven't the cards for is declined for you, and doesn't pop up.")}
				</p>
				<div class="row stack">
					<span class="name">{t('Bots wait for me')}</span>
					<div class="seg wrap">
						{#each OFFER_WAITS as secs (secs)}
							<button
								class="btn small"
								class:on={settings.offerWait === secs}
								onclick={() => client.setOfferWait(secs)}
								>{secs ? t('{seconds}s', { seconds: secs }) : t('Until I answer')}</button
							>
						{/each}
					</div>
				</div>
				<p class="hint">
					{t(
						'How long a bot keeps its trade offer open for your answer. It closes sooner once everyone has answered.'
					)}
				</p>
			</section>
		</div>
	</div>
</div>

<style>
	.settings {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 4px 2px;
	}
	/* Folder tabs along the top, one quarter each, the open one joined to the line under them. */
	/* They stay at the top while a big menu size or a phone scrolls the settings under them. */
	.tabs {
		position: sticky;
		top: -4px;
		z-index: 1;
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 6px;
		padding: 4px 4px 0;
		margin-top: -4px;
		background: var(--pat-planks) 0 0 / calc(var(--s) * 48) calc(var(--s) * 12) repeat #4a2a16;
		border-bottom: 3px solid color-mix(in srgb, var(--gold) 55%, #2a1404);
		box-shadow: 0 6px 6px -4px rgba(0, 0, 0, 0.45);
	}
	.tab {
		all: unset;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		min-width: 0;
		padding: 8px 6px 6px;
		margin-bottom: -3px;
		font-family: var(--px);
		font-weight: 700;
		font-size: 16px;
		color: #e9d2b0;
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
		background: rgba(0, 0, 0, 0.28);
		box-shadow: inset 0 0 0 2px rgba(0, 0, 0, 0.4);
		border-bottom: 3px solid transparent;
		white-space: nowrap;
	}
	.tab img {
		width: 22px;
		height: 22px;
		flex: none;
		opacity: 0.75;
	}
	.tab.on {
		color: #fff2d2;
		background: color-mix(in srgb, var(--gold) 28%, #5a3420);
		box-shadow:
			inset 2px 2px 0 var(--gold),
			inset -2px 0 0 var(--gold);
		border-bottom-color: color-mix(in srgb, var(--gold) 28%, #5a3420);
	}
	.tab.on img {
		opacity: 1;
	}
	.tab:hover:not(.on) {
		filter: brightness(1.2);
	}
	.tab:focus-visible {
		outline: 2px solid var(--gold);
		outline-offset: 2px;
	}
	.pages {
		display: grid;
	}
	.page {
		grid-area: 1 / 1;
		display: flex;
		flex-direction: column;
		gap: 18px;
		visibility: hidden;
	}
	.page.shown {
		visibility: visible;
		animation: fade-in 0.15s ease-out;
	}
	section {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.row {
		display: grid;
		grid-template-columns: 112px 1fr auto;
		align-items: center;
		gap: 12px;
		min-height: 34px;
	}
	.row:has(.seg) {
		grid-template-columns: 1fr auto;
	}
	/* Long names (Высокое, Среднее, Низкое, Детальная) take two lines on narrow screens. */
	.seg.wrap {
		flex-wrap: wrap;
		justify-content: flex-end;
	}
	.row.off {
		opacity: 0.45;
	}
	.name {
		display: flex;
		align-items: center;
		gap: 8px;
		font-family: var(--px);
		font-weight: 700;
		font-size: 17px;
		color: #fff2d2;
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
	}
	.name img {
		width: 22px;
		height: 22px;
	}
	.val {
		min-width: 30px;
		text-align: right;
		font-family: var(--px);
		font-weight: 700;
		font-size: 15px;
		color: var(--gold);
	}
	.val.wide {
		min-width: 48px;
	}
	.row.reset {
		grid-template-columns: 1fr auto;
	}
	.row > .hint {
		margin: 0 !important;
	}
	.hint {
		margin: -4px 0 0 !important;
		text-wrap: pretty;
		font-size: 13px;
		text-align: left !important;
		color: var(--muted);
	}
	@media (max-width: 480px) {
		.row {
			grid-template-columns: 84px 1fr auto;
			gap: 8px;
		}
		.name {
			font-size: 15px;
		}
		/* Icons over the names, so four tabs fit a phone in any language. */
		.tabs {
			gap: 4px;
			padding: 4px 0 0;
		}
		.tab {
			flex-direction: column;
			gap: 3px;
			padding: 6px 2px 4px;
			font-size: 13px;
		}
		/* Four choices leave no room beside the name: they go under it. */
		.row.stack:has(.seg) {
			grid-template-columns: 1fr;
			gap: 6px;
		}
	}
</style>
