<script lang="ts">
	/**
	 * The privacy policy and terms of play, in Settings. Game sites ask for them in the game itself
	 * (CrazyGames does). Plain English only: a translation of legal text is a promise of its own.
	 * Keep it true to what the server keeps (server/db.ts) when that changes.
	 */
</script>

<div class="privacy">
	<details>
		<summary>Privacy policy</summary>
		<p>
			Reign is a free game. We keep only what the game needs to work, never sell it, and never use
			it for advertising.
		</p>
		<p>
			<b>Playing as a guest</b> keeps nothing about you on our server. Your settings and campaign progress
			stay in your browser.
		</p>
		<p>
			<b>With an account</b> our server keeps your username, nickname, a scrambled (hashed) form of your
			password, your avatar and dice, your friends, your campaign stars, your own maps, and the games
			you played: who sat where, the result, and a replay of every move, including chat lines. If you
			sign in through CrazyGames, we also keep your CrazyGames user id and username, and never see your
			CrazyGames password.
		</p>
		<p>
			<b>While you play</b> our server sees your IP address, as any website does, to send you the game.
			Pigeons (private notes) live only as long as the table is open. Your browser stores your settings
			and a sign-in token, which are not tracking cookies.
		</p>
		<p>
			<b>The site you play on</b> (such as CrazyGames or itch.io) may show ads and collect data under
			its own privacy policy, which applies to everything around the game.
		</p>
		<p>
			<b>Deleting your data:</b> ask through the game's page on the site you play on, and we will delete
			your account and everything kept with it.
		</p>
	</details>
	<details>
		<summary>Terms of play</summary>
		<p>
			Reign is provided free and as it is, without guarantees. Games, accounts and features may
			change, pause or end at any time.
		</p>
		<p>
			Be kind at the table. No harassment, hate, cheating or abuse of bugs, and no names or messages
			that are rude or not safe for children. Chat is filtered, but not perfectly. Accounts that
			break these rules may be removed.
		</p>
		<p>By playing, you agree to these terms and the privacy policy above.</p>
	</details>
</div>

<style>
	.privacy {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	summary {
		cursor: pointer;
		font-weight: 700;
	}
	p {
		margin: 6px 0;
		font-size: 0.9em;
		line-height: 1.4;
		opacity: 0.9;
	}
</style>
