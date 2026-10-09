import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

const serverPort = Number(process.env.PORT ?? 8787);

export default defineConfig(({ mode }) => {
	/** The offline build (play against bots, no server): see src/client/offline. */
	const offline = mode === 'offline';
	return {
		root: 'src/client',
		publicDir: 'public',
		plugins: [svelte()],
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
			environment: 'node'
		}
	};
});
