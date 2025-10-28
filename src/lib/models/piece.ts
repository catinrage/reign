import { Entity } from './entity';
import type { BaseTile } from './tile';

export type BasePieceProps<T extends string> = {
	name: T;
	location: BaseTile;
	model: string;
};

export type PieceProps = Omit<BasePieceProps<PieceName>, 'name' | 'model'>;

export abstract class BasePiece<T extends PieceName = PieceName> extends Entity {
	public readonly name: T;
	public readonly model: string;
	private _location: BaseTile;

	constructor(props: BasePieceProps<T>) {
		super();
		this.name = props.name;
		this.model = props.model;
		this._location = props.location;
	}

	public get location() {
		return this._location;
	}

	public set location(tile: BaseTile) {
		this._location = tile;
	}
}

export class PieceThief extends BasePiece<'Thief'> {
	constructor(props: PieceProps) {
		super({ ...props, name: 'Thief', model: '/assets/models/thief.glb' });
	}
}

export type PieceType = PieceThief;
export type PieceName = PieceType['name'];
