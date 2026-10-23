import { defineConfig } from 'vitest/config';
export default defineConfig({ cacheDir: '.vite-dev.canonical-preacceptance-unit',
  test: { environment: 'node', include: ['tests/e2e/canonical-start-service.corpus-preacceptance.unit.test.ts'] } });
