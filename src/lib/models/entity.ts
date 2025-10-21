import { v4 as uuidv4 } from 'uuid';

export abstract class Entity {
	public readonly id: string = uuidv4();
}
