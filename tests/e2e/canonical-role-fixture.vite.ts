import { defineConfig } from 'vite';

export default defineConfig({
  cacheDir: 'node_modules/.vite-canonical-roles',
  server: { host: '127.0.0.1', port: 5210, strictPort: true, hmr: false },
});
