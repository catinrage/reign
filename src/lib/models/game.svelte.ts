import { getContext, setContext } from 'svelte';
import type { Piece } from './piece';
import type { Player } from './player';
import { Terrain } from './terrain';
import type { Tile } from './tile';

export enum GameStateEnum {
	NOT_STARTED = 'NOT_STARTED',
	IN_PROGRESS = 'IN_PROGRESS',
	COMPLETED = 'COMPLETED'
}

export class Game {
	private _players: Player[] = $state([]);
	private _terrain: Terrain = $state(new Terrain());
	private _pieces: Piece[] = $state([]);
	private _state: GameStateEnum = $state(GameStateEnum.NOT_STARTED);

	public init() {
		this.terrain.generate();
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

	public addPiece(piece: Piece) {
		this.pieces.push(piece);
	}

	public getPiecesInTile(tile: Tile) {
		return this.pieces.filter((piece) => piece.location === tile);
	}
}

const CONTEXT_KEY = Symbol('game');

export function setGame() {
	return setContext(CONTEXT_KEY, new Game());
}

export function getGame() {
	return getContext<Game>(CONTEXT_KEY);
}
