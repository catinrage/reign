<script lang="ts">
	import { client } from '../../state/client.svelte';
	import { dieFace } from '../art';
	import { name, playerInk } from '../helpers';
	import { t } from '../../i18n/index.svelte';
	import Rich from '../../i18n/Rich.svelte';

	/**
	 * The latest roll, in sight for everyone from the first roll of the game on: who threw it, in
	 * their color, the two dice and the total. While the dice are in the air the faces tumble, and
	 * the badge lands on the result as the dice on the table come to rest.
	 */
	const view = $derived(client.view!);
	const toss = $derived(client.tossing);
	const roll = $derived(client.lastRoll);
	const who = $derived(toss ? toss.player : (roll?.player ?? -1));
	const total = $derived(roll ? roll.dice[0] + roll.dice[1] : 0);

	let faces = $state<[number, number]>([1, 1]);
	$effect(() => {
		if (!toss) return;
		let f: [number, number] = [turn(0), turn(0)];
		const tumble = () => (faces = f = [turn(f[0]), turn(f[1])]);
		tumble();
		const timer = setInterval(tumble, 85);
		return () => clearInterval(timer);
	});
	/** A random face other than `n` (any face for 0). */
	function turn(n: number) {
		return 1 + ((n + Math.floor(Math.random() * (n ? 5 : 6))) % 6);
	}
	const dice = $derived(toss ? faces : (roll?.dice ?? null));
	const label = $derived.by(() => {
		const you = who === view.me;
		if (toss) return you ? t('You roll…') : t('{player} rolls…', { player: name(view, who) });
		if (!roll) return '';
		const p = { player: name(view, who), a: roll.dice[0], b: roll.dice[1], total };
		return you ? t('You rolled {a} and {b}: {total}', p) : t('{player} rolled {a} and {b}: {total}', p);
	});
	/** The line over the dice, with the thrower's name in their color. */
	const line = $derived(
		who === view.me ? (toss ? t('{you} roll…') : t('{you} rolled')) : toss ? t('{player} rolls…') : t('{player} rolled')
	);
</script>

{#if who >= 0 && dice}
	<div class="wrap">
		<div
			class="badge plaque"
			class:tossing={!!toss}
			class:seven={!toss && total === 7}
			role="status"
			aria-label={label}
			title={label}
		>
			{#snippet thrower()}<b style="--c:{playerInk(view, who)}">{name(view, who)}</b>{/snippet}
			<span class="who"><Rich text={line} slots={{ you: thrower, player: thrower }} /></span>
			{#key toss ? 'toss' : roll?.seq}
				<span class="row" class:landed={!toss}>
					{#each dice as d, i (i)}
						<span
							class="die"
							data-face={d}
							style="background-image: {dieFace(d)}; --r:{i ? 8 : -6}deg"
						></span>
					{/each}
					<span class="eq">=</span>
					<span class="coin total">{toss ? '?' : total}</span>
				</span>
			{/key}
		</div>
	</div>
{/if}

<style>
	/* Under the turn banner, and under its clock in a timed game. */
	.wrap {
		position: absolute;
		top: calc(74px + var(--clock-h, 0px));
		left: 0;
		right: 0;
		display: flex;
		justify-content: center;
		pointer-events: none;
	}
	.badge {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 2px 6px 2px 10px;
		/* One piece per edge: repeated pieces leave hairline gaps at some widths. */
		border-image-repeat: stretch;
		filter: drop-shadow(0 6px 8px rgba(0, 0, 0, 0.4));
		animation: pop-in 0.35s cubic-bezier(0.2, 1.5, 0.4, 1);
	}
	.who {
		font-family: var(--px);
		font-weight: 700;
		font-size: 17px;
		color: #e9d2b0;
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
		white-space: nowrap;
	}
	.who b {
		color: var(--c);
		/* A dark outline keeps every color readable on the wood, white and yellow too. */
		text-shadow:
			2px 0 0 #1a0c05,
			-2px 0 0 #1a0c05,
			0 2px 0 #1a0c05,
			0 -2px 0 #1a0c05,
			2px 2px 0 #1a0c05,
			-2px 2px 0 #1a0c05,
			2px -2px 0 #1a0c05,
			-2px -2px 0 #1a0c05;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.die {
		width: 34px;
		height: 34px;
		background: center / 100% 100% no-repeat;
		transform: rotate(var(--r));
		filter: drop-shadow(0 3px 0 rgba(0, 0, 0, 0.45));
	}
	/* In the air: the faces flicker past (see the script) while the dice rock and hop. */
	.tossing .die {
		animation: tumble 0.3s ease-in-out infinite;
	}
	.tossing .die + .die {
		animation-delay: -0.15s;
	}
	/* Landed: the result drops into place. */
	.landed .die,
	.landed .total {
		animation: land 0.3s cubic-bezier(0.2, 1.6, 0.4, 1);
	}
	.eq {
		font-family: var(--px);
		font-weight: 700;
		font-size: 20px;
		color: var(--muted);
	}
	.total {
		--s: 2.5px;
		font-size: 21px;
	}
	.tossing .total {
		color: #8a5a20;
		text-shadow: none;
	}
	.seven .total {
		color: #8a1408;
		filter: hue-rotate(-28deg) saturate(1.3);
	}
	@keyframes tumble {
		0%,
		100% {
			transform: rotate(-16deg);
		}
		50% {
			transform: rotate(16deg) translateY(-4px);
		}
	}
	@keyframes land {
		from {
			transform: rotate(var(--r, 0deg)) scale(1.4);
		}
	}
	@media (max-width: 900px) {
		/* Phones: two lines at the right, under the plaques and clear of the chronicle. */
		.wrap {
			top: calc(104px + var(--clock-h, 0px));
			left: auto;
			right: 6px;
		}
		.badge {
			flex-direction: column;
			gap: 1px;
			padding: 0 4px 2px;
		}
		.who {
			font-size: 13px;
		}
		.who b {
			text-shadow:
				1px 0 0 #1a0c05,
				-1px 0 0 #1a0c05,
				0 1px 0 #1a0c05,
				0 -1px 0 #1a0c05,
				1px 1px 0 #1a0c05,
				-1px 1px 0 #1a0c05,
				1px -1px 0 #1a0c05,
				-1px -1px 0 #1a0c05;
		}
		.row {
			gap: 5px;
		}
		.die {
			width: 26px;
			height: 26px;
		}
		.eq {
			font-size: 15px;
		}
		.total {
			--s: 2px;
			font-size: 16px;
		}
	}
</style>
