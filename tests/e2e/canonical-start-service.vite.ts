import { defineConfig } from 'vite';
export default defineConfig({
  cacheDir: 'node_modules/.vite-canonical-start-service', envDir: false,
  server: { host: '127.0.0.1', port: 5258, strictPort: true, hmr: false },
  optimizeDeps: { entries: ['tests/e2e/canonical-start-service.html'] },
});
