import { randomMap, type RandomMapOptions } from '../../../shared/board/random';
import { randomSeed } from '../../../shared/rng';
import { client } from '../../state/client.svelte';

/** Grow a new random island with these options and put it on the table for everyone. */
export function generateIsland(options: Omit<RandomMapOptions, 'seed'>) {
	client.send({ t: 'setMap', map: { custom: randomMap({ ...options, seed: randomSeed() | 0 }) } });
}
