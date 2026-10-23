import { defineConfig } from 'vite';
export default defineConfig({ cacheDir: '.vite-dev.canonical-controller-parity',
  server: { host: '127.0.0.1', port: 5466, strictPort: true, hmr: false } });
