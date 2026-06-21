import { useEffect, useRef } from 'react';
import type { Direction, GridPosition, MazeState } from '../domain/types';
import { drawMaze, onMazeSpritesReady } from './maze/drawMaze';

interface MazeCanvasProps {
  maze: MazeState;
  chests: GridPosition[];
  facing: Direction;
}

const PLAYER_ANIMATION_MS = 180;

export function MazeCanvas({ maze, chests, facing }: MazeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
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
      const ratio = window.devicePixelRatio || 1;
      const pixelWidth = Math.floor(width * ratio);
      const pixelHeight = Math.floor(height * ratio);

      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }

      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawMaze(context, { width, height }, maze, chests, facing, Date.now());
    };

    const scheduleRender = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(render);
    };

    const resizeObserver = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(scheduleRender);
    resizeObserver?.observe(canvas);
    const unsubscribeSprites = onMazeSpritesReady(scheduleRender);
    animationId = window.setInterval(scheduleRender, PLAYER_ANIMATION_MS);

    render();

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearInterval(animationId);
      resizeObserver?.disconnect();
      unsubscribeSprites();
    };
  }, [maze, chests, facing]);

  return <canvas ref={canvasRef} className="maze-canvas" aria-label="Dungeon map" />;
}
