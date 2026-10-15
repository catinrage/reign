<script lang="ts">
	import { CARD_RULES, DEPLOY_RULES, FORTIFY_RULES, MIN_REINFORCE_CHOICES, START_RULES, TRADE_AT_CHOICES } from '../../../shared/conquest/settings';
	import { DEFAULT_CONQUEST_SETTINGS, type CardRule, type ConquestSettings, type DeployRule, type FortifyRule, type StartRule } from '../../../shared/conquest/types';
	import { msg, t } from '../../i18n/index.svelte';
	import { client } from '../../state/client.svelte';
	import Modal from '../menu/Modal.svelte';
	import { PIXEL } from '../pixel';

	/**
	 * Conquest's house rules in the lobby: a row saying what differs from the classic war, and a
	 * panel where the host sets the armies, the cards and how armies move.
	 */
	const s = $derived(client.lobby!.conquest);
	const host = $derived(client.isHost);
	const d = DEFAULT_CONQUEST_SETTINGS;
	let open = $state(false);

	const START: Record<StartRule, string> = { fewer: msg('Fewer'), standard: msg('Standard'), more: msg('More') };
	const DEPLOY: Record<DeployRule, { name: string; text: string }> = {
		placed: { name: msg('Placed'), text: msg('Everyone places their starting armies by hand, all at once.') },
		random: { name: msg('Random'), text: msg('Starting armies are spread at random, so play starts at once.') }
	};
	const CARDS: Record<CardRule, { name: string; text: string }> = {
		escalating: { name: msg('Rising'), text: msg('Each set traded is worth more than the last: 4, 6, 8, 10, 12, 15, then 5 more each.') },
		fixed: { name: msg('Fixed'), text: msg('A set is worth what it shows: footmen 4, knights 6, catapults 8, one of each 10.') },
		none: { name: msg('None'), text: msg('No cards at all: armies come from territories and regions alone.') }
	};
	const FORTIFY: Record<FortifyRule, { name: string; text: string }> = {
		connected: { name: msg('Connected'), text: msg('One move a turn, to any territory joined to it through your own.') },
		adjacent: { name: msg('Neighbours'), text: msg('One move a turn, to a neighbouring territory of yours only.') },
		free: { name: msg('Free'), text: msg('As many moves as you like through your own territories, then end your turn.') }
	};

	/** What differs from the classic war, in a few words, or that nothing does. */
	const summary = $derived.by(() => {
		const parts: string[] = [];
		if (s.start !== d.start) parts.push(t('{size} armies', { size: t(START[s.start]) }));
		if (s.minReinforce !== d.minReinforce) parts.push(t('At least {n} a turn', { n: s.minReinforce }));
		if (s.deploy !== d.deploy) parts.push(t('Random deployment'));
		if (s.cards !== d.cards) parts.push(t('{rule} cards', { rule: t(CARDS[s.cards].name) }));
		if (s.cards !== 'none' && !s.cardBonus) parts.push(t('No territory bonus'));
		if (s.cards !== 'none' && s.tradeAt !== d.tradeAt) parts.push(t('Trade at {n}', { n: s.tradeAt }));
		if (s.fortify !== d.fortify) parts.push(t('{rule} moves', { rule: t(FORTIFY[s.fortify].name) }));
		return parts.length ? parts.join(' · ') : t('Classic rules');
	});
	function set(patch: Partial<ConquestSettings>) {
		client.setConquest(patch);
	}
</script>

<div class="house">
	<span class="head">
		<span class="label">{t('House rules')}</span>
		<span class="summary" class:changed={summary !== t('Classic rules')}>{summary}</span>
	</span>
	<button class="btn small" title={t('Armies, cards and how armies move')} onclick={() => (open = true)}
		><img class="icon-px" src={PIXEL.book} alt="" />{host ? t('Change') : t('See them')}</button
	>
</div>

{#if open}
	<Modal title={t('House rules')} width={560} onclose={() => (open = false)}>
		<div class="rules">
			<section>
				<h3>{t('Armies')}</h3>
				<div class="row">
					<span class="what">{t('Starting armies')}</span>
					<div class="seg three">
						{#each START_RULES as r (r)}
							<button class="btn small" class:on={s.start === r} disabled={!host} onclick={() => set({ start: r })}>{t(START[r])}</button>
						{/each}
					</div>
				</div>
				<div class="row">
					<span class="what" title={t('However few territories are held')}>{t('Least each turn')}</span>
					<div class="seg four">
						{#each MIN_REINFORCE_CHOICES as n (n)}
							<button class="btn small" class:on={s.minReinforce === n} disabled={!host} onclick={() => set({ minReinforce: n })}>{n}</button>
						{/each}
					</div>
				</div>
				<div class="row">
					<span class="what">{t('Deployment')}</span>
					<div class="seg two">
						{#each DEPLOY_RULES as r (r)}
							<button class="btn small" class:on={s.deploy === r} disabled={!host} title={t(DEPLOY[r].text)} onclick={() => set({ deploy: r })}>{t(DEPLOY[r].name)}</button>
						{/each}
					</div>
				</div>
			</section>
			<section>
				<h3>{t('Cards')}</h3>
				<div class="seg three">
					{#each CARD_RULES as r (r)}
						<button class="btn small" class:on={s.cards === r} disabled={!host} onclick={() => set({ cards: r })}>{t(CARDS[r].name)}</button>
					{/each}
				</div>
				<p class="note">{t(CARDS[s.cards].text)}</p>
				{#if s.cards !== 'none'}
					<div class="row">
						<span class="what" title={t('Trading in a card that pictures a territory you hold puts two armies there.')}>{t('Territory bonus')}</span>
						<div class="seg two">
							<button class="btn small" class:on={s.cardBonus} disabled={!host} onclick={() => set({ cardBonus: true })}>{t('On')}</button>
							<button class="btn small" class:on={!s.cardBonus} disabled={!host} onclick={() => set({ cardBonus: false })}>{t('Off')}</button>
						</div>
					</div>
					<div class="row">
						<span class="what" title={t('Holding this many cards as your turn begins, you must trade a set first.')}>{t('Trade at')}</span>
						<div class="seg four">
							{#each TRADE_AT_CHOICES as n (n)}
								<button class="btn small" class:on={s.tradeAt === n} disabled={!host} onclick={() => set({ tradeAt: n })}
									>{t('{n, plural, one {# card} other {# cards}}', { n })}</button
								>
							{/each}
						</div>
					</div>
				{/if}
			</section>
			<section>
				<h3>{t('Fortifying')}</h3>
				<div class="seg three">
					{#each FORTIFY_RULES as r (r)}
						<button class="btn small" class:on={s.fortify === r} disabled={!host} onclick={() => set({ fortify: r })}>{t(FORTIFY[r].name)}</button>
					{/each}
				</div>
				<p class="note">{t(FORTIFY[s.fortify].text)}</p>
			</section>
			{#if host}
				<button
					class="btn small wood reset"
					onclick={() =>
						set({ start: d.start, minReinforce: d.minReinforce, deploy: d.deploy, cards: d.cards, cardBonus: d.cardBonus, tradeAt: d.tradeAt, fortify: d.fortify })}
					>{t('Back to the classic rules')}</button
				>
			{/if}
		</div>
	</Modal>
{/if}

<style>
	.house {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}
	.head {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.label {
		font-family: var(--px);
		font-size: 12px;
		color: var(--gold);
		text-transform: uppercase;
		letter-spacing: 1px;
	}
	.summary {
		font-size: 12.5px;
		color: var(--muted);
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.summary.changed {
		color: #ffd27a;
	}
	.rules {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	section {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	h3 {
		margin: 0;
		font-family: var(--px);
		font-size: 14px;
		color: var(--gold);
	}
	.row {
		display: grid;
		grid-template-columns: 130px 1fr;
		align-items: center;
		gap: 8px;
	}
	.what {
		font-size: 13px;
		color: #e2cba8;
	}
	.seg {
		display: grid;
		gap: 4px;
	}
	.seg.two {
		grid-template-columns: 1fr 1fr;
	}
	.seg.three {
		grid-template-columns: repeat(3, 1fr);
	}
	.seg.four {
		grid-template-columns: repeat(4, 1fr);
	}
	.note {
		margin: 0;
		font-size: 12.5px;
		line-height: 1.3;
		color: var(--muted);
	}
	.reset {
		align-self: center;
	}
</style>
