<script lang="ts">
	import { client } from '../state/client.svelte';
	import CodeTiles from './menu/CodeTiles.svelte';
	import Embers from './menu/Embers.svelte';
	import { PIXEL } from './pixel';
	import { t, tx } from '../i18n/index.svelte';

	/**
	 * Where an invite link lands: the room's code on its tiles and how far along the trip to the
	 * table is, instead of the main menu flashing up first. If the room is gone it says so here.
	 */
	const joining = $derived(client.joining!);
	const STEPS = $derived([
		t('Reaching the realm'),
		t('Finding the table'),
		client.spectating ? t('Finding a spot to watch') : t('Taking your seat')
	]);
	const step = $derived(
		client.status !== 'online' ? 0 : !client.seat && !client.spectating ? 1 : 2
	);
</script>

<div class="joining">
	<Embers count={14} />
	<div class="column">
		{#if joining.error}
			<div class="card panel failed">
				<div class="ribbon head crimson">{t("Can't join")}</div>
				<div class="room">
					<span class="label">{t('Room code')}</span>
					<CodeTiles value={joining.code} size="big" />
				</div>
				<p class="why">{tx(joining.error)}</p>
				<button class="btn big block green" onclick={() => client.cancelJoin()}>
					<img src={PIXEL.house} alt="" />{t('Main menu')}
				</button>
			</div>
		{:else}
			<div class="card panel">
				<div class="ribbon head">{t('Joining room')}</div>
				<div class="room">
					<span class="label">{t('Room code')}</span>
					<CodeTiles value={joining.code} size="big" />
				</div>
				<ol class="steps">
					{#each STEPS as label, i (i)}
						<li class:done={i < step} class:now={i === step}>
							<span class="mark">
								{#if i < step}
									<img class="icon-px" src={PIXEL.check} alt="" />
								{:else if i === step}
									<img class="icon-px turn" src={PIXEL.hourglass} alt="" />
								{:else}
									<i></i>
								{/if}
							</span>
							<span
								>{label}{#if i === step}<span class="dots"><b>.</b><b>.</b><b>.</b></span
									>{/if}</span
							>
						</li>
					{/each}
				</ol>
				<button class="btn small wood back" onclick={() => client.cancelJoin()}>
					<img class="icon-px" src={PIXEL.door} alt="" />{t('Back to menu')}
				</button>
			</div>
		{/if}
	</div>
</div>

<style>
	.joining {
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
		width: min(400px, 100%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		padding: calc(var(--s) * 9) 18px 16px;
		animation: pop-in 0.35s cubic-bezier(0.2, 1.3, 0.4, 1);
	}
	.head {
		position: absolute;
		top: 0;
		left: 50%;
		transform: translate(-50%, -66%);
		font-size: 22px;
		padding-left: calc(var(--s) * 6);
		padding-right: calc(var(--s) * 6);
	}
	.head.crimson {
		--rib: var(--art-ribbon-crimson);
	}
	.room {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
	}
	.steps {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
		align-self: stretch;
		padding-left: 12%;
	}
	.steps li {
		display: flex;
		align-items: center;
		gap: 10px;
		font-family: var(--px);
		font-weight: 700;
		font-size: 17px;
		color: rgba(255, 236, 205, 0.45);
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.5);
		transition: color 0.3s;
	}
	.steps li.done {
		color: #b9e07a;
	}
	.steps li.now {
		color: #fff2d2;
	}
	.mark {
		width: 22px;
		height: 22px;
		display: grid;
		place-items: center;
		flex: none;
	}
	.mark img {
		width: 22px;
		height: 22px;
	}
	.done .mark img {
		animation: pop-in 0.25s ease-out;
	}
	.mark i {
		width: calc(var(--s) * 3);
		height: calc(var(--s) * 3);
		background: rgba(255, 236, 205, 0.3);
	}
	.turn {
		animation: flip 1.6s ease-in-out infinite;
	}
	.dots b {
		animation: blink 1.2s steps(1) infinite;
	}
	.dots b:nth-child(2) {
		animation-delay: 0.2s;
	}
	.dots b:nth-child(3) {
		animation-delay: 0.4s;
	}
	.back {
		gap: 8px;
	}
	.why {
		margin: 0;
		text-align: center;
		font-weight: 700;
		font-size: 16px;
		color: #fff2d2;
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.5);
	}
	.failed .btn img {
		height: calc(var(--s) * 9);
	}
	.failed .btn {
		gap: 12px;
	}
	@keyframes flip {
		50% {
			transform: rotate(180deg);
		}
	}
	@keyframes blink {
		0% {
			opacity: 0;
		}
		40% {
			opacity: 1;
		}
	}
</style>
