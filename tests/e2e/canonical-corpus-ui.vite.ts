import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const fixture = 'http://127.0.0.1:5446/tests/e2e/canonical-corpus-ui.html';
const observe = (statement: string) => `if (location.href === ${JSON.stringify(fixture)}) { ${statement} }\n`;
export default defineConfig({
  envDir: false, cacheDir: '.vite-dev.canonical-corpus-ui',
  server: { host: '127.0.0.1', port: 5446, strictPort: true, hmr: false },
  plugins: [react(), {
    name: 'corpus-ui-actual-app-observers', enforce: 'pre',
    transform(source, id) {
      const file = id.replaceAll('\\', '/');
      const captures = [
        ['/src/hooks/useGameSession.ts', 'return { ...view, controller: session,',
          'globalThis.__corpusUiSession = session;'],
        ['/src/components/MazeCanvas.tsx', 'drawMaze(context, { width, height }, maze, chests, facing, Date.now(),',
          'globalThis.__corpusUiCanvas = structuredClone({ maze, chests, facing, visibility, camera, mode, viewport, origin, frameKey, pending, width, height });'],
        ['/src/components/maze/KnownRooms.tsx', 'const nodes = rooms.page?.items ?? [];',
          'globalThis.__corpusUiRooms = structuredClone({ snapshot, page: rooms.page, error: rooms.error, busy: rooms.busy, number: rooms.number });'],
      ];
      const capture = captures.find(([suffix]) => file.endsWith(suffix));
      if (!capture) return;
      const [, anchor, statement] = capture;
      if (source.split(anchor).length !== 2) throw Error(`App observation seam changed: ${file}`);
      return source.replace(anchor, observe(statement) + anchor);
    },
  }],
});
