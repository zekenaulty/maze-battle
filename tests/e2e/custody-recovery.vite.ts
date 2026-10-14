import { defineConfig } from 'vite';
export default defineConfig({ cacheDir: 'test-results/.vite-custody-recovery',
  server: { host: '127.0.0.1', port: 5242, strictPort: true, hmr: false } });
