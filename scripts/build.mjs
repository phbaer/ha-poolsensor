import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const outfile = process.argv[2] || 'dist/ha-poolsensor.js';

await mkdir(dirname(outfile), { recursive: true });

await build({
  bundle: true,
  entryPoints: ['ha-poolsensor.js'],
  format: 'esm',
  outfile,
  legalComments: 'inline',
  minify: true,
  sourcemap: false,
  target: ['es2022'],
});
