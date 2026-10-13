import { defineConfig } from 'vite';

export default defineConfig({
  cacheDir: '.vite-dev.canonical-quality',
  server: { host: '127.0.0.1', port: 5212, strictPort: true, hmr: false },
});
