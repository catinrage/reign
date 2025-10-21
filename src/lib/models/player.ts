import { Entity } from './entity';

export type PlayerProps = {
	color: string;
	name: string;
};

export class Player extends Entity {
	public readonly color: string;
	public readonly name: string;

	constructor(props: PlayerProps) {
		super();
		this.color = props.color;
		this.name = props.name;
	}
}
