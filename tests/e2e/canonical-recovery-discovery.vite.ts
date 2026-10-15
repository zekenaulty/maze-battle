import { defineConfig } from 'vite';
export default defineConfig({ cacheDir: 'test-results/canonical-recovery-discovery-cache',
  server: { host: '127.0.0.1', port: 5270, strictPort: true, hmr: false },
  optimizeDeps: { entries: ['tests/e2e/canonical-recovery-discovery.html'] } });
