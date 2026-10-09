import type { EventCard } from '../../../shared/rules/events';

/** What the Events deck shows at the table, shared by the corner chip and the dialogs. */
class EventUi {
	/**
	 * The card held up in the middle of the table: turning over (`flip`), looked at again, or the
	 * next card as your tavern's rumor has it (`rumor`, with the round it turns over in).
	 */
	shown = $state<{ card: EventCard; by?: number; round?: number; seq: number; flip: boolean; rumor?: boolean } | null>(null);
	/** The Bountiful Year's dialog, and whether its player closed it (the chip opens it again). */
	bountyOpen = $state(false);
	bountyDismissed = $state(false);
}
export const eventUi = new EventUi();
