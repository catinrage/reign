<script lang="ts">
	import { PIXEL } from '../pixel';
	import { CHANNELS, SIZE_MAX, SIZE_MIN, settings } from '../settings.svelte';
	import { isMuted, setMuted } from '../sound';
	import { msg, t } from '../../i18n/index.svelte';
	import LanguagePicker from '../../i18n/LanguagePicker.svelte';
	import { OFFLINE } from '../../offline/flag';
	import { OFFER_WAITS } from '../../../shared/protocol';
	import { client } from '../../state/client.svelte';

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
	<section>
		<div class="divider"><i></i><span>{t('Language')}</span><i></i></div>
		<LanguagePicker />
	</section>

	<section>
		<div class="divider"><i></i><span>{t('Sound')}</span><i></i></div>
		<div class="row">
			<span class="name"
				><img class="icon-px" src={muted ? PIXEL.mute : PIXEL.speaker} alt="" />{t('Sound')}</span
			>
			<div class="seg">
				<button class="btn small" class:on={!muted} onclick={() => toggleMute(false)}>{t('On')}</button>
				<button class="btn small" class:on={muted} onclick={() => toggleMute(true)}>{t('Off')}</button>
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
		<div class="divider"><i></i><span>{t('Trade offers')}</span><i></i></div>
		<div class="row">
			<span class="name">{t("Hide offers I can't accept")}</span>
			<div class="seg">
				<button class="btn small" class:on={!settings.hideOffers} onclick={() => client.setHideOffers(false)}
					>{t('Off')}</button
				>
				<button class="btn small" class:on={settings.hideOffers} onclick={() => client.setHideOffers(true)}
					>{t('On')}</button
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
					<button class="btn small" class:on={settings.offerWait === secs} onclick={() => client.setOfferWait(secs)}
						>{secs ? t('{seconds}s', { seconds: secs }) : t('Until I answer')}</button
					>
				{/each}
			</div>
		</div>
		<p class="hint">
			{t('How long a bot keeps its trade offer open for your answer. It closes sooner once everyone has answered.')}
		</p>
	</section>

	<section>
		<div class="divider"><i></i><span>{t('Graphics')}</span><i></i></div>
		<div class="row">
			<span class="name"><img class="icon-px" src={PIXEL.moon} alt="" />{t('Night mode')}</span>
			<div class="seg">
				<button class="btn small" class:on={!settings.night} onclick={() => settings.setNight(false)}
					>{t('Off')}</button
				>
				<button class="btn small" class:on={settings.night} onclick={() => settings.setNight(true)}
					>{t('On')}</button
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
			<span class="name">{t('Island detail')}</span>
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
			{t('Fine builds the island from voxels half the size, for more detail. Standard is lighter on old devices. Switching takes a moment to rebuild.')}
		</p>
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

<style>
	.settings {
		display: flex;
		flex-direction: column;
		gap: 18px;
		padding: 4px 2px;
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
		/* Four choices leave no room beside the name: they go under it. */
		.row.stack:has(.seg) {
			grid-template-columns: 1fr;
			gap: 6px;
		}
	}
</style>
