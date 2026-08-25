/* Bundles script./gameCheck.ts through Vite (so the `@/` alias and TS
 * syntax resolve exactly as they do in the app) and runs it in Node. */

import { build } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = fileURLToPath(new URL('../node_modules/.tmp/gamecheck', import.meta.url));

rmSync(outDir, { recursive: true, force: true });

await build({
  root,
  configFile: false,
  logLevel: 'error',
  resolve: {
    alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) },
  },
  build: {
    outDir,
    emptyOutDir: true,
    ssr: true,
    minify: false,
    target: 'node22',
    rollupOptions: {
      input: fileURLToPath(new URL('./gameCheck.ts', import.meta.url)),
      output: { entryFileNames: 'gameCheck.mjs', format: 'es' },
    },
  },
});

const result = spawnSync(process.execPath, [`${outDir}/gameCheck.mjs`], {
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
