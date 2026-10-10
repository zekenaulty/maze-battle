import { useEffect, useRef } from 'react';
import type { Direction, GridPosition, MazeState } from '../../domain/types';
import type { CellAddress } from '../../domain/expedition/types';
import { cellKey } from '../../domain/maze/key';
import type { DirectedViewModel } from '../../viewModels/directedViewModel';
import { drawMaze, onMazeSpritesReady } from '../maze/drawMaze';

export function DirectedCanvas({ view }: { view: DirectedViewModel }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const spaces = new Map(view.spaces.map(entry => [entry.value.id, entry.value]));
    const global = (at: CellAddress): GridPosition => ({ row: at.row + spaces.get(at.spaceId)!.originZ,
      column: at.column + spaces.get(at.spaceId)!.originX });
    const cells = view.cells.map(entry => ({ ...global(entry.value.address), links: Object.keys(entry.value.exits) as Direction[] }));
    const active = global(view.position);
    const maze: MazeState = { rows: Math.max(...cells.map(c => c.row)) + 1,
      columns: Math.max(...cells.map(c => c.column)) + 1, cells, active, start: active, end: active, visited: [] };
    const visibility = { radius: 2, explored: new Set(cells.map(cellKey)),
      visible: new Set(view.cells.filter(c => c.status === 'current').map(c => cellKey(global(c.value.address)))) };
    const render = () => {
      const bounds = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.floor(bounds.width)), height = Math.max(1, Math.floor(bounds.height));
      const ratio = devicePixelRatio || 1;
      canvas.width = Math.floor(width * ratio); canvas.height = Math.floor(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      // A fixed room view on phones, learned-map view on desktop. Neither uses hidden geometry.
      const room = spaces.get(view.position.spaceId)!;
      const small = width < 650;
      const columns = small ? Math.max(7, room.columns + 2) : maze.columns + 2;
      const rows = small ? Math.max(7, room.rows + 2) : maze.rows + 2;
      const columnStart = small ? room.originX - Math.floor((columns - room.columns) / 2) : -1;
      const rowStart = small ? room.originZ - Math.floor((rows - room.rows) / 2) : -1;
      const viewport = { rows, columns, rowStart, columnStart, rowEnd: rowStart + rows, columnEnd: columnStart + columns };
      const size = Math.floor(Math.min((width - 16) / columns, (height - 16) / rows));
      const left = Math.floor((width - size * columns) / 2) - columnStart * size;
      const top = Math.floor((height - size * rows) / 2) - rowStart * size;
      ctx.fillStyle = '#040814'; ctx.fillRect(0, 0, width, height);
      // The legacy renderer outlines unknown rectangular bounds. Clip to remembered cells.
      ctx.save(); ctx.beginPath();
      const edge = Math.max(2, size * 0.12);
      for (const cell of cells) ctx.rect(left + cell.column * size - edge, top + cell.row * size - edge, size + 2 * edge, size + 2 * edge);
      ctx.clip();
      drawMaze(ctx, { width, height }, maze, [], 'south', 0, { viewport, showStairs: false, visibility });
      ctx.restore();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `${Math.round(size * 0.45)}px "Segoe UI Emoji", sans-serif`;
      for (const entry of view.features) {
        const at = global(entry.value.position);
        if (at.column < columnStart || at.column >= columnStart + columns || at.row < rowStart || at.row >= rowStart + rows) continue;
        ctx.globalAlpha = entry.status === 'current' ? 1 : 0.5;
        const symbol = entry.value.kind === 'lever' ? '\u{1F579}' : entry.value.kind === 'door' ? '\u{1F6AA}'
          : entry.value.kind === 'trap' ? '\u26A0' : '\u{1F4E6}';
        ctx.fillText(symbol, left + (at.column + 0.5) * size, top + (at.row + 0.5) * size);
      }
      ctx.globalAlpha = 1;
    };
    const resize = new ResizeObserver(render); resize.observe(canvas);
    const unsubscribe = onMazeSpritesReady(render); render();
    return () => { resize.disconnect(); unsubscribe(); };
  }, [view]);
  return <canvas ref={ref} aria-label="Discovered dungeon" />;
}
