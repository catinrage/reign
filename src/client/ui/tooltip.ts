import '../styles/tooltip.css';
import { pixelSvg } from './art';
import { PIXEL } from './pixel';

/**
 * The game's own tooltips: a small dark-wood plate with a gold rim and a pixel pointer, in
 * place of the browser's plain yellow box. Every element with a `title` gets one, so the
 * interface keeps writing ordinary `title`s; while ours shows, the title is held aside so the
 * browser's own tooltip stays away.
 *
 * Optional extras on the same element:
 * - `data-tip-head`: a heading over the text.
 * - `data-tip-note`: a line set apart under the text, such as why a card can't be played.
 * - `data-tip-tone`: `warn` (the default) or `good`, the note's color and icon.
 *
 * Mouse: shows after a short rest, at once when moving from one tooltip to the next. Touch:
 * a long press shows it, and so does a tap on something that can't be used right now
 * (`aria-disabled`), so phones can read the reason too. Keyboard focus shows it as well.
 */

const DELAY = 380;
/** Moving to another tooltip within this long skips the delay. */
const CHAIN = 300;
const LONG_PRESS = 420;
const TOUCH_HOLD = 2200;
/** Room for the pointer, which hangs ten pixels past the plate. */
const GAP = 12;
const EDGE = 8;

/** Dark walnut plate, gold rim lit from the top left. 12×12, slice 4. */
function plate(): string {
	const W = 12;
	return pixelSvg(W, W, (x, y) => {
		const e = Math.min(x, y, W - 1 - x, W - 1 - y);
		if ((x === 0 || x === W - 1) && (y === 0 || y === W - 1)) return null;
		const lit = (x === e || y === e) && !(W - 1 - x === e || W - 1 - y === e);
		if (e === 0) return '#140904';
		if (e === 1) return lit ? '#ffe08a' : '#c88a2a';
		if (e === 2) return lit ? '#5a3319' : '#1f1007';
		return (x * 7 + y * 3) % 11 === 0 ? '#3a2112' : '#331d0f';
	});
}

/** The pointer under the plate. Its top three rows lie over the plate's bottom edge and open
 * it, so plate and pointer read as one piece. 11×8, pointing down. */
function pointer(): string {
	const W = 11;
	const H = 8;
	const mid = 5;
	return pixelSvg(W, H, (x, y) => {
		const half = y < 3 ? 5 : 7 - y;
		const d = half - Math.abs(x - mid);
		if (d < 0) return null;
		if (d === 0 || y === H - 1) return '#140904';
		if (d === 1) return x < mid ? '#ffe08a' : '#c88a2a';
		return '#331d0f';
	});
}

let tip: HTMLDivElement;
let head: HTMLDivElement;
let body: HTMLDivElement;
let note: HTMLDivElement;
let noteIcon: HTMLImageElement;
let noteText: HTMLSpanElement;
let arrow: HTMLElement;

/** The element whose tooltip shows (or is about to). */
let target: Element | null = null;
let shown = false;
let timer = 0;
let lastHidden = 0;
let frame = 0;
let touchHide = 0;
/** A long press showed a tooltip: swallow the click that ends it. */
let swallowClick = false;
const watcher = new MutationObserver(() => {
	if (!target) return;
	// The interface changed the title while it was held aside: take the new one.
	if (target.hasAttribute('title')) hold(target);
	if (shown) fill(target);
});

function holder(from: EventTarget | null): Element | null {
	if (!(from instanceof Element)) return null;
	const el = from.closest('[title], [data-tip]');
	if (!el || el === document.documentElement) return null;
	return el;
}

/** Move the title aside so the browser keeps its own tooltip to itself. */
function hold(el: Element) {
	const t = el.getAttribute('title');
	if (t === null) return;
	el.setAttribute('data-tip', t);
	el.removeAttribute('title');
}

function release(el: Element) {
	const t = el.getAttribute('data-tip');
	el.removeAttribute('data-tip');
	if (t !== null && !el.hasAttribute('title')) el.setAttribute('title', t);
}

function fill(el: Element): boolean {
	const text = el.getAttribute('data-tip') ?? '';
	const h = el.getAttribute('data-tip-head') ?? '';
	const n = el.getAttribute('data-tip-note') ?? '';
	if (!text.trim() && !h && !n) return false;
	head.textContent = h;
	head.hidden = !h;
	body.textContent = text;
	body.hidden = !text.trim();
	const good = el.getAttribute('data-tip-tone') === 'good';
	note.hidden = !n;
	note.classList.toggle('good', good);
	noteIcon.src = good ? PIXEL.check : PIXEL.close;
	noteText.textContent = n;
	return true;
}

/** The zoom `el` is drawn at: players can make the HUD and the menus bigger or smaller. */
function zoomOf(el: Element): number {
	return (el as Element & { currentCSSZoom?: number }).currentCSSZoom ?? 1;
}

function place() {
	if (!target || !shown) return;
	if (!target.isConnected) return hide();
	const r = target.getBoundingClientRect();
	if (r.width === 0 && r.height === 0) return hide();
	// The tooltip takes the size of what it belongs to. Placing it is done in screen pixels, and
	// its own pixels are `z` of those.
	const z = zoomOf(target);
	if (tip.style.zoom !== (z === 1 ? '' : String(z))) {
		tip.style.zoom = z === 1 ? '' : String(z);
		tip.style.setProperty('--ui-zoom', String(z));
	}
	const vw = innerWidth;
	const w = tip.offsetWidth * z;
	const h = tip.offsetHeight * z;
	const cx = r.left + r.width / 2;
	let below = r.top - h - GAP < EDGE;
	if (below && r.bottom + h + GAP > innerHeight - EDGE) below = false;
	const top = below ? r.bottom + GAP : r.top - h - GAP;
	const left = Math.min(Math.max(cx - w / 2, EDGE), vw - w - EDGE);
	tip.style.transform = `translate(${Math.round(left) / z}px, ${Math.round(top) / z}px)`;
	tip.classList.toggle('below', below);
	// The pointer sits in the padding box, inside the plate's border.
	const ax = Math.min(Math.max((cx - left) / z, 16), w / z - 16) - tip.clientLeft;
	arrow.style.left = `${Math.round(ax / 2) * 2}px`;
}

function loop() {
	place();
	if (shown) frame = requestAnimationFrame(loop);
}

function show() {
	timer = 0;
	if (!target) return;
	hold(target);
	if (!fill(target)) return;
	watcher.observe(target, {
		attributes: true,
		attributeFilter: ['title', 'data-tip-head', 'data-tip-note', 'data-tip-tone']
	});
	shown = true;
	tip.classList.add('on');
	tip.setAttribute('aria-hidden', 'false');
	cancelAnimationFrame(frame);
	loop();
}

function hide() {
	clearTimeout(timer);
	clearTimeout(touchHide);
	timer = 0;
	watcher.disconnect();
	if (target) release(target);
	if (shown) lastHidden = performance.now();
	target = null;
	shown = false;
	cancelAnimationFrame(frame);
	tip.classList.remove('on');
	tip.setAttribute('aria-hidden', 'true');
}

/** Aim at a new element: show after the delay, or at once right after another tooltip. */
function aim(el: Element, now = false) {
	if (el === target) return;
	hide();
	target = el;
	const quick = now || performance.now() - lastHidden < CHAIN;
	if (quick) show();
	else timer = window.setTimeout(show, DELAY);
}

let installed = false;

/**
 * Show `el`'s tooltip as if the pointer rested on it, for things the page never sees the
 * pointer on, like a piece on the 3D board (`el` is then an anchor kept over the piece). It
 * waits the usual delay unless `now`; `hideAfter` (ms) hides it again on its own, as after a
 * tap. Null hides it, if it is still the one showing.
 */
export function tipFor(el: Element | null, opts: { now?: boolean; hideAfter?: number } = {}) {
	if (!installed) return;
	if (!el) {
		if (target && target === pointed) hide();
		pointed = null;
		return;
	}
	pointed = el;
	aim(el, opts.now);
	if (opts.hideAfter) {
		clearTimeout(touchHide);
		touchHide = window.setTimeout(hide, opts.hideAfter);
	}
}
/** The element `tipFor` last showed. */
let pointed: Element | null = null;

/** Turn on the custom tooltips for the whole page. Call once, after `installArt`. */
export function installTooltips() {
	if (installed) return;
	installed = true;
	const root = document.documentElement.style;
	root.setProperty('--art-tip', plate());
	root.setProperty('--art-tip-pointer', pointer());

	tip = document.createElement('div');
	tip.className = 'reign-tip';
	tip.setAttribute('role', 'tooltip');
	tip.setAttribute('aria-hidden', 'true');
	tip.innerHTML =
		'<div class="tip-head"></div><div class="tip-body"></div>' +
		'<div class="tip-note"><img alt="" /><span></span></div><i class="tip-pointer"></i>';
	head = tip.querySelector('.tip-head')!;
	body = tip.querySelector('.tip-body')!;
	note = tip.querySelector('.tip-note')!;
	noteIcon = note.querySelector('img')!;
	noteText = note.querySelector('span')!;
	arrow = tip.querySelector('.tip-pointer')!;
	document.body.appendChild(tip);

	// Pointer events also reach disabled buttons, where mouse events may not.
	document.addEventListener('pointerover', (e) => {
		if (e.pointerType === 'touch') return;
		const el = holder(e.target);
		if (el) aim(el);
		else if (target) hide();
	});
	document.addEventListener('pointerout', (e) => {
		if (e.pointerType === 'touch' || !target) return;
		const to = e.relatedTarget;
		if (!(to instanceof Node) || !target.contains(to)) hide();
	});
	document.addEventListener(
		'pointerdown',
		(e) => {
			if (e.pointerType !== 'touch') return hide();
			swallowClick = false;
			const el = holder(e.target);
			if (!el) return hide();
			if (el.getAttribute('aria-disabled') === 'true') {
				aim(el, true);
				clearTimeout(touchHide);
				touchHide = window.setTimeout(hide, TOUCH_HOLD);
				return;
			}
			hide();
			target = el;
			timer = window.setTimeout(() => {
				show();
				swallowClick = shown;
			}, LONG_PRESS);
		},
		true
	);
	const endTouch = (e: PointerEvent) => {
		if (e.pointerType !== 'touch') return;
		if (shown) {
			clearTimeout(touchHide);
			touchHide = window.setTimeout(hide, TOUCH_HOLD);
		} else if (timer) hide();
	};
	document.addEventListener('pointerup', endTouch, true);
	document.addEventListener('pointercancel', endTouch, true);
	document.addEventListener(
		'click',
		(e) => {
			if (!swallowClick) return;
			swallowClick = false;
			e.preventDefault();
			e.stopPropagation();
		},
		true
	);
	document.addEventListener('contextmenu', (e) => {
		if (swallowClick) e.preventDefault();
	});
	document.addEventListener('focusin', (e) => {
		const el = holder(e.target);
		if (el && el instanceof HTMLElement && el.matches(':focus-visible')) aim(el, true);
	});
	document.addEventListener('focusout', (e) => {
		if (target && e.target === target) hide();
	});
	document.addEventListener('keydown', () => hide(), true);
	addEventListener('wheel', () => hide(), { passive: true, capture: true });
	addEventListener('blur', () => hide());
}
