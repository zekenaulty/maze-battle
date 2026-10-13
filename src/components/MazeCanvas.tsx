import { useLayoutEffect, useRef, type Dispatch, type PointerEvent, type SetStateAction, type WheelEvent } from 'react';
import type { Direction, GridPosition, MazeState } from '../domain/types';
import type { MazeVisibilitySnapshot } from '../domain/maze/visibility';
import { drawMaze, type MazeRenderMode, onMazeSpritesReady } from './maze/drawMaze';
import { cameraCellSize, createMazeCamera, panMazeCamera, zoomMazeCamera, type MazeCameraState, type MazeViewport } from './maze/mazeCamera';
import { mazeTileAt } from './maze/mazeHitTest';

interface MazeCanvasProps {
  maze: MazeState;
  chests: GridPosition[];
  facing: Direction;
  visibility: MazeVisibilitySnapshot;
  camera: MazeCameraState;
  mode: MazeRenderMode;
  onCameraChange: Dispatch<SetStateAction<MazeCameraState>>;
  onTileClick?: (position: GridPosition) => void;
  viewport?: MazeViewport;
  origin?: GridPosition;
  frameKey?: string;
  pending?: boolean;
  onSizeChange?: (size: { width: number; height: number }) => void;
}

const PLAYER_ANIMATION_MS = 180;
const WHEEL_ZOOM_STEP = 0.12;

export function MazeCanvas({ maze, chests, facing, visibility, camera, mode, onCameraChange, onTileClick,
  viewport, origin, frameKey, pending, onSizeChange }: MazeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const measured = useRef('');
  const dragRef = useRef<{ camera: MazeCameraState; mode: MazeRenderMode; pointerId: number; startX: number; startY: number; moved: boolean;
    viewport?: MazeViewport; origin?: GridPosition; frameKey?: string } | undefined>(undefined);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) {
      return undefined;
    }

    let frameId = 0;
    let animationId = 0;

    const render = () => {
      const bounds = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.floor(bounds.width));
      const height = Math.max(1, Math.floor(bounds.height));
      const key = `${width}:${height}`;
      if (measured.current !== key) { dragRef.current = undefined; measured.current = key; onSizeChange?.({ width, height }); }
      const ratio = window.devicePixelRatio || 1;
      const pixelWidth = Math.floor(width * ratio);
      const pixelHeight = Math.floor(height * ratio);

      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }

      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawMaze(context, { width, height }, maze, chests, facing, Date.now(), { camera, mode, visibility, viewport, artOrigin: origin });
    };

    const scheduleRender = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(render);
    };

    const resizeObserver = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(scheduleRender);
    resizeObserver?.observe(canvas);
    const unsubscribeSprites = onMazeSpritesReady(scheduleRender);
    if (mode === 'camera') {
      animationId = window.setInterval(scheduleRender, PLAYER_ANIMATION_MS);
    }

    render();

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearInterval(animationId);
      resizeObserver?.disconnect();
      unsubscribeSprites();
    };
  }, [maze, chests, facing, visibility, camera, mode, viewport, origin, onSizeChange]);

  const handleWheel = (event: WheelEvent<HTMLCanvasElement>) => {
    if (mode !== 'camera') {
      return;
    }

    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    onCameraChange((current) => zoomMazeCamera(current, direction * WHEEL_ZOOM_STEP));
  };

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 || !event.isPrimary || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || document.querySelector('dialog[open]')) {
      if (!event.isPrimary && dragRef.current) dragRef.current.moved = true;
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      camera,
      mode,
      viewport, origin, frameKey,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas || drag.pointerId !== event.pointerId) {
      return;
    }
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 6) drag.moved = true;
    if (mode !== 'camera') return;

    const bounds = canvas.getBoundingClientRect();
    const size = { width: Math.max(1, Math.floor(bounds.width)), height: Math.max(1, Math.floor(bounds.height)) };
    const area = drag.viewport ?? createMazeCamera(maze, size, drag.camera);
    const cellSize = Math.max(1, cameraCellSize(size, area));
    const deltaColumns = Math.round((drag.startX - event.clientX) / cellSize);
    const deltaRows = Math.round((drag.startY - event.clientY) / cellSize);

    if (deltaRows !== 0 || deltaColumns !== 0) {
      onCameraChange(drag.origin ? { ...drag.camera, mode: 'manual', origin: {
        row: Math.max(Number.MIN_SAFE_INTEGER, Math.min(Number.MAX_SAFE_INTEGER - area.rows, drag.origin.row + deltaRows)),
        column: Math.max(Number.MIN_SAFE_INTEGER, Math.min(Number.MAX_SAFE_INTEGER - area.columns, drag.origin.column + deltaColumns)),
      } } : panMazeCamera(maze, size, drag.camera, deltaRows, deltaColumns));
    }
  };

  const clearDrag = (event: PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = undefined;
    }
  };

  const finishPointer = (event: PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    clearDrag(event);
    if (!drag || drag.pointerId !== event.pointerId || drag.moved || drag.mode !== mode || drag.frameKey !== frameKey ||
      Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 6 || document.querySelector('dialog[open]')) return;
    const tile = mazeTileAt(maze, event.currentTarget.getBoundingClientRect(), drag.camera, mode, event.clientX, event.clientY, viewport);
    if (tile && visibility.visible.has(`${tile.row}:${tile.column}`)) onTileClick?.({
      row: tile.row + (origin?.row ?? 0), column: tile.column + (origin?.column ?? 0),
    });
  };

  return (
    <canvas
      ref={canvasRef}
      className="maze-canvas"
      aria-label="Dungeon map"
      aria-busy={pending || undefined}
      data-row-start={origin?.row} data-column-start={origin?.column}
      data-rows={viewport?.rows} data-columns={viewport?.columns} data-frame={frameKey}
      title="Click a visible tile to walk; drag to pan"
      onPointerCancel={clearDrag}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointer}
      onLostPointerCapture={clearDrag}
      onWheel={handleWheel}
    />
  );
}
