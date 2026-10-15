import { defineConfig } from 'vite';
export default defineConfig({ server: { host: '127.0.0.1', port: 5262, strictPort: true, hmr: false },
  optimizeDeps: { entries: ['tests/e2e/canonical-decision.html'] } });
