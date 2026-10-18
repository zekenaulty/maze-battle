import { defineConfig, normalizePath } from 'vite';
import { resolve, dirname } from 'node:path';

const root = normalizePath(process.cwd()), source = normalizePath(resolve(process.env.MAZE_EXPLORATION_SOURCE_ROOT ?? root));
export default defineConfig({ cacheDir: '.vite-dev.canonical-frontier-exploration',
  // Optional read-only source overlay; the integrated parent runs without this environment variable.
  plugins: source === root ? [] : [{ name: 'exploration-source-overlay', enforce: 'pre', async resolveId(id, importer) {
    const path = id.startsWith('/src/') ? `${root}${id}`
      : id.startsWith('.') && importer ? normalizePath(resolve(dirname(importer.split('?')[0]), id)) : id;
    if (path.startsWith(`${root}/src/`)) return this.resolve(`${source}${path.slice(root.length)}`, importer, { skipSelf: true });
  } }],
  resolve: { alias: source === root ? [] : [{ find: /^@noble\/hashes\/(.*)$/, replacement: `${source}/node_modules/@noble/hashes/$1` }] },
  server: { host: '127.0.0.1', port: 5291, strictPort: true, hmr: false, fs: { allow: [root, source] } } });
