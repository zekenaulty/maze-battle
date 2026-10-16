import { defineConfig } from 'vite';
export default defineConfig({ server: { host: '127.0.0.1', port: 5268, strictPort: true, hmr: false },
  optimizeDeps: { entries: ['tests/e2e/canonical-pregrant-proof.html'] } });
