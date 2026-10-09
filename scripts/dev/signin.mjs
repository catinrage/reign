// Dev helper: every page now starts at the sign-in screen, so scripts sign up a throwaway
// account first. `signIn(page, url)` does it in the page's browser context (the session cookie
// lands there); `signUp(base, nickname)` returns a cookie header for a bare WebSocket.
let count = 0;

function account(nickname) {
	const tag = `${Date.now().toString(36)}${(count++).toString(36)}`.slice(-9);
	return { username: `dev_${tag}`, nickname, password: 'devpass1', avatar: 'knight' };
}

const origin = (url) => new URL(url).origin;

export async function signIn(page, url, nickname = 'Komeil') {
	const res = await page.request.post(`${origin(url)}/api/register`, { data: account(nickname) });
	if (!res.ok()) throw new Error(`sign-up failed: ${res.status()} ${await res.text()}`);
}

/** Sign-ups by nickname, so a script that reconnects as the same player gets the same account. */
const cookies = new Map();

export async function signUp(base, nickname = 'Guest') {
	if (cookies.has(nickname)) return cookies.get(nickname);
	const res = await fetch(`${origin(base)}/api/register`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(account(nickname))
	});
	if (!res.ok) throw new Error(`sign-up failed: ${res.status} ${await res.text()}`);
	const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
	cookies.set(nickname, cookie);
	return cookie;
}
