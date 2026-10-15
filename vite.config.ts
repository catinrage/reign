import { svelte } from '@sveltejs/vite-plugin-svelte';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

const serverPort = Number(process.env.PORT ?? 8787);

/**
 * Writes /sw.js for a build (see src/client/pwa/sw.js): the page and its code to store on install,
 * and every hashed file of the build, with a version that changes whenever any of them does.
 */
function serviceWorker(): Plugin {
	return {
		name: 'reign-service-worker',
		apply: 'build',
		generateBundle(_, bundle) {
			const files = Object.keys(bundle).map((f) => `/${f}`);
			const assets = files.filter((f) => f.startsWith('/assets/')).sort();
			const shell = ['/', ...assets.filter((f) => /\.(js|css)$/.test(f))];
			const page = bundle['index.html'];
			const template = readFileSync(new URL('src/client/pwa/sw.js', import.meta.url), 'utf8');
			const version = createHash('sha256')
				.update(assets.join('\n'))
				.update(page?.type === 'asset' ? page.source : '')
				.update(template)
				.digest('hex')
				.slice(0, 12);
			const source = template
				.replace('__VERSION__', JSON.stringify(version))
				.replace('__SHELL__', JSON.stringify(shell))
				.replace('__ASSETS__', JSON.stringify(assets));
			this.emitFile({ type: 'asset', fileName: 'sw.js', source });
		}
	};
}

export default defineConfig(({ mode }) => {
	/** The offline build (play against bots, no server): see src/client/offline. */
	const offline = mode === 'offline';
	return {
		root: 'src/client',
		publicDir: 'public',
		plugins: [svelte(), serviceWorker()],
		define: { __REIGN_OFFLINE__: JSON.stringify(offline) },
		build: {
			outDir: offline ? '../../dist/offline' : '../../dist/client',
			emptyOutDir: true,
			chunkSizeWarningLimit: 2000
		},
		server: {
			port: 5173,
			host: true,
			proxy: {
				'/ws': { target: `ws://localhost:${serverPort}`, ws: true },
				'/api': { target: `http://localhost:${serverPort}` }
			}
		},
		test: {
			root: '.',
			include: ['tests/**/*.test.ts'],
			environment: 'node',
			// Some tests play whole games with bots in every seat: a few seconds alone, longer with
			// every file running at once.
			testTimeout: 20_000
		}
	};
});
