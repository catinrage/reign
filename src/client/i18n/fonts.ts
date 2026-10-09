/// <reference types="vite/client" />
/**
 * Pixel glyphs for Chinese. Pixelify Sans (the display font) covers Latin and Cyrillic only, so
 * Chinese text in pixel-font places would fall back to the system's smooth font. Fusion Pixel
 * (OFL) fills in, limited to the CJK ranges so the browser only downloads it for Chinese text.
 */
import fusionUrl from '@fontsource/fusion-pixel-12px-proportional-sc/files/fusion-pixel-12px-proportional-sc-latin-400-normal.woff2?url';

export const CJK_PIXEL_FONT = 'Reign Px CJK';
const CJK_RANGES = 'U+2E80-2FDF, U+3000-303F, U+3100-312F, U+31A0-31BF, U+3400-4DBF, U+4E00-9FFF, U+F900-FAFF, U+FF00-FFEF';

let installed = false;
export function installCjkFont(): void {
	if (installed || typeof document === 'undefined' || typeof FontFace === 'undefined') return;
	installed = true;
	document.fonts.add(new FontFace(CJK_PIXEL_FONT, `url(${fusionUrl}) format('woff2')`, { unicodeRange: CJK_RANGES, display: 'swap' }));
}
