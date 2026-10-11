import { defineConfig } from 'vite';
import { execFileSync } from 'node:child_process';

export default defineConfig({
  cacheDir: '.vite-dev.issue-5',
  plugins: process.env.COMPOSITOR_BASELINE === '1' ? [{
    name: 'issue-5-original-renderer', enforce: 'pre',
    load(id) {
      if (id.replaceAll('\\', '/').endsWith('/src/components/maze/drawMaze.ts')) {
        return execFileSync('git', ['show', '5c12b496c7cc3761ca66deccc2c80ee2024f7d3d:src/components/maze/drawMaze.ts'], { encoding: 'utf8' });
      }
    },
  }] : [],
});
