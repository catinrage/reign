<script lang="ts">
	import { CHARACTERS, CHARACTER_INFO } from '../../../../shared/rules/characters';
	import Portrait from '../../extended/Portrait.svelte';
	import { PIXEL } from '../../pixel';
</script>

<p>
	In Reign Extended every player plays a character. A character's <b>trait</b> bends one rule for them
	for the whole game, so each seat at the table plays a little differently.
</p>

<ul class="rows">
	<li>
		<img class="icon-px" src={PIXEL.house} alt="" /><span
			>Pick yours in the lobby, next to <b>Your character</b>. You can change your mind until the
			game starts.</span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.lock} alt="" /><span
			>No two players can play the same character. Bots are given one at random.</span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.chat} alt="" /><span
			>Everyone's character shows on their plaque, so you always know what your rivals can do.</span
		>
	</li>
</ul>

<h3>The cast</h3>
<div class="cast">
	{#each CHARACTERS as c (c)}
		{@const info = CHARACTER_INFO[c]}
		<div class="who">
			<Portrait id={c} size={78} />
			<div class="text">
				<span class="name"
					><b class="title">{info.name}</b> <span class="epithet">{info.title}</span></span
				>
				<span class="trait">{info.trait}</span>
				<span>{info.text}</span>
			</div>
		</div>
	{/each}
</div>

<p class="tip">
	<img class="icon-px" src={PIXEL.star} alt="" /><span
		>Let your character shape your opening. The Mason wants ore for cities, the Merchant can live
		off the bank, and the Explorer should race for the long road.</span
	>
</p>

<style>
	.cast {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	.who {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 12px 8px 8px;
		background: rgba(255, 250, 235, 0.55);
		box-shadow: inset 0 0 0 2px rgba(138, 98, 54, 0.3);
	}
	.text {
		display: flex;
		flex-direction: column;
		line-height: 1.32;
		font-size: 14.5px;
		min-width: 0;
	}
	.name b {
		font-size: 18px;
	}
	.epithet {
		color: var(--ink-soft);
		font-size: 14px;
	}
	.trait {
		font-family: var(--px);
		font-weight: 700;
		color: #b8740f;
	}
	@media (max-width: 760px) {
		.cast {
			grid-template-columns: 1fr;
		}
	}
</style>
