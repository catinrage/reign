<script lang="ts" module>
	import { t, tx } from '../../i18n/index.svelte';

	/** How often powers come back, in words. */
	export function rechargeName(rounds: number): string {
		return rounds ? t('{rounds, plural, one {Every round} other {Every # rounds}}', { rounds }) : t('Once per game');
	}
</script>

<script lang="ts">
	import { CHARACTERS, CHARACTER_INFO, POWER_INFO, traitText, type CharacterId } from '../../../shared/rules/characters';
	import { POWER_RECHARGES, characterPool } from '../../../shared/rules/modes';
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
	// With repeat picks one character is enough for the whole table.
	const short = $derived(settings.characters && !settings.repeatPicks && pool.length < players);

	const powers = $derived(settings.characters && settings.powers);

	/** Off, traits only, or traits and powers. */
	function setLevel(level: 0 | 1 | 2) {
		if (settings.characters !== level > 0) client.send({ t: 'setCharacters', on: level > 0 });
		if (level > 0 && settings.powers !== (level === 2)) client.send({ t: 'setPowers', on: level === 2 });
	}

	function toggle(c: CharacterId) {
		if (!host) return;
		client.send({ t: 'leaveOut', character: c, out: pool.includes(c) });
	}
</script>

<Modal title={t('Characters')} width={powers ? 1340 : 1180} {onclose}>
	<div class="head">
		<p>
			{#if powers}
				{t('Each character bends one rule and has a power. Everyone drafts one at the start; the first settler picks last.')}
			{:else}
				{t(
					'Each character bends one rule in their favor. When the game starts, everyone drafts one, and the first to place a settlement picks last.'
				)}
			{/if}
		</p>
		{#if host}
			<div class="seg">
				<button class="btn small" class:on={!settings.characters} onclick={() => setLevel(0)}>{t('Off')}</button>
				<button class="btn small" class:on={settings.characters && !settings.powers} onclick={() => setLevel(1)}>{t('Traits')}</button>
				<button class="btn small" class:on={powers} onclick={() => setLevel(2)}>{t('Traits and powers')}</button>
			</div>
		{/if}
	</div>
	<div class="sub">
		{#if settings.characters}
			<div class="opt">
				<span class="label">{t('Picks')}</span>
				{#if host}
					<div class="seg">
						<button
							class="btn small"
							class:on={!settings.repeatPicks}
							title={t('Once someone drafts a character, nobody else can pick it.')}
							onclick={() => client.send({ t: 'setRepeatPicks', on: false })}>{t('Unique')}</button
						>
						<button
							class="btn small"
							class:on={settings.repeatPicks}
							title={t('A character someone drafted can still be picked by the players after them.')}
							onclick={() => client.send({ t: 'setRepeatPicks', on: true })}>{t('Can repeat')}</button
						>
					</div>
				{:else}
					<span>{settings.repeatPicks ? t('Can repeat') : t('Unique')}</span>
				{/if}
			</div>
		{/if}
		{#if powers}
			<div class="opt">
				<span class="label">{t('Powers')}</span>
				{#if host}
					<div class="seg">
						{#each POWER_RECHARGES as r (r)}
							<button
								class="btn small"
								class:on={settings.powerRecharge === r}
								onclick={() => client.send({ t: 'setRecharge', rounds: r })}>{rechargeName(r)}</button
							>
						{/each}
					</div>
				{:else}
					<span>{rechargeName(settings.powerRecharge)}</span>
				{/if}
			</div>
		{/if}
		<p class="count" class:bad={short}>
			{#if !settings.characters}
				{t('Characters are off: everyone plays by the plain rules.')}
			{:else if short}
				{t('{count} of {total} in the draft, but {players} players need at least {players}.', {
					count: pool.length,
					total: CHARACTERS.length,
					players
				})}
			{:else}
				{host
					? t('{count} of {total} in the draft. Click one to leave it out or put it back.', { count: pool.length, total: CHARACTERS.length })
					: t('{count} of {total} in the draft.', { count: pool.length, total: CHARACTERS.length })}
			{/if}
		</p>
	</div>
	<div class="grid" class:six={powers} class:off={!settings.characters}>
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
				<Portrait id={c} size={powers ? 40 : 58} />
				<span class="body">
					<span class="who">
						<span class="name title">{t(info.name)}</span>
						<span class="epithet">{t(info.title)}</span>
					</span>
					<span class="trait">{t(info.trait)}</span>
					<span class="text">{tx(traitText(c, settings.handLimit))}</span>
					{#if powers}
						<span class="trait power">{t(POWER_INFO[c].name)}</span>
						<span class="text">{t(POWER_INFO[c].text)}</span>
					{/if}
				</span>
				{#if out}<span class="tag">{t('Left out')}</span>{/if}
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
	.sub {
		display: flex;
		align-items: center;
		column-gap: 22px;
		flex-wrap: wrap;
	}
	.sub .count {
		margin-left: auto !important;
	}
	.opt {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: 8px;
		font-size: 14px;
	}
	.opt .label {
		font-family: var(--px);
		font-weight: 700;
		font-size: 12px;
		color: #b7a3ff;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.opt .seg {
		display: flex;
		gap: 4px;
	}
	.trait.power {
		margin-top: 3px;
		color: #b7a3ff;
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
	/* Sixteen characters at once: small side-by-side cards, three or four to a row. */
	.grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 6px;
	}
	.grid.off {
		opacity: 0.45;
	}
	.card {
		position: relative;
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 6px 8px 7px 6px;
		color: var(--text);
		font: inherit;
		cursor: pointer;
		text-align: left;
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
	.body {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
	}
	.who {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		column-gap: 5px;
		line-height: 1.1;
	}
	.name {
		font-size: 16px;
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
		font-size: 11px;
		color: var(--gold);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.text {
		font-size: 12.5px;
		line-height: 1.25;
		color: #f1dfc2;
	}
	.tag {
		position: absolute;
		top: 24px;
		left: 35px;
		transform: translateX(-50%) rotate(-6deg);
		padding: 2px 7px;
		font-size: 11px;
		font-weight: 800;
		background: rgba(20, 8, 2, 0.82);
		color: #ffb08a;
	}
	/* With powers there is twice as much to read: two rows of eight narrow cards, the portrait beside
	   the name and the text across the card, so all sixteen still fit a 1366x768 screen. */
	.grid.six {
		grid-template-columns: repeat(8, minmax(0, 1fr));
	}
	.six .card {
		display: grid;
		grid-template-columns: 40px 1fr;
		gap: 0 7px;
		align-content: start;
		padding: 5px 7px 6px 5px;
	}
	.six .body {
		display: contents;
	}
	.six .who {
		align-self: center;
		flex-direction: column;
		align-items: flex-start;
	}
	.six .trait,
	.six .text {
		grid-column: 1 / -1;
	}
	.six .trait {
		margin-top: 5px;
		line-height: 1.2;
	}
	.six .text {
		font-size: 12px;
		line-height: 1.22;
	}
	.six .tag {
		top: 16px;
		left: 25px;
	}
	@media (max-width: 1250px) {
		.grid.six {
			grid-template-columns: repeat(6, minmax(0, 1fr));
		}
	}
	@media (max-width: 1000px) {
		.grid,
		.grid.six {
			grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
		}
	}
	@media (max-width: 560px) {
		.head {
			flex-direction: column;
			align-items: stretch;
		}
	}
</style>
