import { defineConfig } from 'vitest/config';

export default defineConfig({
  cacheDir: '.vite-dev.canonical-quality/unit',
  test: { environment: 'node', include: ['src/persistence/canonical/world/quality*.test.ts',
    'src/domain/expedition/topology/modules/*.test.ts', 'src/domain/maze/module*.test.ts'] },
});
