# Reign

A micro-voxel, multiplayer take on the classic settle-trade-build board game, played in the
browser. Phase one is the complete base game: 2–4 players (humans or bots), the random
19-tile island with harbors, setup snake draft, dice production, the robber, development
cards, longest road and largest army, bank/harbor and player-to-player trading, and a win at
10 points.

![Style target](docs/reference/style-reference.png)

The picture above is the visual target. Everything in the world is made of voxels and meshed
at runtime: the island, the pieces, the dice, the table and the cozy room around it.

## Play locally

```bash
pnpm install
pnpm dev          # game server on :8787 + Vite on :5173 (open http://localhost:5173)
```

Click **Create a game**, then **Copy invite link** and send it to friends on the same network (open the game via your PC's LAN address, e.g. `http://192.168.1.20:5173`, so the link points there),
or click **Quick game vs 3 bots** to play solo.

Production build (one process serves the page and the WebSocket):

```bash
pnpm build
pnpm start        # http://localhost:8787 (PORT env var to change)
```

`Dockerfile` and `render.yaml` are included so it can be deployed as a single web service on
any host that supports WebSockets (Render, Fly.io, Railway, a VPS…).

## Controls

- Drag to rotate the table, right-drag (or two fingers) to pan, wheel/pinch to zoom.
- Glowing gems and rings mark where you can build; hover to preview the piece, click to place it.
- During setup and when moving the robber, the board highlights the valid spots for you.
- `Esc` cancels build mode or closes the trade panel, and otherwise opens the game menu (how to play, settings, leave). In a game against bots the menu pauses the table.

## How it's built

```
src/shared/   rules engine, board geometry, bots, network protocol (no DOM, no Three.js)
  board/        hex math, topology (vertices/edges/harbors derived from the map), map generator
  rules/        config (resources, costs, decks), engine (applyAction), queries, view redaction, bot
src/server/   Node HTTP + WebSocket server: rooms, lobby, seats, reconnection, bots, static files
src/client/   Vite + Svelte 5 interface over a Three.js scene
  scene/        voxel engine (grid, mesher with baked AO, beveled voxel shader), island terrain,
                piece models, room, lighting, camera rig, dice, particles, post-processing
  ui/           Svelte components: home, lobby, HUD (players, hand, actions, trade, log, dialogs)
tests/        engine tests, including 75 complete simulated bot games per run
scripts/      browser screenshot and end-to-end helpers
```

- **The server is authoritative.** Clients send actions; the server validates them with the
  shared engine and sends each player a redacted view (other hands become counts, the deck
  and dice seed are never sent).
- **The engine is pure.** `applyAction(state, player, action)` returns a new state plus events.
  Events drive animations, sounds and the chronicle.
- **Maps are data.** A `Board` is just hexes (terrain + number) and harbors; topology is derived.
  Custom maps only need a different `Board`.
- **Content is data.** Resources, terrains, costs and the development deck live in
  `src/shared/rules/config.ts`.

### Hooks for the next phases

- *Characters with traits:* lobby seats can carry a character id; the engine's action handlers
  are the place to apply trait modifiers (costs, trade ratios, production).
- *More resources, tiles, buildings, robber-like entities:* extend the lists in `config.ts`,
  add terrain builders in `scene/board/terrain.ts` and models in `scene/board/models.ts`.
- *Custom maps:* `createGame(players, seed, board)` already accepts any `Board`.
- *Day/night:* `Lighting.night` (0–1) dims the sun and boosts flames; voxel materials receive
  `uNight`, and windows on settlements and cities are emissive.

## Tests

```bash
pnpm test         # rules engine + full simulated games
pnpm check        # Svelte/TypeScript checks
node scripts/e2e.mjs http://localhost:8787 test-results/e2e 300   # browser smoke test (needs a running server)
```
