import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    exclude: ['node_modules/**', 'dist/**', 'tests/e2e/**', 'scripts/d1-measurements/worker-output.test.mjs'],
    setupFiles: './vitest.setup.ts',
  },
});
