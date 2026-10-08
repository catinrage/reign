<script lang="ts">
	import { client } from '../../state/client.svelte';
	import { ui } from './ui.svelte';

	const dice = $derived(client.view?.dice ?? null);
	const show = $derived(!!dice && !ui.rolling);
	const pipsFor: Record<number, [number, number][]> = {
		1: [[1, 1]],
		2: [[0, 0], [2, 2]],
		3: [[0, 0], [1, 1], [2, 2]],
		4: [[0, 0], [2, 0], [0, 2], [2, 2]],
		5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
		6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]]
	};
</script>

{#if show && dice}
	<div class="wrap">
	{#key dice.join()}
		<div class="dice" class:seven={dice[0] + dice[1] === 7}>
			{#each dice as d}
				<div class="die">
					{#each pipsFor[d] as [x, y]}
						<span class="pip" class:red={d === 1} style="grid-column:{x + 1}; grid-row:{y + 1}"></span>
					{/each}
				</div>
			{/each}
			<div class="total title">{dice[0] + dice[1]}</div>
		</div>
	{/key}
	</div>
{/if}

<style>
	.wrap {
		position: absolute;
		top: 70px;
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
		padding: 6px 10px 6px 8px;
		border-radius: 12px;
		background: rgba(36, 20, 11, 0.8);
		border: 2px solid #1a0d06;
		animation: pop-in 0.35s cubic-bezier(0.2, 1.5, 0.4, 1);
	}
	.die {
		width: 30px;
		height: 30px;
		padding: 4px;
		box-sizing: border-box;
		background: linear-gradient(180deg, #fffaf0, #e9e0cc);
		border-radius: 6px;
		box-shadow:
			inset 0 -3px 0 rgba(0, 0, 0, 0.15),
			0 2px 0 #6a5a40;
		display: grid;
		grid-template: repeat(3, 1fr) / repeat(3, 1fr);
		place-items: center;
	}
	.pip {
		width: 5px;
		height: 5px;
		background: #3a1f1a;
	}
	.pip.red {
		width: 7px;
		height: 7px;
		background: #c2271d;
	}
	.total {
		font-size: 26px;
		min-width: 30px;
		text-align: center;
		color: var(--gold);
		text-shadow: 0 2px 0 #5a3010;
	}
	.seven .total {
		color: #ff6a55;
	}
	@media (max-width: 700px) {
		.wrap {
			top: 108px;
		}
	}
</style>
