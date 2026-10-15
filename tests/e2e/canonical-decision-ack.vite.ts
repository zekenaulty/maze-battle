import { defineConfig } from 'vite';
export default defineConfig({ server: { host: '127.0.0.1', port: 5264, strictPort: true, hmr: false },
  envDir: false, cacheDir: 'node_modules/.vite-canonical-decision-ack',
  optimizeDeps: { entries: ['tests/e2e/canonical-decision-ack.html'] } });
