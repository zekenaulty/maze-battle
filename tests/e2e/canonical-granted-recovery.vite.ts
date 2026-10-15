import { defineConfig } from 'vite';
export default defineConfig({ cacheDir: '.vite-canonical-game-map/granted-recovery',
  server: { host: '127.0.0.1', port: 5268, strictPort: true, hmr: false } });
