<script lang="ts">
	import { MAP_PRESETS, presetById } from '../../../shared/board/maps';
	import { POINT_GOALS, POINTS_MIN, maxPointsFor, suggestedPoints } from '../../../shared/rules/modes';
	import { client } from '../../state/client.svelte';
	import { t } from '../../i18n/index.svelte';

	/**
	 * The lobby's points to win, in either mode: quick picks or any number up to what the island
	 * and table can reach. Classic counts the standard 19-tile island.
	 */

	const lobby = $derived(client.lobby!);
	const settings = $derived(lobby.settings);
	const tiles = $derived.by(() => {
		if (settings.mode !== 'extended') return MAP_PRESETS[0].tiles.length;
		const map = settings.map;
		return ('preset' in map ? presetById(map.preset)?.tiles : map.custom.tiles)?.length ?? 0;
	});
	// Island size, players and points go together: a small island with a big table can't
	// reach a big goal, so the server caps it and the picks above the cap are greyed out.
	const pointsCap = $derived(maxPointsFor(tiles, lobby.seats.length));
	const pointsTip = $derived(
		t('{tiles, plural, one {# tile} other {# tiles}} and {players, plural, one {# player} other {# players}}: about {suggested} plays well, {max} at most', {
			tiles,
			players: lobby.seats.length,
			suggested: suggestedPoints(tiles, lobby.seats.length),
			max: pointsCap
		})
	);

	/** Any whole number of points in range; anything else snaps back to the current goal. */
	function otherGoal(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const n = Math.round(Number(input.value));
		if (input.value.trim() && Number.isFinite(n)) {
			const points = Math.max(POINTS_MIN, Math.min(pointsCap, n));
			client.send({ t: 'setPointsToWin', points });
			if (points !== n) input.value = String(points);
		} else {
			input.value = POINT_GOALS.includes(settings.pointsToWin) ? '' : String(settings.pointsToWin);
		}
	}
</script>

<div class="goal">
	<span class="goal-head">
		<span class="label">{t('Points to win')}</span>
		<span class="cap" title={pointsTip}>{t('At most {max} here', { max: pointsCap })}</span>
	</span>
	{#if client.isHost}
		<div class="seg">
			{#each POINT_GOALS as g (g)}
				<button
					class="btn small"
					class:on={settings.pointsToWin === g}
					disabled={g > pointsCap}
					title={g > pointsCap ? t('Too many for this island: {why}.', { why: pointsTip }) : undefined}
					onclick={() => client.send({ t: 'setPointsToWin', points: g })}>{g}</button
				>
			{/each}
			<input
				class="input other"
				class:on={!POINT_GOALS.includes(settings.pointsToWin)}
				type="number"
				inputmode="numeric"
				min={POINTS_MIN}
				max={pointsCap}
				placeholder={t('Other')}
				aria-label={t('Other points to win, {min} to {max}', { min: POINTS_MIN, max: pointsCap })}
				title={t('Any number from {min} to {max}. {why}.', { min: POINTS_MIN, max: pointsCap, why: pointsTip })}
				value={POINT_GOALS.includes(settings.pointsToWin) ? '' : settings.pointsToWin}
				onchange={otherGoal}
				onkeydown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
			/>
		</div>
	{:else}
		<span class="chosen">{settings.pointsToWin}</span>
	{/if}
</div>

<style>
	.goal {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}
	.goal-head {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.cap {
		font-size: 12px;
		color: var(--muted);
		white-space: nowrap;
	}
	.chosen {
		font-family: var(--px);
		font-weight: 700;
		font-size: 15px;
		color: #fff2d2;
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
	}
	.seg {
		display: flex;
		gap: 4px;
		align-items: center;
	}
	.seg .btn {
		min-width: 44px;
	}
	.other {
		width: 66px;
		height: calc(var(--s) * 11);
		padding: 0 2px;
		box-sizing: border-box;
		text-align: center;
		font-family: var(--px);
		font-weight: 700;
		font-size: 14px;
		-moz-appearance: textfield;
		appearance: textfield;
	}
	.other::-webkit-inner-spin-button,
	.other::-webkit-outer-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}
	.other::placeholder {
		font-size: 12px;
	}
	.other.on {
		outline: 3px solid #ffd45a;
		outline-offset: 0;
	}
	/* Phones: the points buttons drop under their label rather than past the frame. */
	@media (max-width: 520px) {
		.goal {
			flex-wrap: wrap;
		}
	}
</style>
