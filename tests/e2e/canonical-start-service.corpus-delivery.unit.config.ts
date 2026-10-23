import { defineConfig } from 'vitest/config';
export default defineConfig({
  cacheDir: '.vite-dev.canonical-start-service',
  test: { environment: 'node', include: ['tests/e2e/canonical-start-service.corpus-delivery.unit.test.ts'] },
});
