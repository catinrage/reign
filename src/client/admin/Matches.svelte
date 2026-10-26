<script lang="ts">
	import { onMount } from 'svelte';
	import type { AdminMatches } from '../../shared/admin';
	import { get } from './api';
	import MatchTable from './MatchTable.svelte';

	const PAGE = 50;
	let data = $state<AdminMatches | null>(null);
	let status = $state('');
	let offset = $state(0);
	let error = $state('');

	async function load() {
		try {
			data = await get<AdminMatches>(`matches?offset=${offset}${status ? `&status=${status}` : ''}`);
			error = '';
		} catch (e) {
			error = (e as Error).message;
		}
	}

	function page(by: number) {
		offset = Math.max(0, offset + by);
		void load();
	}

	onMount(load);
</script>

<div class="toolbar">
	<select
		bind:value={status}
		onchange={() => {
			offset = 0;
			void load();
		}}
	>
		<option value="">All games</option>
		<option value="playing">Playing now</option>
		<option value="finished">Finished</option>
		<option value="abandoned">Abandoned</option>
	</select>
	{#if data}
		<span class="muted">{data.total ? `${offset + 1}–${Math.min(offset + PAGE, data.total)} of ${data.total}` : 'None'}</span>
		<button disabled={offset === 0} onclick={() => page(-PAGE)}>← Newer</button>
		<button disabled={offset + PAGE >= data.total} onclick={() => page(PAGE)}>Older →</button>
	{/if}
</div>
{#if error}<p class="warn">{error}</p>{/if}
<div class="card">
	{#if data}<MatchTable matches={data.matches} />{:else}<p class="muted">Loading…</p>{/if}
</div>
<p class="muted">Games on the server with at least one signed-in player. Games of guests against bots aren't kept, only counted (see Overview).</p>
