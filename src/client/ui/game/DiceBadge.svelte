<script lang="ts">
	import { client } from '../../state/client.svelte';
	import { dieFace } from '../art';
	import { ui } from './ui.svelte';

	const dice = $derived(client.view?.dice ?? null);
	const show = $derived(!!dice && !ui.rolling);
</script>

{#if show && dice}
	<div class="wrap">
		{#key dice.join()}
			<div class="dice plaque" class:seven={dice[0] + dice[1] === 7}>
				{#each dice as d, i (i)}
					<span class="die" style="background-image: {dieFace(d)}; --r:{i ? 8 : -6}deg"></span>
				{/each}
				<span class="eq">=</span>
				<span class="coin total">{dice[0] + dice[1]}</span>
			</div>
		{/key}
	</div>
{/if}

<style>
	.wrap {
		position: absolute;
		top: 74px;
		left: 0;
		right: 0;
		display: flex;
		justify-content: center;
		pointer-events: none;
	}
	.dice {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 2px 6px;
		filter: drop-shadow(0 6px 8px rgba(0, 0, 0, 0.4));
		animation: pop-in 0.35s cubic-bezier(0.2, 1.5, 0.4, 1);
	}
	.die {
		width: 34px;
		height: 34px;
		background: center / 100% 100% no-repeat;
		transform: rotate(var(--r));
		filter: drop-shadow(0 3px 0 rgba(0, 0, 0, 0.45));
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
	.seven .total {
		color: #8a1408;
		filter: hue-rotate(-28deg) saturate(1.3);
	}
	@media (max-width: 900px) {
		.wrap {
			top: 108px;
		}
		.die {
			width: 26px;
			height: 26px;
		}
		.total {
			--s: 2px;
			font-size: 17px;
		}
	}
</style>
