import { defineConfig } from 'vite';
export default defineConfig({ cacheDir: 'test-results/.vite-canonical-agentica-action-guards',
  server: { host: '127.0.0.1', port: 5237, strictPort: true, hmr: false } });
