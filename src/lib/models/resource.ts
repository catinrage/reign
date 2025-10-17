import stoneTexture from '$lib/assets/textures/desert.png';
import woodTexture from '$lib/assets/textures/desert.png';
import sheepTexture from '$lib/assets/textures/desert.png';
import wheatTexture from '$lib/assets/textures/desert.png';
import brickTexture from '$lib/assets/textures/desert.png';

export type TextureSource = string;
export type ResourceProps<T extends string> = {
	name: T;
	image: TextureSource;
};

export class Resource<T extends string> {
	public readonly name: T;
	public readonly image: TextureSource;

	constructor(props: ResourceProps<T>) {
		this.name = props.name;
		this.image = props.image;
	}
}

export class ResourceStone extends Resource<'Stone'> {
	constructor() {
		super({ name: 'Stone', image: stoneTexture });
	}
}

export class ResourceWood extends Resource<'Wood'> {
	constructor() {
		super({ name: 'Wood', image: woodTexture });
	}
}

export class ResourceSheep extends Resource<'Sheep'> {
	constructor() {
		super({ name: 'Sheep', image: sheepTexture });
	}
}

export class ResourceWheat extends Resource<'Wheat'> {
	constructor() {
		super({ name: 'Wheat', image: wheatTexture });
	}
}

export class ResourceBrick extends Resource<'Brick'> {
	constructor() {
		super({ name: 'Brick', image: brickTexture });
	}
}

export type ResourceType =
	| ResourceStone
	| ResourceWood
	| ResourceSheep
	| ResourceWheat
	| ResourceBrick;
export type ResourceName = ResourceType['name'];
