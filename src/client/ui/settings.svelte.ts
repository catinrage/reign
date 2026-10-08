import { getVolume, setVolume, type Channel } from './sound';

/**
 * Player preferences that live in this browser: volumes (owned by the sound module),
 * graphics quality (read by the scene at startup, so changing it reloads) and reduced motion.
 */

function read(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}
function write(key: string, value: string) {
	try {
		localStorage.setItem(key, value);
	} catch {
		/* private mode */
	}
}

export const CHANNELS: { id: Channel; label: string }[] = [
	{ id: 'master', label: 'Master' },
	{ id: 'sfx', label: 'Effects' },
	{ id: 'music', label: 'Music' },
	{ id: 'ambience', label: 'Fireside' }
];

class Settings {
	quality = $state<'high' | 'low'>(read('reign:quality') === 'low' ? 'low' : 'high');
	reduceMotion = $state(
		read('reign:reduceMotion') === null
			? typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
			: read('reign:reduceMotion') === '1'
	);
	volumes = $state<Record<Channel, number>>({
		master: getVolume('master'),
		sfx: getVolume('sfx'),
		music: getVolume('music'),
		ambience: getVolume('ambience')
	});

	setVolume(channel: Channel, v: number) {
		this.volumes[channel] = v;
		setVolume(channel, v);
	}

	setQuality(q: 'high' | 'low') {
		if (q === this.quality) return;
		this.quality = q;
		write('reign:quality', q);
		// The renderer is set up once, so a reload applies it (the seat is reclaimed on reconnect).
		location.reload();
	}

	setReduceMotion(on: boolean) {
		this.reduceMotion = on;
		write('reign:reduceMotion', on ? '1' : '0');
		applySettings();
	}
}

export const settings = new Settings();

export function applySettings() {
	document.body.classList.toggle('reduce-motion', settings.reduceMotion);
}
