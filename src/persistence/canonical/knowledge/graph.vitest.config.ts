import { defineConfig } from 'vitest/config';

export default defineConfig({
  cacheDir: 'test-results/earned-graph-vite-cache',
  test: { environment: 'node', setupFiles: './vitest.setup.ts',
    exclude: ['node_modules/**', 'dist/**', 'tests/e2e/**'] },
});
