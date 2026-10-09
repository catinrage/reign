/** Which choice dialog is open, for actions that need extra input. */
class Dialogs {
	open = $state<'yearOfPlenty' | 'monopoly' | null>(null);
	/** The city about to become a guild hall, while its owner names the goods it trades. */
	guildHall = $state<number | null>(null);
}
export const dialogs = new Dialogs();
