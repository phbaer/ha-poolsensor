import { build } from 'esbuild';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const outfile = process.argv[2] || 'dist/ha-poolsensor.js';

await mkdir(dirname(outfile), { recursive: true });

const result = await build({
  bundle: true,
  entryPoints: ['ha-poolsensor.js'],
  format: 'esm',
  outfile,
  legalComments: 'inline',
  metafile: true,
  minify: true,
  sourcemap: false,
  target: ['es2022'],
});

const translationWasBundled = Object.keys(result.metafile.inputs)
  .some((input) => input.endsWith('translations.js'));
const output = await readFile(outfile, 'utf8');

if (!translationWasBundled || output.includes("from './translations.js'")) {
  throw new Error('The release asset must inline translations.js.');
}
