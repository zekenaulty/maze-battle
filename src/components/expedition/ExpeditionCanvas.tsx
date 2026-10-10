import { useEffect, useRef } from 'react';
import type { Direction, MazeState } from '../../domain/types';
import type { ExpeditionCheckpoint, SpaceGeometry, SpaceSpec } from '../../domain/expedition/types';
import { observeExpedition } from '../../domain/expedition/observation';
import { cellKey } from '../../domain/maze/key';
import { drawMaze, onMazeSpritesReady } from '../maze/drawMaze';
import type { KnownFrontier } from '../../domain/expedition/streaming/types';

export function ExpeditionCanvas({ checkpoint, spec, geometry, facing, frontiers = [], minimumViewCells = 0 }: {
  checkpoint: ExpeditionCheckpoint; spec: SpaceSpec; geometry: SpaceGeometry; facing: Direction; frontiers?: KnownFrontier[]; minimumViewCells?: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const node = canvas.current;
    const context = node?.getContext('2d');
    if (!node || !context) return;
    const observation = observeExpedition(checkpoint, spec, geometry);
    const known = Object.values(checkpoint.knowledge.cells).filter(cell => cell.spaceId === spec.id);
    const explored = new Set(known.map(cellKey));
    const visible = new Set(observation.visibleCells.map(cellKey));
    const knownOpenings = Object.values(checkpoint.knowledge.openings).filter(port => port.spaceId === spec.id);
    // Renderer-only boundary links expose observed door gaps, never change walkability.
    const cells = geometry.cells.map(cell => ({ ...cell, links: [...cell.links,
      ...knownOpenings.filter(port => port.row === cell.row && port.column === cell.column).map(port => port.direction)] }));
    const maze: MazeState = { rows: spec.rows, columns: spec.columns, cells,
      active: checkpoint.position, start: checkpoint.position, end: checkpoint.position, visited: [],
    };
    const render = () => {
      const bounds = node.getBoundingClientRect();
      const width = Math.max(1, Math.floor(bounds.width));
      const height = Math.max(1, Math.floor(bounds.height));
      const ratio = devicePixelRatio || 1;
      node.width = Math.floor(width * ratio);
      node.height = Math.floor(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const rows = Math.max(spec.rows, minimumViewCells);
      const columns = Math.max(spec.columns, minimumViewCells);
      const rowStart = -Math.floor((rows - spec.rows) / 2);
      const columnStart = -Math.floor((columns - spec.columns) / 2);
      drawMaze(context, { width, height }, maze,
        Object.values(checkpoint.knowledge.chests).filter(chest => chest.spaceId === spec.id && !chest.opened), facing, Date.now(), {
          viewport: { rowStart, columnStart, rowEnd: rowStart + rows, columnEnd: columnStart + columns, rows, columns },
          showStairs: false, visibility: { radius: 4, explored, visible },
        });
      const size = Math.floor(Math.min((width - 16) / columns, (height - 16) / rows));
      const left = Math.floor((width - size * columns) / 2) - columnStart * size;
      const top = Math.floor((height - size * rows) / 2) - rowStart * size;
      for (const port of [...knownOpenings, ...frontiers]) {
        const dx = port.direction === 'east' ? 1 : port.direction === 'west' ? -1 : 0;
        const dy = port.direction === 'south' ? 1 : port.direction === 'north' ? -1 : 0;
        const x = left + (port.column + 0.5) * size;
        const y = top + (port.row + 0.5) * size;
        context.strokeStyle = visible.has(cellKey(port)) ? '#e3c465' : '#756b4b';
        context.lineWidth = Math.max(2, size * 0.1);
        if (frontiers.some(frontier => frontier.id === port.id)) {
          context.strokeRect(x + dx * size * 0.35 - size * 0.1, y + dy * size * 0.35 - size * 0.1, size * 0.2, size * 0.2);
          continue;
        }
        context.beginPath(); context.moveTo(x + dx * size * 0.25, y + dy * size * 0.25); context.lineTo(x + dx * size * 0.45, y + dy * size * 0.45); context.stroke();
        context.fillStyle = context.strokeStyle;
        context.beginPath();
        context.arc(x + dx * size * 0.45, y + dy * size * 0.45, Math.max(2, size * 0.05), 0, Math.PI * 2);
        context.fill();
      }
    };
    const resize = new ResizeObserver(render);
    resize.observe(node);
    const unsubscribe = onMazeSpritesReady(render);
    render();
    return () => { resize.disconnect(); unsubscribe(); };
  }, [checkpoint, spec, geometry, facing, frontiers, minimumViewCells]);
  return <canvas ref={canvas} aria-label="Expedition room" />;
}
