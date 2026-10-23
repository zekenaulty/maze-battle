import { defineConfig } from 'vite';
export default defineConfig({ cacheDir: '.vite-dev.canonical-corpus-navigation',
  server: { host: '127.0.0.1', port: 5456, strictPort: true, hmr: false } });
