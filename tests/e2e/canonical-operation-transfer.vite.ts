import { defineConfig } from 'vite';
export default defineConfig({ envDir: false, server: { host: '127.0.0.1', port: 5258, strictPort: true, hmr: false },
  optimizeDeps: { entries: ['tests/e2e/canonical-operation-transfer.html'] } });
