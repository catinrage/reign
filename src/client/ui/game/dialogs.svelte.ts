/** Which choice dialog is open, for actions that need extra input. */
class Dialogs {
	open = $state<'yearOfPlenty' | 'monopoly' | null>(null);
}
export const dialogs = new Dialogs();
