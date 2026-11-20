import { build } from 'vite';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
await build({ root, configFile: false, envFile: false, cacheDir: '.temp/ux-refine-20261106/a/vite-cache', build: { outDir: '.temp/ux-refine-20261106/a/fixture-dist', emptyOutDir: true, rollupOptions: { input: fileURLToPath(new URL('../tutorial/fixtures/index.html', import.meta.url)) } } });
