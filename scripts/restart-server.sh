#!/bin/sh
# Dev helper: restart the game server in the background on $PORT (default 8787).
PORT=${PORT:-8787}
for pid in $(pgrep -f "tsx/dist/(cli|loader).mjs.*src/server/index.ts"); do kill "$pid" 2>/dev/null; done
sleep 1
LOG=${LOG:-/tmp/reign-server.log}
PORT=$PORT nohup npx tsx src/server/index.ts > "$LOG" 2>&1 &
sleep 2
curl -s "localhost:$PORT/health"; echo
