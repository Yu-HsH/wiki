import { cp, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const output = resolve(process.argv[2] ?? '.temp/item-effects-review');
await mkdir(output, { recursive: true });
await build({
  entryPoints: ['scripts/item-effects-review.jsx'],
  bundle: true,
  format: 'iife',
  minify: true,
  outfile: resolve(output, 'review.js'),
  define: { 'import.meta.env.BASE_URL': JSON.stringify('./'), 'process.env.NODE_ENV': JSON.stringify('production') },
});
const assets = 'group-items-final-s5';
await Promise.all(['icons/256', 'icons/precomposed', 'audio/selected', 'vfx/ink'].map(part =>
  cp(resolve('public', assets, part), resolve(output, assets, part), { recursive: true })));
for (const file of ['sfx-v05/page-turn-clean.wav', 'ui-v02/request-denied.wav']) {
  await mkdir(resolve(output, 'audio', file, '..'), { recursive: true });
  await cp(resolve('public/audio', file), resolve(output, 'audio', file));
}
await writeFile(resolve(output, 'index.html'), `<!doctype html>
<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Wiki Race 아이템 연출 검토</title><link rel="stylesheet" href="./review.css">
<div id="root"></div><script defer src="./review.js"></script></html>`);
console.log(output);
