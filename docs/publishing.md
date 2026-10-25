# Publishing Reign on game sites

Reign can be uploaded to game sites such as itch.io and CrazyGames while the multiplayer server
keeps running on your own VPS. Every copy talks to that one server, so a player on itch.io can sit
at the same table as a friend who opened the game on your own site.

```
 itch.io / Newgrounds / GameJolt ──┐
 CrazyGames (with its SDK) ────────┼──>  https://your-domain  (your VPS: Caddy → game server → Postgres)
 the game on your own site ────────┘
```

On every copy, **guests** can try the game right away: bots and the campaign run inside the page,
without the server. **Playing with other people takes an account.** On itch.io (and on your own
site) that's a Reign account. On CrazyGames it's the player's CrazyGames account, because
CrazyGames doesn't allow games to have logins of their own.

## 1. The server on your VPS

You need a domain (or subdomain) pointing at the server. Game sites are served over https, and
browsers won't let an https page talk to a plain `http://` or `ws://` address.

1. In your DNS, add an **A record** for the domain pointing at the VPS's IP. On Cloudflare, turn
   the proxy **off** (grey cloud) so Caddy can get its own certificate.
2. On the VPS (Ubuntu or Debian), install Docker and fetch the game:
   ```bash
   curl -fsSL https://get.docker.com | sh
   git clone https://github.com/catinrage/reign && cd reign
   cp .env.example .env
   ```
3. Edit `.env`:
   ```bash
   POSTGRES_PASSWORD=...        # openssl rand -hex 24
   DOMAIN=reign.example.com     # your domain
   BIND=127.0.0.1               # players only come in through https
   ```
4. Open the firewall and start everything:
   ```bash
   ufw allow 80/tcp && ufw allow 443/tcp
   docker compose --profile https up -d --build
   ```
   Caddy gets a Let's Encrypt certificate for `DOMAIN` and renews it by itself. If
   `https://your-domain` doesn't load after a minute, `docker compose logs caddy` says why
   (usually port 80 is blocked, or DNS hasn't updated yet).
5. To update later: `git pull && docker compose --profile https up -d --build`.

Optional settings in `.env` for the copies on other sites:

| Variable | Meaning |
| --- | --- |
| `CORS_ORIGINS` | Sites whose pages may use the server, comma separated, `*` for any part of a name, e.g. `https://*.itch.zone,https://*.crazygames.com`. Empty lets any site in. That's safe, because a page can only act for a player who signed in on that page. |
| `CRAZYGAMES_GAME_ID` | Your game's id on CrazyGames, so the server turns away sign-ins meant for other games. |

## 2. itch.io

```bash
VITE_SERVER_URL=https://reign.example.com pnpm build:itch
```

This makes `dist/reign-itch.zip` (and `dist/itch/`). You can also put `VITE_SERVER_URL=...` in a
`.env.local` file next to `package.json` instead of typing it each time.

On itch.io, create a new project:

- **Kind of project:** HTML
- **Uploads:** `reign-itch.zip`, ticked **This file will be played in the browser**
- **Embed options:** *Embed in page*, viewport **1280 × 720** or bigger, tick **Mobile friendly**,
  **Automatically start on page load** and **Fullscreen button**. Leave *SharedArrayBuffer support*
  off.

The same zip works on **Newgrounds** (upload it as an HTML5 game) and **GameJolt** (add an HTML
build, upload the zip).

Invite links from these copies point at the game on your own domain (`https://your-domain/?room=CODE`),
because itch.io can't pass the room code into its frame. Friends can also type the room code into
the game on itch.io.

## 3. CrazyGames

```bash
VITE_SERVER_URL=https://reign.example.com pnpm build:crazygames
```

This makes `dist/reign-crazygames.zip`, with CrazyGames' SDK (v3) loaded in the page. The build:

- tells CrazyGames when the game has finished loading and when a game is being played;
- signs a player who is signed in to CrazyGames into Reign automatically (the server makes their
  account on their first visit, named after them on CrazyGames), and lets everyone else play as a
  guest against bots;
- replaces the guest menu's "Play online" button with "Sign in to CrazyGames";
- shows no sign-in screen and no "Sign out" button of its own (CrazyGames' rules);
- makes invite links through CrazyGames, which bring friends to the same table.

Upload it in the CrazyGames developer portal as an HTML5 game, and set `CRAZYGAMES_GAME_ID` on the
server once you have the game's id. Before you submit, read CrazyGames'
[requirements](https://docs.crazygames.com/requirements/intro/) and
[multiplayer requirements](https://docs.crazygames.com/requirements/multiplayer/). Their QA may
ask for more, for example an option to turn the chat off.

## 4. Other sites

- **Poki:** invite-only. Games are submitted through their [developer page](https://developers.poki.com/)
  and need Poki's own SDK. If they accept Reign, it would be a third build like the CrazyGames one.
- **Game Distribution, Y8, Armor Games:** take HTML5 games too. The itch.io zip is the starting
  point, though each site may want its own SDK for ads.

## Trying a build locally

Run the server (`pnpm start`, or `pnpm dev:server`), then build against it and serve the folder
from another port:

```bash
VITE_SERVER_URL=http://localhost:8787 pnpm build:itch
npx serve dist/itch -l 9000      # or: cd dist/itch && python3 -m http.server 9000
```

Only `http://localhost` and `http://127.0.0.1` are accepted without https, and only for testing.
The CrazyGames SDK runs in a test mode on `localhost`. Anywhere other than CrazyGames, the
CrazyGames build plays without it.

## How it works

- `src/client/state/server.ts`: where the server is (`VITE_SERVER_URL`), and the session token a copy
  on another site keeps. Browsers don't send the server's cookie from inside another site's frame,
  so these copies ask for the token when signing in and send it back as a bearer token (and to the
  WebSocket as a subprotocol).
- `src/server/api.ts`, `src/server/index.ts`: CORS, token sign-in. The cookie still only works from
  the server's own site.
- `src/server/crazygames.ts`: checks CrazyGames' tokens against their public key.
- `src/client/platform/`: what differs per site (`web`, `itch`, `crazygames`), set by the build mode.
- `src/client/state/guestPlay.ts`: guest play, using the offline build's in-page server.
