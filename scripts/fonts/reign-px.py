"""Builds 'Reign Px', the few glyphs the UI draws ahead of Pixelify Sans (see --px in
styles/ui.css), at weights 500 and 700:

- C: Pixelify's capital C has a one-pixel opening, which the HUD's dark outline fills in, so
  "Copy" reads as "Oopy". This one is drawn from the font's own C with a wider mouth.
- 0-9: Pixelify's 5 looks like an S and, small, its 3 reads as 8. These are Jersey 10's digits
  (redrawn below from its pixels), sized to Pixelify's cap height and baseline and kept on
  Pixelify's advance widths, so numbers line up and nothing around them moves.

Both fonts are under the SIL Open Font License 1.1 with no Reserved Font Name; the result is
named Reign Px and ships with that license (src/client/styles/fonts/OFL.txt).

Usage: python3 scripts/fonts/reign-px.py   (needs fonttools and brotli)
"""
from pathlib import Path

from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'node_modules/@fontsource/pixelify-sans/files/pixelify-sans-latin-{w}-normal.woff2'
OUT = ROOT / 'src/client/styles/fonts/reign-px-{w}.woff2'

PIXELIFY = 'Copyright 2021 The Pixelify Sans Project Authors (https://github.com/eifetx/Pixelify-Sans)'
JERSEY = 'Copyright 2023 The Soft Type Project Authors (https://github.com/scfried/soft-type-jersey)'

# Jersey 10's digits, one character per pixel, top row first.
DIGITS = {
    '0': ['.####.', '######', '##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '######', '.####.'],
    '1': ['###', '###', '.##', '.##', '.##', '.##', '.##', '.##', '.##', '.##'],
    '2': ['.#####.', '#######', '##...##', '....###', '...###.', '..###..', '.###...', '###....', '#######', '#######'],
    '3': ['.#####.', '#######', '##...##', '.....##', '..####.', '..####.', '.....##', '##...##', '#######', '.#####.'],
    '4': ['....##', '...###', '..####', '.##.##', '##..##', '##..##', '######', '######', '....##', '....##'],
    '5': ['######', '######', '##....', '##....', '#####.', '.#####', '....##', '##..##', '######', '.####.'],
    '6': ['.#####.', '#######', '##...##', '##.....', '######.', '#######', '##...##', '##...##', '#######', '.#####.'],
    '7': ['######', '######', '....##', '....##', '...###', '..###.', '..###.', '..##..', '..##..', '..##..'],
    '8': ['.#####.', '#######', '##...##', '##...##', '.#####.', '#######', '##...##', '##...##', '#######', '.#####.'],
    '9': ['.#####.', '#######', '##...##', '##...##', '#######', '.######', '.....##', '##...##', '#######', '.#####.'],
}
# Per weight, in font units: how wide a seven-pixel digit is and how thick its upright and its
# level strokes are. Pixelify's own 8 and H at that weight, so the digits match the letters.
SHAPE = {500: (471, 113, 113), 700: (481, 129, 137)}


def open_c(font):
    glyphs = font.getGlyphSet()
    rec = RecordingPen()
    glyphs['C'].draw(rec)
    pts = [p[0] for op, p in rec.value if op in ('moveTo', 'lineTo')]
    xs = sorted({x for x, _ in pts})
    ys = sorted({y for _, y in pts})
    # The C is an O with a notch: outer box, its stepped corners and inner box.
    left, right = xs[0], xs[-1]
    inner_l, inner_r = xs[2], xs[3]
    corner_l, corner_r = xs[1], xs[4]
    bottom, top = ys[0], ys[-1]
    step_b, step_t = ys[1], ys[-2]
    in_b, in_t = ys[2], ys[-3]
    stroke = in_b - step_b + (step_b - bottom)
    # Keep one pixel of the right side under the top bar and over the bottom one.
    mouth_t, mouth_b = step_t - stroke, step_b + stroke
    outline = [
        (corner_l, bottom), (corner_l, step_b), (left, step_b), (left, step_t), (corner_l, step_t),
        (corner_l, top), (corner_r, top), (corner_r, step_t), (right, step_t), (right, mouth_t),
        (inner_r, mouth_t), (inner_r, in_t), (inner_l, in_t), (inner_l, in_b), (inner_r, in_b),
        (inner_r, mouth_b), (right, mouth_b), (right, step_b), (corner_r, step_b), (corner_r, bottom),
    ]
    pen = TTGlyphPen(glyphs)
    pen.moveTo(outline[0])
    for p in outline[1:]:
        pen.lineTo(p)
    pen.closePath()
    font['glyf']['C'] = pen.glyph()


def trace(rows):
    """The outlines of a pixel picture as loops of grid corners, filled side on the right."""
    h = len(rows)
    on = lambda c, r: 0 <= r < h and 0 <= c < len(rows[h - 1 - r]) and rows[h - 1 - r][c] == '#'
    edges = {}
    for r in range(h):
        for c in range(len(rows[h - 1 - r])):
            if not on(c, r):
                continue
            # Clockwise around the pixel, skipping sides shared with a filled neighbor.
            if not on(c - 1, r):
                edges.setdefault((c, r), []).append((c, r + 1))
            if not on(c, r + 1):
                edges.setdefault((c, r + 1), []).append((c + 1, r + 1))
            if not on(c + 1, r):
                edges.setdefault((c + 1, r + 1), []).append((c + 1, r))
            if not on(c, r - 1):
                edges.setdefault((c + 1, r), []).append((c, r))
    loops = []
    while edges:
        start = next(iter(edges))
        loop, p = [start], start
        while True:
            q = edges[p].pop()
            if not edges[p]:
                del edges[p]
            if q == start:
                break
            loop.append(q)
            p = q
        # Corners only: drop points in the middle of a straight run.
        n = len(loop)
        loops.append([loop[i] for i in range(n) if (loop[i - 1][0] == loop[i][0]) != (loop[i][0] == loop[(i + 1) % n][0])])
    return loops


def draw_digit(font, ch, wide, stem, bar):
    glyphs = font.getGlyphSet()
    name = font.getBestCmap()[ord(ch)]
    rows = DIGITS[ch]
    advance = font['hmtx'][name][0]
    # Same height and baseline as Pixelify's own digit, centered on its advance.
    bounds = glyphs[name]
    rec = RecordingPen()
    bounds.draw(rec)
    ys = [p[-1][1] for op, p in rec.value if p]
    bottom, top = min(ys), max(ys)
    # Strokes are two pixels: pixels sized for the overall box, then every edge moved in or out
    # by the same amount until the strokes come out right.
    pw = (wide - stem) / 5
    grow_x = stem / 2 - pw
    ph = (top - bottom - bar) / 8
    grow_y = bar / 2 - ph
    width = len(rows[0]) * pw + 2 * grow_x
    x0 = (advance - width) / 2 + grow_x
    y0 = bottom + grow_y
    pen = TTGlyphPen(glyphs)
    for loop in trace(rows):
        n = len(loop)
        pts = []
        for i in range(n):
            (ax, ay), (bx, by), (cx, cy) = loop[i - 1], loop[i], loop[(i + 1) % n]
            # Each side moves out along its normal (left of its direction, away from the fill).
            nx = -(by - ay > 0) + (by - ay < 0) - (cy - by > 0) + (cy - by < 0)
            ny = (bx - ax > 0) - (bx - ax < 0) + (cx - bx > 0) - (cx - bx < 0)
            pts.append((round(x0 + bx * pw + nx * grow_x), round(y0 + by * ph + ny * grow_y)))
        pen.moveTo(pts[0])
        for p in pts[1:]:
            pen.lineTo(p)
        pen.closePath()
    glyph = pen.glyph()
    font['glyf'][name] = glyph
    glyph.recalcBounds(font['glyf'])
    font['hmtx'][name] = (advance, glyph.xMin)


def name_font(font, w):
    style = 'Bold' if w == 700 else 'Medium'
    table = font['name']
    table.names = []
    for i, text in (
        (0, f'{PIXELIFY}. Digits: {JERSEY}.'),
        (1, 'Reign Px'),
        (2, style),
        (3, f'Reign Px {style}'),
        (4, f'Reign Px {style}'),
        (5, 'Version 1.100'),
        (6, f'ReignPx-{style}'),
        (13, 'This Font Software is licensed under the SIL Open Font License, Version 1.1.'),
        (14, 'https://openfontlicense.org'),
    ):
        table.setName(text, i, 3, 1, 0x409)


def build(w, out, shape=None):
    font = TTFont(str(SRC).format(w=w))
    open_c(font)
    for ch in DIGITS:
        draw_digit(font, ch, *(shape or SHAPE[w]))
    options = Options()
    options.flavor = 'woff2'
    options.layout_features = []
    options.name_IDs = []
    sub = Subsetter(options)
    sub.populate(text='C0123456789')
    sub.subset(font)
    name_font(font, w)
    font.flavor = 'woff2'
    font.save(str(out))


if __name__ == '__main__':
    for w in (500, 700):
        out = str(OUT).format(w=w)
        build(w, out)
        print('wrote', out)
