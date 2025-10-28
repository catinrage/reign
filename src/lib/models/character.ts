/**
 * Each character in the game has unique traits and behaviors.
 * This module defines the base Character class and specific character implementations.
 * Characters trains are defined in the hooks, allowing for easy extension.
 */

export type BaseCharacterProps<T extends string> = {
	name: T;
};

export abstract class BaseCharacter<T extends CharacterName = CharacterName> {
	public readonly name: T;

	constructor(props: BaseCharacterProps<T>) {
		this.name = props.name;
	}

	public onGameStart() {}

	public onTurnStart() {}

	public onTurnEnd() {}
}

export class CharacterGreedy extends BaseCharacter<'Greedy'> {
	constructor() {
		super({ name: 'Greedy' });
	}
}

export class CharacterWarrior extends BaseCharacter<'Warrior'> {
	constructor() {
		super({ name: 'Warrior' });
	}
}

export class CharacterExplorer extends BaseCharacter<'Explorer'> {
	constructor() {
		super({ name: 'Explorer' });
	}
}

export class CharacterDiplomat extends BaseCharacter<'Diplomat'> {
	constructor() {
		super({ name: 'Diplomat' });
	}
}

export class CharacterMerchant extends BaseCharacter<'Merchant'> {
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
