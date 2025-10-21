/**
 * Each character in the game has unique traits and behaviors.
 * This module defines the base Character class and specific character implementations.
 * Characters trains are defined in the hooks, allowing for easy extension.
 */

export type CharacterProps<T extends string> = {
	name: T;
};

export abstract class Character<T extends string> {
	public readonly name: T;

	constructor(props: CharacterProps<T>) {
		this.name = props.name;
	}

	public onGameStart() {}

	public onTurnStart() {}

	public onTurnEnd() {}
}

export class CharacterGreedy extends Character<'Greedy'> {
	constructor() {
		super({ name: 'Greedy' });
	}
}

export class CharacterWarrior extends Character<'Warrior'> {
	constructor() {
		super({ name: 'Warrior' });
	}
}

export class CharacterExplorer extends Character<'Explorer'> {
	constructor() {
		super({ name: 'Explorer' });
	}
}

export class CharacterDiplomat extends Character<'Diplomat'> {
	constructor() {
		super({ name: 'Diplomat' });
	}
}

export class CharacterMerchant extends Character<'Merchant'> {
	constructor() {
		super({ name: 'Merchant' });
	}
}

export type CharacterType =
	| CharacterGreedy
	| CharacterWarrior
	| CharacterExplorer
	| CharacterDiplomat
	| CharacterMerchant;
export type CharacterName = CharacterType['name'];
