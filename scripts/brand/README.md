# Reign brand assets

From the repository root, run:

```sh
node scripts/brand/generate.mjs
```

Uses the existing Node.js, Playwright and Pixelify Sans installation. No new package
dependencies are needed. The font renderer uses `/usr/bin/google-chrome` when present,
otherwise Playwright's installed Chromium. To choose another installed browser:

```sh
BRAND_CHROME=/path/to/chrome node scripts/brand/generate.mjs
```

The generator reads the exact nine-row `GLYPHS` and jeweled `CROWN` from
`src/client/scene/logo.ts`. Each source pixel occupies a 3×3 block in the wordmark.
It preserves the one-cell letter gaps and the crown's offset over the I. All faces,
rims, two-pixel extrusion and walnut backing use solid colors from the scene/UI
palettes. The SVG uses integer rectangle runs and `crispEdges`; the PNGs are rendered
from the saved SVG rectangles and scaled by nearest neighbor.

| Output                                   | Size / treatment                                |
| ---------------------------------------- | ----------------------------------------------- |
| `src/client/public/logo.svg`             | 135×57 grid, transparent                        |
| `src/client/public/logo.png`             | 540×228, 4×                                     |
| `src/client/public/logo@2x.png`          | 1080×456, 8×                                    |
| `docs/logo-banner.png`                   | 1280×640, walnut planks and stitched red ribbon |
| `src/client/public/favicon.svg`          | Hand-tuned 16×16 crowned R                      |
| `src/client/public/favicon-32.png`       | Hand-tuned 32×32 crowned R                      |
| `src/client/public/favicon.ico`          | Independent 16, 32 and 48px frames              |
| `src/client/public/apple-touch-icon.png` | 180×180, solid walnut corners, 60px master      |
| `src/client/public/icon-192.png`         | 192×192, 48px master                            |
| `src/client/public/icon-512.png`         | 512×512, 64px master                            |
| `src/client/public/site.webmanifest`     | Reign name, 192/512 icons and theme colors      |
| `docs/brand-preview.png`                 | 1600×880, light/dark comparisons                |

The small marks have separate layouts: the 16px crown is compressed by one row to
leave a dark gap above the R; the 32px R has a larger counter and three-pixel strokes.
The larger sizes use whole-pixel masters, never a reduced wordmark. Rounded tile
corners are stepped pixels. The Apple icon has no transparency.

Ribbon and preview text uses Pixelify Sans 700. Its B middle bar is joined on the
pixel grid so “BUILD” remains legible with a dark outline. Font masks are thresholded
to binary pixels; the final art contains no antialiasing, blur, gradients or colors
outside the supplied palettes. Generation checks the palette, source masks and
tagline fit. The preview shows native-size favicons and enlarged pixel proofs.
