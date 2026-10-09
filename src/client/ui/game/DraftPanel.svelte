<script lang="ts">
	import { CHARACTER_INFO, POWER_INFO, traitText, type CharacterId } from '../../../shared/rules/characters';
	import { draftLeft } from '../../../shared/rules/queries';
	import { client } from '../../state/client.svelte';
	import Portrait from '../extended/Portrait.svelte';
	import Modal from '../menu/Modal.svelte';
	import { sfx } from '../sound';
	import { msg, t, tx } from '../../i18n/index.svelte';

	/**
	 * Reign Extended's character draft, at the start of the game. Players pick one at a time in
	 * reverse settlement order (whoever places the first settlement picks last). Pointing at a
	 * character shows everything about it on the right; on your go, click one and lock it in.
	 */
	const view = $derived(client.view!);
	const draft = $derived(view.draft!);
	const mine = $derived(view.me >= 0 && view.current === view.me);
	const left = $derived(draftLeft(view));
	// A big pool (more than eight) gets smaller cards so all of it fits at once.
	const many = $derived(draft.pool.length > 8);
	/** Everyone who has this character (more than one when picks can repeat). */
	const pickedBy = (c: CharacterId) => view.players.flatMap((p, i) => (p.character === c ? [i] : []));
	const nameOf = (p: number) => (p === view.me ? t('You') : view.players[p].name);
	/** Who has it, for the detail panel: "you", "Ann", "Ann and you". */
	const names = (ps: number[]) => {
		const all = ps.map((p) => (p === view.me ? t('you') : view.players[p].name));
		let out = all[0] ?? '';
		for (let i = 1; i < all.length; i++)
			out = i === all.length - 1 ? t('{list} and {last}', { list: out, last: all[i] }) : t('{list}, {next}', { list: out, next: all[i] });
		return out;
	};

	let chosen = $state<CharacterId | null>(null);
	let hovered = $state<CharacterId | null>(null);
	// What the side panel shows: the one under the pointer, else your choice, else the first free.
	const shown = $derived(hovered ?? chosen ?? left[0] ?? draft.pool[0]);
	const info = $derived(CHARACTER_INFO[shown]);
	const shownBy = $derived(pickedBy(shown));

	// A choice someone else just took is no choice.
	$effect(() => {
		if (chosen && !left.includes(chosen)) chosen = null;
	});

	function point(c: CharacterId | null) {
		if (c && c !== hovered) sfx.hover();
		hovered = c;
	}
	function choose(c: CharacterId) {
		if (!left.includes(c)) return;
		chosen = c;
		sfx.click();
	}
	function lockIn() {
		if (!chosen || !mine) return;
		client.act({ type: 'pickCharacter', character: chosen });
	}
	/** Places in the picking order; a table never has more than eight players. */
	const ORDINALS = [msg('1st'), msg('2nd'), msg('3rd'), msg('4th'), msg('5th'), msg('6th'), msg('7th'), msg('8th')];
	const ordinal = (n: number) => (ORDINALS[n - 1] ? t(ORDINALS[n - 1]) : String(n));
	const status = $derived(mine ? t('Your pick!') : t('{player} is picking…', { player: view.players[view.current].name }));
</script>

<Modal title={t('Character draft')} width={980}>
	<p class="lead">
		{#if draft.repeats}
			{t('One character each, and a character already picked is still yours to take. The first to place a settlement picks last.')}
		{:else}
			{t('One character each. The first to place a settlement picks last, so the last to place picks first.')}
		{/if}
	</p>

	<ol class="order">
		{#each draft.order as p, i (p)}
			{@const pl = view.players[p]}
			{@const now = i === draft.picked}
			<li class="slot plaque" class:now class:done={i < draft.picked} class:me={p === view.me}>
				<span class="nth">{ordinal(i + 1)}</span>
				<span class="face">
					<Portrait id={pl.character} size={44} />
					<span class="shield mini" style="--shield: var(--art-shield-{pl.color})"></span>
				</span>
				<span class="who">
					<span class="nm">{p === view.me ? t('You') : pl.name}</span>
					<small>{pl.character ? t(CHARACTER_INFO[pl.character].name) : now ? t('picking') : t('waiting')}</small>
				</span>
			</li>
		{/each}
	</ol>

	<div class="body">
		<div class="pool" class:many role="group" aria-label={t('Characters')} onpointerleave={() => point(null)}>
			{#each draft.pool as c (c)}
				{@const by = pickedBy(c)}
				{@const ch = CHARACTER_INFO[c]}
				{@const taken = by.length > 0 && !draft.repeats}
				<button
					class="card plaque"
					class:on={chosen === c}
					class:taken
					aria-pressed={chosen === c}
					aria-disabled={taken}
					onpointerenter={() => point(c)}
					onfocus={() => point(c)}
					onclick={() => choose(c)}
				>
					<Portrait id={c} size={many ? 54 : 84} tip={false} />
					<span class="name title">{t(ch.name)}</span>
					<span class="epithet">{t(ch.title)}</span>
					{#if by.length}
						<span class="by" class:open={!taken}
							>{#each by as p (p)}<span class="shield mini" style="--shield: var(--art-shield-{view.players[p].color})"
								></span>{/each}{by.length > 1 ? `×${by.length}` : nameOf(by[0])}</span
						>
					{/if}
				</button>
			{/each}
		</div>

		<aside class="detail well" aria-live="polite">
			<Portrait id={shown} size={120} />
			<span class="dname title">{t(info.name)} <small>{t(info.title)}</small></span>
			<span class="label">{t('Trait')}</span>
			<span class="trait">{t(info.trait)}</span>
			<span class="text">{tx(traitText(shown, view.handLimit))}</span>
			{#if view.powers}
				<span class="label"
					>{view.powerRecharge
						? t('{n, plural, one {Power, every round} other {Power, every # rounds}}', { n: view.powerRecharge })
						: t('Power, once per game')}</span
				>
				<span class="trait power">{t(POWER_INFO[shown].name)}</span>
				<span class="text">{t(POWER_INFO[shown].text)}</span>
			{/if}
			{#if shownBy.length}
				<span class="note"
					>{draft.repeats && mine
						? t('Picked by {names}. You can pick it too.', { names: names(shownBy) })
						: t('Picked by {names}.', { names: names(shownBy) })}</span
				>
			{/if}
		</aside>
	</div>

	<div class="foot">
		<span class="status" class:mine>{status}</span>
		{#if mine}
			<button class="btn green shine" disabled={!chosen} onclick={lockIn}>
				{chosen ? t('Pick {name}', { name: t(CHARACTER_INFO[chosen].name) }) : t('Choose a character')}
			</button>
		{/if}
	</div>
</Modal>

<style>
	.lead {
		margin: 0 0 10px;
		text-align: center;
	}
	.order {
		list-style: none;
		margin: 0 0 12px;
		padding: 0;
		display: flex;
		gap: 6px;
		justify-content: center;
		flex-wrap: wrap;
	}
	.slot {
		position: relative;
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 3px 9px 3px 5px;
		min-width: 0;
		transition: filter 0.2s;
	}
	.slot:not(.now):not(.done) {
		filter: brightness(0.72) saturate(0.7);
	}
	.slot.now {
		filter: drop-shadow(0 0 0 #ffd45a) drop-shadow(0 0 5px #ffd45a);
	}
	.nth {
		position: absolute;
		top: -8px;
		left: 6px;
		padding: 0 4px;
		font-family: var(--px);
		font-weight: 700;
		font-size: 10px;
		color: #2a1608;
		background: var(--gold);
	}
	.face {
		position: relative;
		flex: none;
	}
	.face .shield.mini,
	.by .shield.mini {
		--s: 1.3px;
		width: 15px;
		height: 18px;
		padding: 0;
	}
	.face .shield.mini {
		position: absolute;
		right: -5px;
		bottom: -4px;
	}
	.who {
		display: flex;
		flex-direction: column;
		line-height: 1.15;
		min-width: 0;
	}
	.nm {
		font-family: var(--px);
		font-weight: 700;
		font-size: 14px;
		color: #fff2d2;
		white-space: nowrap;
		max-width: 96px;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.me .nm {
		color: #ffe08a;
	}
	.who small {
		font-size: 12px;
		color: var(--muted);
	}
	.body {
		display: grid;
		grid-template-columns: 1fr 270px;
		gap: 12px;
		align-items: stretch;
	}
	.pool {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(128px, 1fr));
		gap: 8px;
		align-content: start;
	}
	.pool.many {
		grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
		gap: 6px;
	}
	.pool.many .card {
		padding-top: 5px;
		padding-bottom: 6px;
	}
	.pool.many .name {
		font-size: 15px;
	}
	.card {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: 8px 6px 9px;
		color: var(--text);
		font: inherit;
		cursor: pointer;
		transition: transform 0.12s;
	}
	.card:hover:not(.taken) {
		transform: translateY(-3px);
	}
	.card.on {
		filter: drop-shadow(0 0 0 #ffd45a) drop-shadow(0 0 5px #ffd45a);
	}
	.card.taken {
		cursor: default;
	}
	.card.taken :global(.portrait) {
		filter: grayscale(0.85) brightness(0.6);
	}
	.name {
		font-size: 17px;
		color: #fff2d2;
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
	}
	.epithet {
		font-size: 12px;
		color: var(--muted);
	}
	.by {
		position: absolute;
		top: 40px;
		left: 50%;
		transform: translateX(-50%) rotate(-6deg);
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 2px 7px;
		font-family: var(--px);
		font-weight: 700;
		font-size: 12px;
		color: #fff2d2;
		background: rgba(20, 8, 2, 0.88);
		box-shadow: 0 0 0 2px #1a0c05;
		white-space: nowrap;
	}
	/* Picks can repeat: the card stays live, so the badge sits on its corner, clear of the face. */
	.by.open {
		top: -8px;
		left: auto;
		right: -6px;
		transform: none;
	}
	.detail {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 14px 12px;
		text-align: center;
	}
	.dname {
		margin-top: 4px;
		font-size: 22px;
		color: #fff2d2;
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
	}
	.dname small {
		display: block;
		font-size: 13px;
		color: var(--muted);
	}
	.detail .label {
		margin-top: 8px;
	}
	.trait {
		font-family: var(--px);
		font-weight: 700;
		font-size: 15px;
		color: var(--gold);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.trait.power {
		color: #b7a3ff;
	}
	.text {
		font-size: 14px;
		line-height: 1.35;
		color: #f1dfc2;
		text-wrap: balance;
	}
	.note {
		margin-top: auto;
		padding-top: 8px;
		font-size: 13px;
		color: #ffb08a;
	}
	.foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-top: 12px;
		min-height: 44px;
	}
	.status {
		font-family: var(--px);
		font-weight: 700;
		font-size: 16px;
		color: #f1dfc2;
	}
	.status.mine {
		color: #ffe08a;
	}
	@media (max-width: 760px) {
		.body {
			grid-template-columns: minmax(0, 1fr);
		}
		.detail {
			order: -1;
			display: grid;
			grid-template-columns: auto minmax(0, 1fr);
			column-gap: 10px;
			row-gap: 2px;
			align-items: center;
			text-align: left;
			padding: 8px 10px;
		}
		.detail > :global(.portrait) {
			grid-row: span 3;
			--size: 64px !important;
		}
		.detail .label {
			display: none;
		}
		.dname {
			margin: 0;
			font-size: 18px;
		}
		.dname small {
			display: inline;
		}
		.text,
		.note {
			grid-column: 2;
			font-size: 13px;
			text-align: left;
		}
		.note {
			margin: 0;
			padding: 0;
		}
		.pool {
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 6px;
		}
		.card {
			min-width: 0;
			padding: 6px 4px 7px;
		}
		.card :global(.portrait) {
			--size: 52px !important;
		}
		.by {
			top: 24px;
			font-size: 11px;
		}
		.name {
			font-size: 14px;
		}
		.epithet {
			display: none;
		}
		.lead {
			font-size: 13px;
		}
	}
</style>
