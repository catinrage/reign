"""Pixelify Sans's capital C has a one-pixel opening, which the HUD's dark outline fills in, so
"Copy" reads as "Oopy". This builds 'Reign Px': just a C with a wider mouth, drawn from the
font's own C, which the UI lists ahead of Pixelify Sans (see --px in styles/ui.css).

Usage: python3 scripts/fonts/open-c.py   (needs fonttools and brotli)
"""
from pathlib import Path

from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'node_modules/@fontsource/pixelify-sans/files/pixelify-sans-latin-{w}-normal.woff2'
OUT = ROOT / 'src/client/styles/fonts/reign-px-{w}.woff2'

for w in (500, 700):
    font = TTFont(str(SRC).format(w=w))
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
    options = Options()
    options.flavor = 'woff2'
    options.layout_features = []
    options.name_IDs = []
    sub = Subsetter(options)
    sub.populate(text='C')
    sub.subset(font)
    font.flavor = 'woff2'
    font.save(str(OUT).format(w=w))
    print('wrote', str(OUT).format(w=w), 'mouth', mouth_b, '-', mouth_t)
