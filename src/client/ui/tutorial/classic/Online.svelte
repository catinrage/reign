<script lang="ts">
	import { MIN_PLAYERS } from '../../../../shared/protocol';
	import { msg, t } from '../../../i18n/index.svelte';
	import Rich from '../../../i18n/Rich.svelte';
	import { PIXEL } from '../../pixel';

	// name and text are marked with msg() and shown through t().
	const ways = [
		{ icon: PIXEL.play, name: msg('Play vs bots'), text: msg('Starts at once against three bots.') },
		{
			icon: PIXEL.house,
			name: msg('Create a room'),
			text: msg('Opens a table with a five-letter code to share.')
		},
		{
			icon: PIXEL.letter,
			name: msg('Join a friend'),
			text: msg('Type their code on the main menu, or open their invite link.')
		}
	];
</script>

{#snippet host()}<b>{t('host')}</b>{/snippet}
{#snippet ready()}<b>{t('I am ready')}</b>{/snippet}
{#snippet pause()}<b>{t('Pause for everyone')}</b>{/snippet}
{#snippet autoRoll()}<b>{t('Auto roll')}</b>{/snippet}
{#snippet rejoin()}<b>{t('Rejoin game')}</b>{/snippet}
{#snippet kbdP()}<kbd>P</kbd>{/snippet}
{#snippet kbdEsc()}<kbd>Esc</kbd>{/snippet}
{#snippet kbdDrag()}<kbd>{t('Drag')}</kbd>{/snippet}
{#snippet kbdRightDrag()}<kbd>{t('Right drag')}</kbd>{/snippet}
{#snippet kbdWheel()}<kbd>{t('Wheel')}</kbd>{/snippet}
{#snippet kbdClick()}<kbd>{t('Click')}</kbd>{/snippet}

<div class="ways">
	{#each ways as w (w.name)}
		<div class="way">
			<img class="icon-px" src={w.icon} alt="" />
			<b>{t(w.name)}</b>
			<span class="caption">{t(w.text)}</span>
		</div>
	{/each}
</div>

<h3>{t('In the room')}</h3>
<ul class="rows">
	<li>
		<img class="icon-px" src={PIXEL.crown} alt="" /><span
			><Rich
				text={t(
					'The player who made the room is the {host}. The host picks the mode and the turn timer, and can add or remove bots.'
				)}
				slots={{ host }}
			/></span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.bot} alt="" /><span
			>{t(
				"A game needs at least {n, plural, one {# player} other {# players}}. Bots fill any seat a friend isn't using.",
				{ n: MIN_PLAYERS }
			)}</span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.shieldIcon} alt="" /><span>{t('Everyone picks a banner color.')}</span>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.check} alt="" /><span
			><Rich text={t('Guests press {ready}. The host can start once everyone is ready.')} slots={{ ready }} /></span
		>
	</li>
</ul>

<h3>{t('During the game')}</h3>
<ul class="rows">
	<li>
		<img class="icon-px" src={PIXEL.pause} alt="" /><span
			><Rich
				text={t('{pause} with the pause button or {key}. Anyone at the table can resume.')}
				slots={{ pause, key: kbdP }}
			/></span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.die} alt="" /><span
			><Rich
				text={t(
					"{autoRoll}, the die button in the corner, rolls your dice for you a moment after your turn starts. There's still time to play a Knight or a power first."
				)}
				slots={{ autoRoll }}
			/></span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.gear} alt="" /><span
			><Rich
				text={t(
					'The game menu ({key}) has this tutorial and the settings. In a game against bots, opening it also pauses the table.'
				)}
				slots={{ key: kbdEsc }}
			/></span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.door} alt="" /><span
			><Rich
				text={t(
					'If you leave, a bot plays your seat. While anyone is still playing, {rejoin} on the main menu takes you back. When every player has left, the game is cancelled.'
				)}
				slots={{ rejoin }}
			/></span
		>
	</li>
	<li>
		<img class="icon-px" src={PIXEL.chat} alt="" /><span
			>{t('The chronicle on the left lists every roll, trade and build as it happens.')}</span
		>
	</li>
</ul>

<h3>{t('Controls')}</h3>
<div class="cols controls">
	<span><Rich text={t('{key} turn the table')} slots={{ key: kbdDrag }} /></span>
	<span><Rich text={t('{key} or two fingers: pan')} slots={{ key: kbdRightDrag }} /></span>
	<span><Rich text={t('{key} or pinch: zoom')} slots={{ key: kbdWheel }} /></span>
	<span><Rich text={t('{key} cancel, or open the menu')} slots={{ key: kbdEsc }} /></span>
	<span><Rich text={t('{key} pause for everyone')} slots={{ key: kbdP }} /></span>
	<span><Rich text={t('{key} a lit spot to build there')} slots={{ key: kbdClick }} /></span>
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
