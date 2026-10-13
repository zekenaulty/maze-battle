import { defineConfig } from 'vite';
export default defineConfig({ cacheDir: '.vite-canonical-game-map/agentica',
  server: { host: '127.0.0.1', port: 5231, strictPort: true, hmr: false } });
