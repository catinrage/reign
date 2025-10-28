import { getContext, setContext } from 'svelte';
import { Terrain } from './terrain';
import type { BasePiece } from './piece';
import type { Player } from './player.svelte';
import type { BaseTile } from './tile';
import type { BaseBuilding } from './building';

export enum GameStateEnum {
	NOT_STARTED = 'NOT_STARTED',
	IN_PROGRESS = 'IN_PROGRESS',
	COMPLETED = 'COMPLETED'
}

export type GameProps = {
	players: Player[];
};

export class Game {
	private _terrain: Terrain = $state(new Terrain());
	private _players: Player[] = $state([]);
	private _pieces: BasePiece[] = $state([]);
	private _state: GameStateEnum = $state(GameStateEnum.NOT_STARTED);
	private _turn: number = $state(0);
	private _currentPlayerIndex: number = $state(0);
	private _currentPlayer = $derived(this._players[this._currentPlayerIndex]);

	public init(props: GameProps) {
		this.terrain.generate();
		this._players = props.players;
	}

	public get players() {
		return this._players;
	}

	public get terrain() {
		return this._terrain;
	}

	public get pieces() {
		return this._pieces;
	}

	public get buildings(): BaseBuilding[] {
		return this._players.flatMap((player) => player.buildings);
	}

	public addPiece(piece: BasePiece) {
		this.pieces.push(piece);
	}

	public getPiecesInTile(tile: BaseTile) {
		return this.pieces.filter((piece) => piece.location === tile);
	}

	public getBuildingsInTile(tile: BaseTile) {
		return this.buildings.filter((building) => {
			if (
				building.location.tile.q === tile.position.q &&
				building.location.tile.r === tile.position.r
			) {
				return true;
			}
		});
	}
}

const CONTEXT_KEY = Symbol('game');

export function setGame() {
	return setContext(CONTEXT_KEY, new Game());
}

export function getGame() {
	return getContext<Game>(CONTEXT_KEY);
}
