import { Entity } from './entity';
import type { Tile } from './tile';

export type PieceProps<T extends string> = {
	name: T;
	location: Tile;
	model: string;
};

export abstract class Piece<T extends PieceName = PieceName> extends Entity {
	public readonly name: T;
	public readonly model: string;
	private _location: Tile;

	constructor(props: PieceProps<T>) {
		super();
		this.name = props.name;
		this.model = props.model;
		this._location = props.location;
	}

	public get location() {
		return this._location;
	}

	public set location(tile: Tile) {
		this._location = tile;
	}
}

export class PieceThief extends Piece<'Thief'> {
	constructor(location: Tile) {
		super({ name: 'Thief', location, model: '/assets/models/thief.glb' });
	}
}

export type PieceType = PieceThief;
export type PieceName = PieceType['name'];
