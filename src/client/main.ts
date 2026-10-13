import '@fontsource/pixelify-sans/500.css';
import '@fontsource/pixelify-sans/700.css';
import '@fontsource-variable/nunito';
import './styles/global.css';
import { bootDone, bootLabel, bootStep, nextPaint } from './boot';
import { initLanguage, t } from './i18n/index.svelte';
import { inject } from '@vercel/analytics';

async function boot() {
	bootStep(0.12, 0.3);
	await Promise.all([
		document.fonts.load('700 40px "Pixelify Sans"'),
		document.fonts.load('700 40px "Reign Px"', 'C0'),
		document.fonts.load('900 40px "Nunito Variable"'),
		initLanguage()
	]).catch(() => {});
	bootLabel(t('Loading'));
	const canvas = document.getElementById('world') as HTMLCanvasElement;
	if (new URLSearchParams(location.search).has('sandbox')) {
		const { runSandbox } = await import('./sandbox');
		runSandbox(canvas);
		bootDone();
		return;
	}
	// The game itself is most of what there is to download.
	bootStep(0.3, 0.62, t('Unpacking the realm'));
	const { mountApp, whenReady } = await import('./app');
	bootStep(0.62, 0.72, t('Carving the island'));
	await nextPaint();
	mountApp(canvas, document.getElementById('app')!);
	await whenReady();
}
// Whatever happens, the loading screen doesn't stay up over the page.
boot().finally(bootDone);

// Inject Vercel Web Analytics
inject();

// Installs as an app and opens from the stored copy (see pwa/sw.js). Built versions only: the dev
// server's files change on every save.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
	addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
