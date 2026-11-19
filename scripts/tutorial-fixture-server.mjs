import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
// No .env loading and no application entrypoint. Local files only, no proxy or DB.
const server = await createServer({ configFile: false, envFile: false, root, cacheDir: '.temp/ux-refine-20261106/a/vite-cache', server: { host: '127.0.0.1', port: 5181, strictPort: true } });
await server.listen();
console.log('A0 fixture: http://127.0.0.1:5181/tutorial/fixtures/index.html');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await server.close(); process.exit(0); });
