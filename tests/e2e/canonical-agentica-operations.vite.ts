import { defineConfig } from 'vite';
export default defineConfig({ server: { host: '127.0.0.1', port: 5242, strictPort: true, hmr: false },
  optimizeDeps: { entries: ['tests/e2e/canonical-agentica-operations.html'] } });
