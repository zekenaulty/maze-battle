import { defineConfig } from 'vite';

export default defineConfig({ cacheDir: '.vite-dev.canonical-exploration-prefix',
  server: { host: '127.0.0.1', port: 5418, strictPort: true, hmr: false } });
