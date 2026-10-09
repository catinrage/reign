import type { PigeonNote } from '../../../shared/protocol';
import { client } from '../../state/client.svelte';

/**
 * The pigeon post: private notes between two players. The loft (the corner button and its panel)
 * keeps what is open, which notes are still in the air and which have been read.
 */
class Loft {
	open = $state(false);
	/** The seat whose notes the loft shows and who a new note goes to. */
	to = $state<string | null>(null);
	/** Notes flying in that haven't landed yet: they are only read once the pigeon arrives. */
	flying = $state.raw<Set<number>>(new Set());
	/** The newest note read from each seat, kept per room so a reload remembers it. */
	read = $state.raw<Record<string, number>>({});
	/** The loft button, where incoming pigeons land. */
	button = $state<HTMLElement | null>(null);
	private readKey = '';

	/** The other people at the table (bots can't read, so they get no pigeons). */
	get people() {
		return (client.lobby?.seats ?? []).filter((s) => !s.isBot && s.id !== client.seat);
	}

	/** Landed notes between this player and seat `other`, oldest first. */
	notesWith(other: string): PigeonNote[] {
		return client.pigeons.filter(
			(n) => !this.flying.has(n.id) && (n.from === other || n.to === other)
		);
	}

	unreadFrom(other: string): number {
		const seen = this.read[other] ?? 0;
		return client.pigeons.filter((n) => n.from === other && n.id > seen && !this.flying.has(n.id))
			.length;
	}

	get unread(): number {
		return this.people.reduce((sum, s) => sum + this.unreadFrom(s.id), 0);
	}

	/** Everything landed from seat `other` has been read. */
	markRead(other: string) {
		const last = Math.max(0, ...this.notesWith(other).map((n) => (n.from === other ? n.id : 0)));
		if ((this.read[other] ?? 0) >= last) return;
		this.read = { ...this.read, [other]: last };
		try {
			localStorage.setItem(this.readKey, JSON.stringify(this.read));
		} catch {
			/* private mode */
		}
	}

	/** Load what was read at this table, when the room or the seat changes. */
	sync(code: string | null, seat: string | null) {
		const key = code && seat ? `reign:pigeons:${code}:${seat}` : '';
		if (key === this.readKey) return;
		this.readKey = key;
		let read: Record<string, number> = {};
		try {
			read = (key && JSON.parse(localStorage.getItem(key) ?? '{}')) || {};
		} catch {
			/* nothing saved */
		}
		this.read = read;
		this.flying = new Set();
		this.open = false;
		this.to = null;
	}

	takeOff(id: number) {
		this.flying = new Set([...this.flying, id]);
	}

	land(id: number) {
		if (!this.flying.has(id)) return;
		const next = new Set(this.flying);
		next.delete(id);
		this.flying = next;
	}
}

export const loft = new Loft();
