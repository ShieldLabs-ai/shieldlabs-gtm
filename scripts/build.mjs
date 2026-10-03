import { build } from 'esbuild';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

await mkdir('dist', { recursive: true });
await build({
  entryPoints: ['src/index.js'], outfile: 'dist/adapter.js', bundle: true,
  platform: 'browser', format: 'iife', globalName: 'ShieldLabsGTM',
  target: ['es2020'], minify: true, legalComments: 'linked',
  banner: { js: '/* ShieldLabs GTM adapter v1.0.0 | Apache-2.0 */' },
});
const bytes = await readFile('dist/adapter.js');
await writeFile('dist/SHA256SUMS', createHash('sha256').update(bytes).digest('hex') + '  adapter.js\n');
console.log('Built dist/adapter.js (' + bytes.length + ' bytes)');
