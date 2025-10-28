import {
	BaseBuilding,
	BuildingCity,
	BuildingRoad,
	BuildingSettlement,
	type BuildingName,
	type EdgeCoordination,
	type VertexCoordination
} from './building';
import type { BaseCharacter } from './character';
import { Entity } from './entity';
import type { ResourceName } from './resource';

export type PlayerProps = {
	color: string;
	name: string;
	character: BaseCharacter;
};

export class Player extends Entity {
	public readonly color: string;
	public readonly name: string;
	public readonly character: BaseCharacter;
	private _resources: Record<ResourceName, number> = $state({
		Brick: 0,
		Wood: 0,
		Sheep: 0,
		Wheat: 0,
		Stone: 0
	});
	private _buildings: BaseBuilding[] = $state([]);

	constructor(props: PlayerProps) {
		super();
		this.color = props.color;
		this.name = props.name;
		this.character = props.character;
	}

	public get resources() {
		return this._resources;
	}

	public get buildings(): BaseBuilding[] {
		return this._buildings;
	}

	/**
	 * Adds a building to the player's buildings.
	 * @param building The building to add.
	 */
	public build<T extends VertexCoordination | EdgeCoordination>(
		buildingName: BuildingName,
		location: T
	) {
		switch (buildingName) {
			case 'Road':
				this.buildings.push(
					new BuildingRoad({
						owner: this,
						location: location as EdgeCoordination
					})
				);
				break;
			case 'Settlement':
				this.buildings.push(
					new BuildingSettlement({
						owner: this,
						location: location as VertexCoordination
					})
				);
				break;
			case 'City':
				this.buildings.push(
					new BuildingCity({
						owner: this,
						location: location as VertexCoordination
					})
				);
				break;
			default:
				throw new Error(`Unknown building name: ${buildingName}`);
		}
	}

	/**
	 * Adds the specified amount of resource to the player's resources.
	 * @param resource The resource to add.
	 * @param amount The amount to add.
	 */
	public addResource(resource: ResourceName, amount: number) {
		this._resources[resource] += amount;
	}

	/**
	 * Removes the specified amount of resource from the player's resources.
	 * @param resource The resource to remove.
	 * @param amount The amount to remove.
	 */
	public removeResource(resource: ResourceName, amount: number) {
		this._resources[resource] = Math.max(0, this._resources[resource] - amount);
	}

	/**
	 * Checks if the player has at least the specified amount of resource.
	 * @param resource The resource to check.
	 * @param amount The amount to check.
	 * @returns True if the player has at least the specified amount of resource, false otherwise.
	 */
	public hasResource(resource: ResourceName, amount: number): boolean {
		return this._resources[resource] >= amount;
	}
}
