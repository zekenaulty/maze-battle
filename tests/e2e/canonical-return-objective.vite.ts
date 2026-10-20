import { defineConfig, normalizePath } from 'vite';
import { resolve } from 'node:path';

const root = normalizePath(process.cwd());
const dependencies = normalizePath(resolve(process.env.MAZE_RETURN_DEPENDENCY_ROOT ?? root));
export default defineConfig({
  cacheDir: '.vite-dev.canonical-return-objective',
  resolve: { alias: dependencies === root ? [] : [
    { find: /^@noble\/hashes\/(.*)$/, replacement: `${dependencies}/node_modules/@noble/hashes/$1` },
  ] },
  server: { host: '127.0.0.1', port: 5266, strictPort: true, hmr: false, fs: { allow: [root, dependencies] } },
});
