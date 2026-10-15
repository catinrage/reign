<script lang="ts">
	import { t } from '../../i18n/index.svelte';
	import { PIXEL } from '../pixel';
	import { type GameInfo, GAMES, gameTheme } from './games';

	/** The game picked, on a banner at the top of the main menu's sign; it opens the game shelf. */
	let { game, onopen }: { game: GameInfo; onopen: () => void } = $props();
</script>

<button
	class="banner"
	style={gameTheme(game)}
	onclick={onopen}
	aria-haspopup="dialog"
	aria-label={t('Game: {game}. Choose another game', { game: t(game.name) })}
	title={t('Choose another game')}
>
	<span class="medal"><img class="icon-px" src={game.icon} alt="" /></span>
	<span class="words">
		<span class="label">{t('Game')}</span>
		<b>{t(game.name)}</b>
		<small>{t('{min}–{max} players', { min: game.players[0], max: game.players[1] })}</small>
	</span>
	<span class="change btn wood small" aria-hidden="true">
		<img src={PIXEL.trade} alt="" />
		<span class="stack">{t('Change')}<span class="count">{t('{n, plural, one {# game} other {# games}}', { n: GAMES.length })}</span></span>
	</span>
</button>

<style>
	.banner {
		all: unset;
		position: relative;
		box-sizing: border-box;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 10px 8px 8px;
		cursor: pointer;
		overflow: hidden;
		/* The game's colors, with a weave of its light over them. */
		background:
			repeating-linear-gradient(135deg, transparent 0 9px, color-mix(in srgb, var(--glow) 9%, transparent) 9px 11px),
			linear-gradient(160deg, var(--top), var(--bottom));
		box-shadow:
			inset 0 0 0 2px #1e0e06,
			inset 0 0 0 4px color-mix(in srgb, var(--glow) 55%, #ffd45a),
			inset 0 6px 14px rgba(255, 255, 255, 0.12),
			0 4px 0 rgba(0, 0, 0, 0.4);
		transition:
			transform 0.12s,
			filter 0.15s;
	}
	/* A sheen that sweeps across now and then, so the banner reads as something to press. */
	.banner::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(100deg, transparent 35%, rgba(255, 255, 255, 0.16) 50%, transparent 65%);
		transform: translateX(-120%);
		animation: sheen 6s ease-in-out 1.2s infinite;
		pointer-events: none;
	}
	.banner:hover {
		filter: brightness(1.08);
		transform: translateY(-1px);
	}
	.banner:active {
		transform: translateY(2px);
	}
	.banner:focus-visible {
		outline: 3px solid var(--gold);
		outline-offset: 2px;
	}
	.medal {
		flex: none;
		width: 50px;
		height: 50px;
		display: grid;
		place-items: center;
		border-radius: 50%;
		background: radial-gradient(circle at 40% 35%, color-mix(in srgb, var(--glow) 45%, #fff6dc), color-mix(in srgb, var(--top) 70%, #1e0e06));
		box-shadow:
			0 0 0 3px #1e0e06,
			0 0 0 5px var(--gold-2),
			0 0 18px color-mix(in srgb, var(--glow) 60%, transparent);
	}
	.medal img {
		width: 32px;
		height: 32px;
		filter: drop-shadow(0 2px 0 rgba(0, 0, 0, 0.45));
	}
	.words {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		line-height: 1.05;
	}
	.label {
		font-family: var(--px);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: color-mix(in srgb, var(--glow) 60%, #fff2d2);
		text-shadow: 0 1px 0 rgba(0, 0, 0, 0.6);
	}
	.words b {
		font-family: var(--px);
		font-size: 24px;
		color: #fff2d2;
		text-shadow:
			0 2px 0 rgba(0, 0, 0, 0.55),
			0 0 12px color-mix(in srgb, var(--glow) 40%, transparent);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.words small {
		margin-top: 2px;
		font-size: 12px;
		font-weight: 700;
		color: rgba(255, 242, 210, 0.82);
		text-shadow: 0 1px 0 rgba(0, 0, 0, 0.6);
	}
	.change {
		flex: none;
		pointer-events: none;
		padding: 0 8px;
		min-height: 40px;
	}
	.change img {
		height: 18px;
	}
	.change .stack {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		line-height: 1;
	}
	.change .count {
		font-family: var(--body);
		font-size: 10px;
		opacity: 0.8;
	}
	.banner:hover .change {
		filter: brightness(1.12);
	}
	@keyframes sheen {
		0%,
		70% {
			transform: translateX(-120%);
		}
		100% {
			transform: translateX(120%);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.banner::after {
			animation: none;
		}
	}
</style>
