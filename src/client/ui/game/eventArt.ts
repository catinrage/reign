import type { EventCard, EventTone } from '../../../shared/rules/events';
import { svg } from '../pixel';

/** A pixel picture for each event card, drawn like the rest of the interface's icons. */

const k = '#2a1a10';

export const EVENT_ART: Record<EventCard, string> = {
	harvestFestival: svg(
		[
			'................',
			'..k...k...k.....',
			'.kyk.kyk.kyk....',
			'.kyk.kyk.kyk..k.',
			'..kyk.kyk.kyk.kyk',
			'...kyk.kykkyk.kyk',
			'....kykkyykyk.k.',
			'.....kyyyyyk....',
			'......kyyyk.....',
			'......krrrk.....',
			'.....krrrrrk....',
			'......kyyyk.....',
			'.....kyk.kyk....',
			'....kyk...kyk...',
			'...kk.......kk..',
			'................'
		].map((r) => r.slice(0, 16)),
		{ k, y: '#f2c14e', r: '#c2372b' }
	),
	bountifulYear: svg(
		[
			'................',
			'....kk..kk......',
			'...krrkkggk.....',
			'...krrkggk.kk...',
			'..kkkkkkkkkyyk..',
			'.kwwwwwwwwwkyk..',
			'.kbbbbbbbbbbkk..',
			'.kbBbbBbbBbbk...',
			'.kbbbbbbbbbbk...',
			'.kbBbbBbbBbbk...',
			'..kbbbbbbbbk....',
			'..kbBbbBbbBk....',
			'...kbbbbbbk.....',
			'....kkkkkk......',
			'................',
			'................'
		],
		{ k, r: '#d9693e', g: '#4f8f35', y: '#f6cb4a', w: '#a9adb6', b: '#a0662f', B: '#7a4a20' }
	),
	travelingFair: svg(
		[
			'.......k........',
			'......kyk.......',
			'.......k........',
			'......krk.......',
			'.....krwrk......',
			'....krwrwrk.....',
			'...krwrwrwrk....',
			'..krwrwrwrwrk...',
			'.kkkkkkkkkkkkk..',
			'..kwrwkkkwrwk...',
			'..krwrkddkrwk...',
			'..kwrwkddkwrk...',
			'..krwrkddkrwk...',
			'..kkkkkkkkkkk...',
			'................',
			'................'
		],
		{ k, r: '#c2372b', w: '#f0dcc0', y: '#f2c14e', d: '#3a2416' }
	),
	migratingHerds: svg(
		[
			'................',
			'................',
			'....kkkkk.......',
			'...kwwwwwk......',
			'..kwwwwwwwkkk...',
			'.kwwwwwwwwkddk..',
			'.kwwwwwwwwkdedk.',
			'.kwwwwwwwwkdddk.',
			'..kwwwwwwwkkkk..',
			'...kkkkkkkk.....',
			'...kd.kd.kd.kd..',
			'...kd.kd.kd.kd..',
			'...kk.kk.kk.kk..',
			'................',
			'..g...g....g..g.',
			'.ggg.ggg..ggg.gg'
		],
		{ k, w: '#f4f1e8', d: '#3a2b22', e: '#ffffff', g: '#6fa83a' }
	),
	royalWedding: svg(
		[
			'................',
			'..kk.kk...kk.kk.',
			'.kppkppk.kppkppk',
			'.kpppppk.kpppppk',
			'..kpppk...kpppk.',
			'...kpk.....kpk..',
			'....k.......k...',
			'................',
			'...kkkk..kkkk...',
			'..kyyyyk.kyyyyk.',
			'.kyk..kykyk..kyk',
			'.kyk..kykyk..kyk',
			'.kyk..kykyk..kyk',
			'..kyyyyk.kyyyyk.',
			'...kkkk..kkkk...',
			'................'
		],
		{ k, p: '#e55a8a', y: '#f2c14e' }
	),
	royalDecree: svg(
		[
			'................',
			'..kkkkkkkkkkk...',
			'.kwwwwwwwwwwwk..',
			'..kkkkkkkkkkwk..',
			'...kwwwwwwwkwk..',
			'...kwkkkkwwkk...',
			'...kwwwwwwwk....',
			'...kwkkkkkwk....',
			'...kwwwwwwwk....',
			'...kwkkkwrrk....',
			'...kwwwwrrrrk...',
			'..kkkkkkrrrrk...',
			'.kwwwwwwkrrk....',
			'..kkkkkkkrrk....',
			'.........kk.....',
			'................'
		],
		{ k, w: '#f6e3bd', r: '#c2372b' }
	),
	comet: svg(
		[
			'................',
			'..........kk....',
			'.........kyyk...',
			'........kywwyk..',
			'.......kywwwyk..',
			'......koywwyk...',
			'.....kooyyyk....',
			'....koooykk.....',
			'...koook........',
			'..kook..........',
			'.kok............',
			'.kk.............',
			'............w...',
			'...w...........w',
			'.......w........',
			'................'
		],
		{ k, y: '#ffd86b', w: '#fff6e0', o: '#f08a3a' }
	),
	earthquake: svg(
		[
			'................',
			'................',
			'.......k........',
			'......kk........',
			'.....k.k...k....',
			'..........kk....',
			'................',
			'kkkkkkkkkkkkkkkk',
			'gggggkgggggggggg',
			'ddddkdkddddkdddd',
			'dddkdddkdddkkddd',
			'ddkdddddkkkddkdd',
			'dkddddddddddddkd',
			'kdddddddddddddd.',
			'dddddddddddddddd',
			'................'
		],
		{ k, g: '#6fa83a', d: '#a0662f' }
	),
	tournament: svg(
		[
			'................',
			'..kkkkkkkkkkkk..',
			'.kyykyyyyyykyyk.',
			'.kykkyyyyyykkyk.',
			'.kyk.kyyyyk.kyk.',
			'..kk.kyyyyk.kk..',
			'.....kyyyyk.....',
			'......kyyk......',
			'.......kk.......',
			'.......yy.......',
			'......kyyk......',
			'.....kkkkkk.....',
			'....kyyyyyyk....',
			'....kkkkkkkk....',
			'................',
			'................'
		],
		{ k, y: '#f2c14e' }
	),
	stormAtSea: svg(
		[
			'................',
			'.....kkkkk......',
			'...kkggggGkkk...',
			'..kgggggggggGk..',
			'.kgggggggggggGk.',
			'.kkkkkkykkkkkkk.',
			'......kyk.......',
			'.....kyk........',
			'....kyyyyk......',
			'......kyk.......',
			'.....kyk........',
			'.....kk.........',
			'.bb...bb...bb...',
			'bBBb.bBBb.bBBb.b',
			'BBBBbBBBBbBBBBbB',
			'................'
		],
		{ k, g: '#6f737c', G: '#a9adb6', y: '#ffe36b', b: '#7aa6c9', B: '#3f6a8f' }
	),
	plagueOfRats: svg(
		[
			'................',
			'................',
			'................',
			'.....kkkk.......',
			'..kkkggggkk.....',
			'.kpkggggggkk....',
			'.kkgggggggggk...',
			'kgegggggggggk...',
			'kgggggggggggk...',
			'.kpkgggggggk.kk.',
			'..kkkkkkkkk.kppk',
			'....kpk.kpk.kk.k',
			'.............kpk',
			'..............k.',
			'................',
			'................'
		],
		{ k, g: '#7d7f87', p: '#e59aa8', e: '#ffffff' }
	),
	taxCollector: svg(
		[
			'................',
			'......kkkk......',
			'.....kbbbbk.....',
			'......kbbk......',
			'.....kkkkkk.....',
			'....kbbbbbbk....',
			'...kbbbbbbbbk...',
			'..kbbbkyykbbbk..',
			'..kbbkykkkbbbk..',
			'..kbbbkyykbbbk..',
			'..kbbbbkkykbbk..',
			'..kbbbkyykbbbk..',
			'...kbbbkkbbbk...',
			'....kkkkkkkk....',
			'................',
			'................'
		],
		{ k, b: '#a0662f', y: '#f2c14e' }
	),
	banditUprising: svg(
		[
			'................',
			'.....kkkkkk.....',
			'....kddddddk....',
			'...kddddddddk...',
			'..kkkkkkkkkkkk..',
			'..kssssssssssk..',
			'..kskkskkskksk..',
			'..kswwskkswwsk..',
			'..kssssssssssk..',
			'...kssskkssk....',
			'...krrrrrrrk....',
			'..krrrrrrrrrk...',
			'..krrrrrrrrrk...',
			'...kkkkkkkkk....',
			'................',
			'................'
		],
		{ k, d: '#3a2416', s: '#e0a77a', w: '#fff6e0', r: '#5a3a5f' }
	)
};

/** Each tone colors its card's frame. */
export const TONE_COLOR: Record<EventTone, string> = {
	good: '#6fa83a',
	catchUp: '#e59a2a',
	chaos: '#8b5fc9',
	rivalry: '#3f86c9',
	harsh: '#c2372b'
};
