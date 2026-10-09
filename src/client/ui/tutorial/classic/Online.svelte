<script lang="ts">
	import { MIN_PLAYERS } from '../../../../shared/protocol';
	import { PIXEL } from '../../pixel';

	const ways = [
		{ icon: PIXEL.play, name: 'Play vs bots', text: 'Starts at once against three bots.' },
		{
			icon: PIXEL.house,
			name: 'Create a room',
			text: 'Opens a table with a five-letter code to share.'
		},
		{
			icon: PIXEL.letter,
			name: 'Join a friend',
			text: 'Type their code on the main menu, or open their invite link.'
		}
	];
</script>

<div class="ways">
	{#each ways as w (w.name)}
		<div class="way">
			<img class="icon-px" src={w.icon} alt="" />
			<b>{w.name}</b>
			<span class="caption">{w.text}</span>
		</div>
	{/each}
</div>

<h3>In the room</h3>
<ul class="rows">
	<li>
		<img class="icon-px" src={PIXEL.crown} alt="" /><span
			>The player who made the room is the <b>host</b>. The host picks the mode and the turn timer,
			and can add or remove bots.</span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.bot} alt="" /><span
			>A game needs at least {MIN_PLAYERS} players. Bots fill any seat a friend isn't using.</span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.shieldIcon} alt="" /><span>Everyone picks a banner color.</span>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.check} alt="" /><span
			>Guests press <b>I am ready</b>. The host can start once everyone is ready.</span
		>
	</li>
</ul>

<h3>During the game</h3>
<ul class="rows">
	<li>
		<img class="icon-px" src={PIXEL.pause} alt="" /><span
			><b>Pause for everyone</b> with the pause button or <kbd>P</kbd>. Anyone at the table can
			resume.</span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.gear} alt="" /><span
			>The game menu (<kbd>Esc</kbd>) has this tutorial and the settings. In a game against bots,
			opening it also pauses the table.</span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.door} alt="" /><span
			>If you leave, a bot plays your seat. While anyone is still playing, <b>Rejoin game</b> on the main
			menu takes you back. When every player has left, the game is cancelled.</span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.chat} alt="" /><span
			>The chronicle on the left lists every roll, trade and build as it happens.</span
		>
	</li>
</ul>

<h3>Controls</h3>
<div class="cols controls">
	<span><kbd>Drag</kbd> turn the table</span>
	<span><kbd>Right drag</kbd> or two fingers: pan</span>
	<span><kbd>Wheel</kbd> or pinch: zoom</span>
	<span><kbd>Esc</kbd> cancel, or open the menu</span>
	<span><kbd>P</kbd> pause for everyone</span>
	<span><kbd>Click</kbd> a lit spot to build there</span>
</div>

<style>
	.ways {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 10px;
		margin-bottom: 4px;
	}
	.way {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 3px;
		padding: 12px 8px;
		background: rgba(255, 250, 235, 0.55);
		box-shadow: inset 0 0 0 2px rgba(138, 98, 54, 0.3);
	}
	.way img {
		width: 34px;
		height: 34px;
	}
	.way .caption {
		margin-top: 0;
		font-weight: 400;
		line-height: 1.3;
	}
	.controls {
		gap: 8px 24px;
		font-size: 14.5px;
	}
	@media (max-width: 760px) {
		.ways {
			grid-template-columns: 1fr;
		}
	}
</style>
