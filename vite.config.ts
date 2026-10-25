import { svelte } from '@sveltejs/vite-plugin-svelte';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv, type Plugin } from 'vite';

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

/** CrazyGames' SDK, in the page of the CrazyGames build (see src/client/platform/crazygames.ts). */
function crazyGamesSdk(): Plugin {
	return {
		name: 'reign-crazygames-sdk',
		transformIndexHtml: () => [{ tag: 'script', attrs: { src: 'https://sdk.crazygames.com/crazygames-sdk-v3.js' }, injectTo: 'head-prepend' }]
	};
}

/** Builds for other sites (see docs/publishing.md and src/client/platform): mode → platform. */
const SITES: Record<string, 'itch' | 'crazygames'> = { itch: 'itch', crazygames: 'crazygames' };

export default defineConfig(({ mode }) => {
	/** The offline build (play against bots, no server): see src/client/offline. */
	const offline = mode === 'offline';
	const site = SITES[mode] ?? null;
	if (site) {
		// A copy on another site has to know where the server is, and reach it over https (the
		// sites are https, and browsers block plain http from them). http://localhost is for testing.
		const url = loadEnv(mode, process.cwd(), 'VITE_').VITE_SERVER_URL ?? '';
		if (!/^(https:\/\/[^/]+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$)/.test(url)) {
			throw new Error(
				`The ${site} build needs VITE_SERVER_URL set to the game server's https address, e.g.\n` +
					`  VITE_SERVER_URL=https://reign.example.com pnpm build:${site}\n(see docs/publishing.md)`
			);
		}
	}
	return {
		root: 'src/client',
		publicDir: 'public',
		// .env files sit next to package.json (with compose.yaml's), not in src/client.
		envDir: process.cwd(),
		// Another site serves the game from a folder of its own, so every path is relative.
		base: site ? './' : '/',
		// No service worker inside another site's frame.
		plugins: [svelte(), ...(site ? [] : [serviceWorker()]), ...(site === 'crazygames' ? [crazyGamesSdk()] : [])],
		define: {
			__REIGN_OFFLINE__: JSON.stringify(offline),
			__REIGN_PLATFORM__: JSON.stringify(site ?? 'web')
		},
		build: {
			outDir: offline ? '../../dist/offline' : site ? `../../dist/${site}` : '../../dist/client',
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
