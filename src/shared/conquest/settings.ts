import { DEFAULT_CONQUEST_SETTINGS, type CardRule, type ConquestSettings, type DeployRule, type VictoryRule } from './types';

export const CARD_RULES: CardRule[] = ['escalating', 'fixed'];
export const VICTORY_RULES: VictoryRule[] = ['domination', 'majority', 'missions'];
export const DEPLOY_RULES: DeployRule[] = ['placed', 'random'];
/** The maps Conquest is played on. */
export const CONQUEST_MAPS = ['realm'];

/** Conquest settings from a client, each one checked: anything unknown keeps its default. */
export function cleanConquestSettings(s: Partial<ConquestSettings> | null | undefined): ConquestSettings {
	const d = DEFAULT_CONQUEST_SETTINGS;
	return {
		map: CONQUEST_MAPS.includes(s?.map as string) ? s!.map! : d.map,
		cards: CARD_RULES.includes(s?.cards as CardRule) ? s!.cards! : d.cards,
		victory: VICTORY_RULES.includes(s?.victory as VictoryRule) ? s!.victory! : d.victory,
		deploy: DEPLOY_RULES.includes(s?.deploy as DeployRule) ? s!.deploy! : d.deploy
	};
}
