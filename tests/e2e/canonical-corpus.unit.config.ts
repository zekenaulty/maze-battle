import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
const dependencyRoot = resolve(process.env.MAZE_RETURN_DEPENDENCY_ROOT ?? '.');
export default defineConfig({
  cacheDir: '.vite-dev.canonical-corpus-unit',
  resolve: { alias: [{ find: /^@noble\/hashes\/(.*)$/, replacement: `${dependencyRoot}/node_modules/@noble/hashes/$1` }] },
  test: { environment: 'node', include: ['tests/e2e/canonical-corpus.unit.test.ts'] },
});
