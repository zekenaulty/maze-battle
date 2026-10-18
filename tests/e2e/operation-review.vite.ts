import { defineConfig, normalizePath } from 'vite';
import { resolve } from 'node:path';

const root = normalizePath(process.cwd());
const dependencies = normalizePath(resolve(process.env.MAZE_OPERATION_REVIEW_DEPENDENCY_ROOT ?? root));
export default defineConfig({ cacheDir: '.vite-dev.operation-review',
  resolve: { alias: dependencies === root ? [] : [{ find: /^@noble\/hashes\/(.*)$/, replacement: `${dependencies}/node_modules/@noble/hashes/$1` }] },
  server: { host: '127.0.0.1', port: 5242, strictPort: true, hmr: false, fs: { allow: [root, dependencies] } } });
