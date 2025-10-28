import type { TileCoordination } from '$lib/types';
import type { Player } from './player.svelte';

export type BaseBuildingProps<T extends BuildingName, L = BuildingLocation> = {
	name: T;
	owner: Player;
	model: string;
	modelZOffset?: number;
	modelScale?: number;
	location: L;
};

export type BuildingProps<T extends BuildingName, L = BuildingLocation> = Omit<
	BaseBuildingProps<T, L>,
	'name' | 'model' | 'modelZOffset' | 'modelScale'
>;

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

/**
 * A building can be located either on a vertex or an edge, this type represents both possibilities.
 */
export type BuildingLocation = VertexCoordination | EdgeCoordination;

export class BaseBuilding<T extends BuildingName = BuildingName, L = BuildingLocation> {
	public readonly name: T;
	public readonly owner: Player;
	public readonly model: string;
	public readonly modelZOffset?: number;
	public readonly modelScale?: number;
	public readonly location: L;

	constructor(props: BaseBuildingProps<T, L>) {
		this.name = props.name;
		this.owner = props.owner;
		this.model = props.model;
		this.modelZOffset = props.modelZOffset ?? 0;
		this.modelScale = props.modelScale ?? 1;
		this.location = props.location;
	}
}

export class BuildingSettlement extends BaseBuilding<'Settlement', VertexCoordination> {
	constructor(props: BuildingProps<'Settlement', VertexCoordination>) {
		super({
			...props,
			name: 'Settlement',
			model: '/assets/meshes/settlement.glb',
			modelZOffset: -0.48,
			modelScale: 0.4
		});
	}
}

export class BuildingCity extends BaseBuilding<'City', VertexCoordination> {
	constructor(props: BuildingProps<'City', VertexCoordination>) {
		super({ ...props, name: 'City', model: '/assets/meshes/city.glb', modelScale: 0.6 });
	}
}

export class BuildingFortress extends BaseBuilding<'Fortress', VertexCoordination> {
	constructor(props: BuildingProps<'Fortress', VertexCoordination>) {
		super({ ...props, name: 'Fortress', model: '/assets/meshes/city.glb', modelScale: 0.6 });
	}
}

export class BuildingRoad extends BaseBuilding<'Road', EdgeCoordination> {
	constructor(props: BuildingProps<'Road', EdgeCoordination>) {
		super({ ...props, name: 'Road', model: '/assets/meshes/road.glb', modelScale: 0.7 });
	}
}

export type BuildingType = BuildingSettlement | BuildingCity | BuildingFortress | BuildingRoad;
export type BuildingName = BuildingType['name'];
