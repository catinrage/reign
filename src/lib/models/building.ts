import type { TileCoordination } from '$lib/types';
import type { Player } from './player';

export type BuildingProps<T extends string, L = unknown> = {
	name: T;
	owner: Player;
	model: string;
	location: L;
};

/**
 * There might be a problem, we could have multiple buildings on the same vertex/edge, as a vertex coordination is shared between multiple tiles,
 * so we could address a single vertex from perspective of different tiles. To solve this, we should have a rule over which tile "owns" the vertex/edge.
 * For now, we will assume that the tile with the lowest coordinates (q, r) will own the vertex/edge.
 */
export type VertexCoordination = {
	tile: TileCoordination;
	vertexIndex: number;
};

/**
 * Same problem as VertexCoordination applies here.
 */
export type EdgeCoordination = {
	tile: TileCoordination;
	edgeIndex: number;
};

export class Building<
	T extends BuildingName = BuildingName,
	L = VertexCoordination | EdgeCoordination
> {
	public readonly name: T;
	public readonly owner: Player;
	public readonly model: string;
	public readonly location: L;

	constructor(props: BuildingProps<T, L>) {
		this.name = props.name;
		this.owner = props.owner;
		this.model = props.model;
		this.location = props.location;
	}
}

export class BuildingSettlement extends Building<'Settlement', VertexCoordination> {
	constructor(props: Omit<BuildingProps<'Settlement', VertexCoordination>, 'name' | 'model'>) {
		super({ ...props, name: 'Settlement', model: '/assets/meshes/city.glb' });
	}
}

export class BuildingCity extends Building<'City', VertexCoordination> {
	constructor(props: Omit<BuildingProps<'City', VertexCoordination>, 'name' | 'model'>) {
		super({ ...props, name: 'City', model: '/assets/meshes/city.glb' });
	}
}

export class BuildingFortress extends Building<'Fortress', VertexCoordination> {
	constructor(props: Omit<BuildingProps<'Fortress', VertexCoordination>, 'name' | 'model'>) {
		super({ ...props, name: 'Fortress', model: '/assets/meshes/city.glb' });
	}
}

export class BuildingRoad extends Building<'Road', EdgeCoordination> {
	constructor(props: Omit<BuildingProps<'Road', EdgeCoordination>, 'name' | 'model'>) {
		super({ ...props, name: 'Road', model: '/assets/meshes/city.glb' });
	}
}

export type BuildingType = BuildingSettlement | BuildingCity | BuildingFortress | BuildingRoad;
export type BuildingName = BuildingType['name'];
