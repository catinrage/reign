import '@fontsource/pixelify-sans/500.css';
import '@fontsource/pixelify-sans/700.css';
import '@fontsource-variable/nunito';
import './styles/global.css';
import { runSandbox } from './sandbox';

async function boot() {
	await Promise.all([
		document.fonts.load('700 40px "Pixelify Sans"'),
		document.fonts.load('900 40px "Nunito Variable"')
	]).catch(() => {});
	const canvas = document.getElementById('world') as HTMLCanvasElement;
	if (new URLSearchParams(location.search).has('sandbox')) {
		runSandbox(canvas);
		return;
	}
	const { mountApp } = await import('./app');
	mountApp(canvas, document.getElementById('app')!);
}
boot();
