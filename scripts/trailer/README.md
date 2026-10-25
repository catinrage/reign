# Trailer and store art

Scripts that record a ~35 second gameplay trailer from the real game and lay out the itch.io and
YouTube art. Each video frame is rendered on demand on a fake clock, then screenshotted, so the
footage is smooth whatever the frame rate of the machine. A graphics card makes it far quicker:
about a second a frame instead of seven in software.

You need Node, pnpm, Python 3 and ffmpeg on the PATH.

```sh
pnpm install
pnpm build
DATABASE_URL=memory:// pnpm start --dev            # leave running: the recorder needs dev cheats

node scripts/trailer/record.mjs trailer/rec a       # 4-player game: establish, glide, roll, build, trade, robber, comet
node scripts/trailer/record.mjs trailer/rec b       # 8-player game: eight, eight-ui
node scripts/trailer/art.mjs trailer/art trailer/rec/establish/0150.jpg trailer/rec/glide/0060.jpg
python3 scripts/trailer/cut.py trailer/rec trailer/art trailer/reign-trailer.mp4
```

- `record.mjs` first lets autoplay run the game to mid-game at low graphics, then reloads at high
  and records each clip into `<outDir>/<clip>/0000.jpg…`. A finished clip is skipped on a rerun;
  delete its folder to record it again. Name clips to record only those:
  `node scripts/trailer/record.mjs trailer/rec a roll,build`. Set `SOFTWARE=1` on a machine without
  a graphics card, and `HEADED=1` if headless Chrome renders black or very slowly (it then runs in a
  visible window: leave it alone while it records).
- `art.mjs` writes `cover.png` (630×500), `banner.png` (960×300), `thumb.png` (1280×720 YouTube
  thumbnail), `bg-tile.png` (page background), the title cards and the captions.
- `cut.py` reads `cut.json`: which frames of which clip go where, the captions, and sound effects
  at given frames. Cuts land on the bars of the tavern track. Games differ from run to run, so
  look at the clips (the dice, the city, the robber and the comet) and move `first` and the
  effect frames to match before cutting.
