import {
	Tile,
	TileDesert,
	TileField,
	TileForest,
	TileHill,
	TileMountain,
	TilePasture,
	type TileName
} from './tile';

export class Terrain {
	private _tiles: Tile[] = [];

	constructor(tiles?: Tile[]) {
		this._tiles = tiles || [];
	}

	generate() {
		const generatedTiles: Tile[] = [];
		let numberOfWoodsToAdd = 4;
		let numberOfHillsToAdd = 3;
		let numberOfFieldsToAdd = 4;
		let numberOfMountainsToAdd = 3;
		let numberOfPasturesToAdd = 4;
		let numberOfDesertsToAdd = 1;
		let listOfTileNumbers: number[] = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];

		// lets travers each tile with r and q coordinates
		for (let r = -2; r <= 2; r++) {
			for (let q = -2; q <= 2; q++) {
				if (Math.abs(r + q) > 2) continue; // skip invalid tiles

				const possibleTileTypes: TileName[] = [];

				if (numberOfWoodsToAdd > 0) possibleTileTypes.push('Forest');
				if (numberOfHillsToAdd > 0) possibleTileTypes.push('Hill');
				if (numberOfFieldsToAdd > 0) possibleTileTypes.push('Field');
				if (numberOfMountainsToAdd > 0) possibleTileTypes.push('Mountain');
				if (numberOfPasturesToAdd > 0) possibleTileTypes.push('Pasture');
				if (numberOfDesertsToAdd > 0) possibleTileTypes.push('Desert');

				const randomIndex = Math.floor(Math.random() * possibleTileTypes.length);
				const selectedTileType = possibleTileTypes[randomIndex];
				const tileNumberIndex = Math.floor(Math.random() * listOfTileNumbers.length);
				let tileNumber: number | undefined;

				if (selectedTileType !== 'Desert') {
					tileNumber = listOfTileNumbers[tileNumberIndex];
					listOfTileNumbers.splice(tileNumberIndex, 1); // remove the used number
				}

				switch (selectedTileType) {
					case 'Forest': {
						const tile = new TileForest({ number: tileNumber!, position: { r, q } });
						generatedTiles.push(tile);
						numberOfWoodsToAdd--;
						break;
					}
					case 'Hill': {
						const tile = new TileHill({ number: tileNumber!, position: { r, q } });
						generatedTiles.push(tile);
						numberOfHillsToAdd--;
						break;
					}
					case 'Mountain': {
						const tile = new TileMountain({ number: tileNumber!, position: { r, q } });
						generatedTiles.push(tile);
						numberOfMountainsToAdd--;
						break;
					}
					case 'Pasture': {
						const tile = new TilePasture({ number: tileNumber!, position: { r, q } });
						generatedTiles.push(tile);
						numberOfPasturesToAdd--;
						break;
					}
					case 'Field': {
						const tile = new TileField({ number: tileNumber!, position: { r, q } });
						generatedTiles.push(tile);
						numberOfFieldsToAdd--;
						break;
					}
					case 'Desert': {
						const tile = new TileDesert({ position: { r, q } });
						generatedTiles.push(tile);
						numberOfDesertsToAdd--;
						break;
					}
				}
			}
		}

		this._tiles = generatedTiles;
	}

	public get tiles(): Tile[] {
		return this._tiles;
	}
}
