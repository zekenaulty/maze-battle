import { defineConfig } from 'vite';
export default defineConfig({ cacheDir: '.vite-dev.canonical-frontier',
  server: { host: '127.0.0.1', port: 5290, strictPort: true, hmr: false } });
