<script lang="ts">
	import type { Match } from '../../shared/accounts';
	import { duration, replayLink, when } from './api';

	let { matches, onuser }: { matches: Match[]; onuser?: (id: string) => void } = $props();

	const STATUS: Record<string, string> = { finished: 'Finished', abandoned: 'Abandoned', playing: 'Playing' };
</script>

<div class="scroll">
	<table>
		<thead>
			<tr><th>Started</th><th>Status</th><th>Mode</th><th>Players (points)</th><th class="num">Turns</th><th>Length</th><th>Replay</th></tr>
		</thead>
		<tbody>
			{#each matches as m (m.id)}
				<tr>
					<td>{when(m.startedAt)}<div class="muted small">#{m.id} · {m.code}</div></td>
					<td><span class="pill" class:good={m.status === 'finished'} class:bad={m.status === 'abandoned'}>{STATUS[m.status] ?? m.status}</span></td>
					<td>{m.mode === 'extended' ? 'Extended' : 'Classic'}<div class="muted small">{m.mapName} · to {m.pointsToWin}</div></td>
					<td>
						{#each [...m.players].sort((a, b) => (a.place ?? 99) - (b.place ?? 99)) as p, i (i)}
							<span class="player" class:win={p.place === 1}>
								{p.place === 1 ? '👑 ' : p.isBot ? '🤖 ' : ''}{#if p.user && onuser}<button class="link" onclick={() => onuser(p.user!.id)}
										>{p.user.nickname}</button
									>{:else}{p.name}{/if}
								<span class="muted">({p.points})</span>
							</span>
						{/each}
					</td>
					<td class="num">{m.turns}</td>
					<td>{duration(m.startedAt, m.endedAt)}</td>
					<td>
						{#if m.replay}<a href={replayLink(m.id)} target="_blank" rel="noopener">Watch</a>{:else}<span class="muted">—</span>{/if}
					</td>
				</tr>
			{:else}
				<tr><td colspan="7" class="muted">No games.</td></tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.small {
		font-size: 12px;
	}
	.player {
		display: inline-block;
		margin-right: 10px;
		white-space: nowrap;
	}
	.win {
		font-weight: 600;
	}
</style>
