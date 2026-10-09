import type { EventCard } from '../../../shared/rules/events';

/** What the Events deck shows at the table, shared by the corner chip and the dialogs. */
class EventUi {
	/** The card held up in the middle of the table: turning over (`flip`), or looked at again. */
	shown = $state<{ card: EventCard; by?: number; seq: number; flip: boolean } | null>(null);
	/** The Bountiful Year's dialog, and whether its player closed it (the chip opens it again). */
	bountyOpen = $state(false);
	bountyDismissed = $state(false);
}
export const eventUi = new EventUi();
