<div align="center">

# 👑 Reign

**Settle, trade and build on a hand-crafted voxel island, right in your browser.**

**English** · [Русский](README.ru.md) · [简体中文](README.zh-CN.md) · [Deutsch](README.de.md) · [Français](README.fr.md)

[![Play the demo](https://img.shields.io/badge/play-demo%20vs%20bots-f5b301?style=for-the-badge)](https://reign-khaki.vercel.app)

![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178c6?logo=typescript&logoColor=white)
![Svelte](https://img.shields.io/badge/Svelte-5-ff3e00?logo=svelte&logoColor=white)
![Three.js](https://img.shields.io/badge/Three.js-r180-000000?logo=threedotjs&logoColor=white)
![Node](https://img.shields.io/badge/Node-%E2%89%A520-339933?logo=nodedotjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169e1?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-ready-2496ed?logo=docker&logoColor=white)

<img src="docs/screenshots/home.jpg" alt="Reign main menu with the voxel island on the table" width="100%">

</div>

Reign is a multiplayer take on the classic settle-trade-build board game, built from micro-voxels
and played in the browser. Every tile, piece, die, card pile and the cozy room around the table is
made of tiny voxels and meshed at runtime. Play the full classic game with friends or bots, or
switch to **Reign Extended** for characters with powers, an events deck, new buildings and islands
of any shape and size.

> **Try it now:** [reign-khaki.vercel.app](https://reign-khaki.vercel.app) runs the bots-only build
> in your browser. No account, no install.

## Contents

- [Highlights](#highlights)
- [Screenshots](#screenshots)
- [Game modes](#game-modes)
- [Playing together](#playing-together)
- [Quick start](#quick-start)
- [Running Reign](#running-reign)
- [Configuration](#configuration)
- [Controls](#controls)
- [Dev cheats](#dev-cheats)
- [How it's built](#how-its-built)
- [Adding content](#adding-content)
- [Tests](#tests)

## Highlights

- 🎲 **The complete base game.** Random 19-tile island with harbors, snake-draft setup, dice
  production, the robber, development cards, Longest Road and Largest Army, bank, harbor and
  player-to-player trades, first to 10 points.
- 🧱 **A living voxel world.** Swaying crops, grazing sheep, foamy shallows, rolling physical dice,
  cards that fly from the tiles to your hand, and a warm tavern room around the table.
- 🏰 **Reign Extended.** 16 characters with traits and powers, a character draft, 13 event cards,
  workshops, stone roads and storehouses, and islands from 12 to 240 tiles for up to 8 players.
- 🧑‍🤝‍🧑 **Made for friends.** Accounts with voxel avatars, friends and online status, invites,
  match history, spectators, private pigeon post and rejoining a game you left.
- 🤖 **Bots that play every rule.** Fill any empty seat; bots trade, build, use character powers and
  answer events.
- 🛡️ **Server-authoritative.** The server runs the rules and sends each player only what they may
  see, so hands, the deck and the dice seed stay secret.
- 🌍 **Five languages.** English, Russian, Simplified Chinese, German and French, picked from your
  browser and switchable in Settings or on the sign-in screen.
- 📚 **Built-in tutorial.** A full illustrated rule book for both modes, from the main menu or the
  in-game menu.

## Screenshots

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/table.jpg" alt="A game in progress with the HUD"><br><sub><b>At the table.</b> Your tiles and income, the chronicle, plaques for every player and the build menu.</sub></td>
    <td width="50%"><img src="docs/screenshots/closeup.jpg" alt="Close-up of the voxel island"><br><sub><b>Up close.</b> Every tile is a miniature diorama, here with a storehouse, the robber and sheep.</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/lobby.jpg" alt="The Reign Extended lobby"><br><sub><b>The lobby.</b> The host sets the mode, island, characters, buildings, events, points and turn timer.</sub></td>
    <td><img src="docs/screenshots/draft.jpg" alt="The character draft"><br><sub><b>Character draft.</b> Sixteen characters, each with a trait and a power; the first settler picks last.</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/events.jpg" alt="An event card being revealed"><br><sub><b>Events deck.</b> A new card each round brings feasts, storms, comets and bandits.</sub></td>
    <td><img src="docs/screenshots/islands.jpg" alt="Choosing an island"><br><sub><b>Islands.</b> Presets, a map maker and a seeded random island generator.</sub></td>
  </tr>
  <tr>
    <td colspan="2"><img src="docs/screenshots/eight-players.jpg" alt="An eight-player game on a large island"><br><sub><b>Big tables.</b> Larger islands seat up to eight players, with a bigger bank and deck to match.</sub></td>
  </tr>
</table>

## Game modes

The host picks the mode in the lobby, and every option below is a switch the host controls.

### Classic

The standard game, exactly as it has always played: the random 19-tile island, standard rules,
2 to 4 players and 10 points to win.

### Reign Extended

Everything in Classic, plus:

| Feature | What it adds |
| --- | --- |
| **Characters** | 16 characters, each with a trait that bends one rule, such as 3:1 bank trades, cheaper cities or stealing two cards. The host can draft them, leave some out, allow repeats or turn them off. |
| **Powers** | Each character also has a power worth about a development card: Market Day, Foresight, Hex, Blessing, Mischief and more. Once per game, or recharging every 4 or 6 rounds. |
| **Events deck** | 13 event cards, one flipped every round or every second round: Harvest Festival, Comet, Earthquake, Royal Decree, Plague of Rats, Bandit Uprising and others. The host can pull any card out. |
| **Buildings** | **Workshops** (+1 card when their tile pays you), **stone roads** (count double for Longest Road) and **storehouses** (keep 3 cards safe from the robber and events). |
| **Islands** | Six preset shapes from the classic isle to a 37-tile realm, a map maker for your own islands, and a random generator (12 to 240 tiles; round, long, ragged or linked islands, with lakes). |
| **Bigger tables** | An island seats one player per five tiles, from 4 up to 8, in eight colors. Bank and deck grow with the table. |
| **House rules** | Points to win from 3 to 30 (capped by island and table size), hand limit on a 7 from 3 to 20, and a turn timer from 30 seconds to 3 minutes. |

## Playing together

- **Accounts.** Sign in with a username, nickname, password and one of twelve voxel avatars, all
  changeable later.
- **Friends.** Add friends by username, see who is online, at a table or in a game, and invite them
  to your lobby.
- **Match history.** Every game is recorded, with characters and results, for you and your friends.
- **Invite links.** Create a room and share the link or the room code.
- **Spectators.** Entering the code of a running game lets you watch without seeing anyone's hand.
- **Pigeon post.** Send private notes to another player by carrier pigeon. Only the two of you can
  read them.
- **Leaving and rejoining.** A bot takes over a seat whose player left until they come back. A game
  ends only when everyone has left.
- **Pause.** In a game against bots, opening the menu pauses the table.

## Quick start

You need **Node 20+** and **pnpm** (`corepack enable` gives you the right version).

```bash
pnpm install
pnpm dev          # game server on :8787 + Vite on :5173
```

Open <http://localhost:5173>, create an account, then click **Play vs bots** or **Create a room**
and share the invite link. To play with others on your network, open the game through your
computer's LAN address (for example `http://192.168.1.20:5173`) so the link points there.

No database setup is needed: without `DATABASE_URL` the server runs
[PGlite](https://pglite.dev) (Postgres compiled to WebAssembly) in its own process and keeps the
data in `./data/db`. Delete that folder to start over.

## Running Reign

### Production build

```bash
pnpm build
pnpm start        # one process serves the page, /api and the WebSocket on http://localhost:8787
```

### Docker

```bash
docker compose up -d --build        # the game + Postgres on http://localhost:8787
docker compose down                 # stop it
```

The image builds the client and runs the production server as a small non-root container with a
health check on `/health`. Compose also starts Postgres 17 with its data in the `db` volume.

Without compose:

```bash
docker build -t reign .
docker run -p 8787:8787 -e DATABASE_URL=postgres://user:pass@host:5432/reign reign
```

Leave `DATABASE_URL` out and the container keeps its data inside itself with PGlite (lost when the
container is removed).

For development without installing Node, `docker compose --profile dev up --build` runs `pnpm dev`
from your working copy with hot reload on <http://localhost:5173>.

### Your own server with HTTPS

1. Copy `.env.example` to `.env`.
2. Set a real `POSTGRES_PASSWORD` (letters and digits, e.g. `openssl rand -hex 24`).
3. Set `DOMAIN` and point its DNS A record at the server.
4. Set `BIND=127.0.0.1` so port 8787 only answers locally and players come in through HTTPS.

```bash
docker compose --profile https up -d --build   # game + Postgres + Caddy on ports 80 and 443
```

Caddy gets and renews a Let's Encrypt certificate and passes the page, `/api` and the WebSocket on
to the game. Without a domain, leave the profile off and play on `http://<server-ip>:8787`.

### Offline build (bots only)

```bash
pnpm build:offline      # static site in dist/offline
pnpm dev:offline        # the same with hot reload on http://localhost:5173
```

The offline build needs no server and no accounts: the rules and bots run inside the page, using
the same `Room` the server uses behind a stand-in WebSocket. You play one local seat against bots
in either mode, and your nickname, avatar and saved maps stay in the browser. `vercel.json` builds
this version, so the repository deploys to Vercel or any static host as is.

### Render

`render.yaml` deploys the game as a Node web service with a free Render Postgres database. The
same Docker image also runs on any host that supports WebSockets, such as Fly.io, Railway or a VPS.

## Configuration

| Variable | Default | Used by | Meaning |
| --- | --- | --- | --- |
| `PORT` | `8787` | server, compose | Port the game listens on. |
| `DATABASE_URL` | *(empty)* | server | `postgres://` URL. Empty means built-in PGlite in `./data/db`. |
| `NODE_ENV` | | server | `production` never enables dev cheats. |
| `POSTGRES_PASSWORD` | `change-me` | compose | Password for the bundled Postgres, set before the first start. |
| `BIND` | `0.0.0.0` | compose | Address the game port is published on. |
| `DOMAIN` | `localhost` | compose (`https`) | Domain Caddy gets a certificate for. |

## Controls

| Input | Action |
| --- | --- |
| Drag | Rotate the table |
| Right-drag or two fingers | Pan |
| Wheel or pinch | Zoom |
| Hover, then click | Preview a piece where the glowing gems and rings are, then place it |
| `Esc` | Cancel build mode, close the trade panel, or open the game menu |
| `` ` `` | Open the cheat panel (dev server only) |

During setup and when moving the robber, the board lights up every valid spot.

## Dev cheats

`pnpm dev` starts the server with `--dev`, which gives every game a cheat panel: press `` ` `` or
click the hammer under the menu button. It can hand any player cards or a playable development
card, rig the next roll, flip a chosen event, finish the setup, speed bots up and win on the spot.
Each use leaves a `[cheat]` line in the chronicle. `pnpm start`, Docker and anything with
`NODE_ENV=production` never turn it on, and the server refuses cheat messages there.

## How it's built

```
src/shared/   rules engine, board geometry, bots and network protocol (no DOM, no Three.js)
  board/        hex math, topology, map presets, random islands
  rules/        config, engine, queries, view redaction, bots, characters, events, buildings
src/server/   Node HTTP + WebSocket server: rooms, lobby, seats, reconnection, bots, static files,
              accounts and database (db.ts, accounts.ts, api.ts), presence and invites (hub.ts)
src/client/   Vite + Svelte 5 interface over a Three.js scene
  scene/        voxel engine (mesher with baked AO, beveled voxel shader), island terrain, pieces,
                room, lighting, camera rig, dice, particles, post-processing, portraits
  ui/           home, lobby, HUD, trade, dialogs, tutorial, accounts, pigeon post
  offline/      in-page server for the bots-only build
tests/        engine, rooms, accounts, Extended content and full simulated bot games
scripts/      screenshot, end-to-end and dev helpers
```

- **The server is authoritative.** Clients send actions; the server checks them with the shared
  engine and sends each player a redacted view. Other hands become counts, and the deck and dice
  seed are never sent.
- **The engine is pure.** `applyAction(state, player, action)` returns a new state plus events.
  Events drive the animations, sounds and the chronicle.
- **Maps are data.** A `Board` is hexes (terrain and number) and harbors; the topology is derived,
  so any shape works.
- **Content is data.** Resources, terrains, costs and the development deck live in
  `src/shared/rules/config.ts`; characters, events and buildings each have their own file.
- **Classic stays classic.** Everything new is gated on `state.mode === 'extended'`, and a test
  checks that Classic games are unchanged.

## Adding content

- **Characters:** `rules/characters.ts`. Traits hook in through `costOf`, `tradeRatios`,
  `discardLimit` and `longestRoadMin` in `rules/queries.ts`; powers go through the `usePower`
  action, and bots get a rule in `bot.ts`. Portraits are voxel busts in `scene/portraits.ts`.
- **Events:** `rules/events.ts` holds the cards and their effects.
- **Buildings:** `rules/buildings.ts` lists the host switches; models live in `scene/board/`.
- **Resources and tiles:** extend `config.ts`, then add terrain in `scene/board/terrain.ts` and
  models in `scene/board/models.ts`.
- **Maps:** presets are drawn as text in `board/maps.ts`; `generateBoard(tiles, rng)` deals any shape.
- **Text and languages:** every text the player reads goes through `t('English text')` from
  `src/client/i18n`; the English is the key. Each language is one file in `src/client/i18n/locales`
  mapping English to its translation, and anything missing shows in English. `pnpm i18n` lists
  what each language lacks. A new language is a new locale file plus one line in `languages.ts`.
- **Tutorial:** each Extended feature gets a page in `ui/tutorial/` and a line in `chapters.ts`.

## Tests

```bash
pnpm test         # rules engine, rooms, accounts and full simulated bot games
pnpm check        # Svelte and TypeScript checks
node scripts/e2e.mjs http://localhost:8787 test-results/e2e 300   # browser smoke test against a running server
```

Set `TEST_DATABASE_URL` to also run the account tests against a real Postgres server.

<div align="center">
<sub>Made with voxels, dice and a lot of sheep. 🐑</sub>
</div>
