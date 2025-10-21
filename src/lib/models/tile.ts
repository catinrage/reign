import {
	ResourceWood,
	ResourceBrick,
	ResourceSheep,
	ResourceStone,
	ResourceWheat,
	type ResourceType
} from './resource';
import desertTexture from '$lib/assets/images/tiles/desert.png';
import forestTexture from '$lib/assets/images/tiles/forest.png';
import hillTexture from '$lib/assets/images/tiles/hill.png';
import mountainTexture from '$lib/assets/images/tiles/mountain.png';
import pastureTexture from '$lib/assets/images/tiles/pasture.png';
import fieldTexture from '$lib/assets/images/tiles/field.png';
import { Entity } from './entity';
import type { TileCoordination } from '$lib/types';

export type TileProps<T extends string> = {
	name: T;
	number: number;
	image: string;
	position: TileCoordination;
	textureScale?: number;
};

export abstract class Tile<T extends string = TileName> extends Entity {
	public readonly name: T;
	public readonly number: number;
	public readonly image: string;
	public readonly position: TileCoordination;
	public readonly textureScale: number;

	constructor(props: TileProps<T>) {
		super();
		this.name = props.name;
		this.number = props.number;
		this.image = props.image;
		this.position = props.position;
		this.textureScale = props.textureScale ?? 0.8;
	}

	// return the resource class/constructor (not an instance)
	abstract get resource(): (new (...args: any[]) => ResourceType) | null;
}

export class TileDesert extends Tile<'Desert'> {
	constructor(props: Pick<TileProps<'Desert'>, 'position'>) {
		super({ ...props, image: desertTexture, number: 0, name: 'Desert', textureScale: 0.74 });
	}

	get resource() {
		return null;
	}
}

export class TileForest extends Tile<'Forest'> {
	constructor(props: Pick<TileProps<'Forest'>, 'number' | 'position'>) {
		super({ ...props, image: forestTexture, name: 'Forest', textureScale: 0.8 });
	}

	get resource() {
		return ResourceWood;
	}
}

export class TileHill extends Tile<'Hill'> {
	constructor(props: Pick<TileProps<'Hill'>, 'number' | 'position'>) {
		super({ ...props, image: hillTexture, name: 'Hill', textureScale: 0.8 });
	}

	get resource() {
		return ResourceBrick;
	}
}

export class TileMountain extends Tile<'Mountain'> {
	constructor(props: Pick<TileProps<'Mountain'>, 'number' | 'position'>) {
		super({ ...props, image: mountainTexture, name: 'Mountain', textureScale: 0.78 });
	}

	get resource() {
		return ResourceStone;
	}
}

export class TilePasture extends Tile<'Pasture'> {
	constructor(props: Pick<TileProps<'Pasture'>, 'number' | 'position'>) {
		super({ ...props, image: pastureTexture, name: 'Pasture', textureScale: 0.8 });
	}

	get resource() {
		return ResourceSheep;
	}
}

export class TileField extends Tile<'Field'> {
	constructor(props: Pick<TileProps<'Field'>, 'number' | 'position'>) {
		super({ ...props, image: fieldTexture, name: 'Field', textureScale: 0.8 });
	}

	get resource() {
		return ResourceWheat;
	}
}

export type TileType = TileDesert | TileForest | TileHill | TileMountain | TilePasture | TileField;
export type TileName = TileType['name'];
