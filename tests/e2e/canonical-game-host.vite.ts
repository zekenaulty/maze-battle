import { defineConfig } from 'vite';
export default defineConfig({ cacheDir: '.vite-canonical-game-host',
  server: { host: '127.0.0.1', port: 5234, strictPort: true, hmr: false } });
