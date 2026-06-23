import type { Direction, GridPosition, MazeState } from '../../domain/types';
import { linkMap } from '../../domain/maze/movement';
import { cellKey } from '../../domain/maze/key';
import { isCellExplored, type MazeVisibilitySnapshot } from '../../domain/maze/visibility';
import chestClosedUrl from '../../assets/sprites/chest-closed.png';
import { cameraCellSize, createMazeCamera, DEFAULT_MAZE_CAMERA, isInViewport, type MazeCameraState, type MazeViewport } from './mazeCamera';

interface CanvasSize {
  width: number;
  height: number;
}

interface WallNetwork {
  horizontal: Set<string>;
  vertical: Set<string>;
}

interface WallConnections {
  north: boolean;
  south: boolean;
  west: boolean;
  east: boolean;
}

interface SpriteAsset {
  url: string;
  callbacks: Set<() => void>;
  failed: boolean;
  image?: HTMLImageElement;
}

interface PlayerFrame {
  asset: SpriteAsset;
  sourceAnchorX: number;
  sourceAnchorY: number;
}

export type MazeRenderMode = 'camera' | 'overview';

interface MazeRenderOptions {
  camera?: MazeCameraState;
  mode?: MazeRenderMode;
  visibility?: MazeVisibilitySnapshot;
}

interface RenderBounds {
  rowStart: number;
  rowEnd: number;
  columnStart: number;
  columnEnd: number;
  rows: number;
  columns: number;
}

const PLAYER_TOKEN = String.fromCodePoint(0x1f9d9);
const CHEST_TOKEN = String.fromCodePoint(0x1f4e6);
const CELL_PADDING = 8;
const PLAYER_FRAME_MS = 180;
const PLAYER_FRAME_SOURCE_HEIGHT = 176;
const PLAYER_FRAME_TARGET_HEIGHT = 1.1;
const PLAYER_FRAME_ANCHOR_X = 80;
const PLAYER_FRAME_ANCHOR_Y = 152;
const floorPatternCache = new Map<number, HTMLCanvasElement>();
const CHEST_SPRITE = createSpriteAsset(chestClosedUrl);
const KNIGHT_FRAMES: Record<Direction, PlayerFrame[]> = createKnightFrames();
const MAZE_COLORS = {
  backgroundStart: '#040814',
  backgroundEnd: '#0b1020',
  floor: '#0b1020',
  floorBase: '#242834',
  floorBrick: '#303642',
  floorBrickAlt: '#272c37',
  floorMortar: '#111620',
  floorHighlight: '#4b5260',
  floorShadow: '#171b24',
  wallMortar: '#05070d',
  wallStroke: '#151a23',
  wallShadow: '#202734',
  wallFace: '#59616c',
  wallFaceAlt: '#68717b',
  wallHighlight: '#88929d',
  stairWell: '#090d15',
  stairStone: '#4e5661',
  stairStoneAlt: '#606975',
  stairEdge: '#151a23',
  stairGlowUp: 'rgba(154, 167, 255, 0.7)',
  stairGlowDown: 'rgba(106, 160, 255, 0.7)',
  playerShadow: 'rgba(5, 10, 20, 0.9)',
};

export function onMazeSpritesReady(callback: () => void) {
  const unsubscribePlayer = subscribeSpriteSet(playerSpriteAssets(), callback);
  const unsubscribeChest = subscribeSprite(CHEST_SPRITE, callback);
  return () => {
    unsubscribePlayer();
    unsubscribeChest();
  };
}

export function drawMaze(
  context: CanvasRenderingContext2D,
  size: CanvasSize,
  maze: MazeState,
  chests: GridPosition[] = [],
  facing: Direction = 'south',
  now = Date.now(),
  options: MazeRenderOptions = {},
) {
  drawBackground(context, size);

  if (options.mode === 'overview') {
    drawMazeOverview(context, size, maze, chests, options.visibility);
    return;
  }

  const viewport = createMazeCamera(maze, size, options.camera ?? DEFAULT_MAZE_CAMERA);
  const cellSize = cameraCellSize(size, viewport);
  if (cellSize < 4) {
    return;
  }

  const gridWidth = cellSize * viewport.columns;
  const gridHeight = cellSize * viewport.rows;
  const viewportX = Math.floor((size.width - gridWidth) / 2);
  const viewportY = Math.floor((size.height - gridHeight) / 2);
  const offsetX = viewportX - viewport.columnStart * cellSize;
  const offsetY = viewportY - viewport.rowStart * cellSize;

  drawFloors(context, maze, cellSize, offsetX, offsetY, viewport);
  drawLayoutOverlays(context, maze, cellSize, offsetX, offsetY, viewport);
  drawWalls(context, maze, cellSize, offsetX, offsetY, viewport);
  drawChests(context, chests, cellSize, offsetX, offsetY, viewport, options.visibility);
  if (isInViewport(maze.start, viewport) && isCellExplored(options.visibility, maze.start)) {
    drawStairs(context, maze.start, cellSize, offsetX, offsetY, 'up');
  }
  if (isInViewport(maze.end, viewport) && isCellExplored(options.visibility, maze.end)) {
    drawStairs(context, maze.end, cellSize, offsetX, offsetY, 'down');
  }
  drawPlayer(context, maze.active, facing, cellSize, offsetX, offsetY, now);
  drawFog(context, maze, cellSize, offsetX, offsetY, viewport, options.visibility);
}

function drawBackground(context: CanvasRenderingContext2D, size: CanvasSize) {
  const gradient = context.createLinearGradient(0, 0, size.width, size.height);
  gradient.addColorStop(0, MAZE_COLORS.backgroundStart);
  gradient.addColorStop(1, MAZE_COLORS.backgroundEnd);
  context.clearRect(0, 0, size.width, size.height);
  context.fillStyle = gradient;
  context.fillRect(0, 0, size.width, size.height);
}

function drawMazeOverview(context: CanvasRenderingContext2D, size: CanvasSize, maze: MazeState, chests: GridPosition[], visibility?: MazeVisibilitySnapshot) {
  const cellSize = Math.min((size.width - CELL_PADDING * 2) / maze.columns, (size.height - CELL_PADDING * 2) / maze.rows);
  if (cellSize < 1) {
    return;
  }

  const gridWidth = cellSize * maze.columns;
  const gridHeight = cellSize * maze.rows;
  const offsetX = Math.floor((size.width - gridWidth) / 2);
  const offsetY = Math.floor((size.height - gridHeight) / 2);
  const cells = linkMap(maze);
  const walls = collectWalls(maze, cells);

  context.save();
  context.fillStyle = MAZE_COLORS.floorBase;
  context.fillRect(offsetX, offsetY, gridWidth, gridHeight);
  drawLayoutOverlays(context, maze, cellSize, offsetX, offsetY);

  context.strokeStyle = 'rgba(136, 146, 157, 0.72)';
  context.lineWidth = Math.max(1, Math.min(2, cellSize * 0.12));
  context.beginPath();
  for (const key of walls.horizontal) {
    const [row, column] = parseWallKey(key);
    const y = offsetY + row * cellSize;
    context.moveTo(offsetX + column * cellSize, y);
    context.lineTo(offsetX + (column + 1) * cellSize, y);
  }
  for (const key of walls.vertical) {
    const [row, column] = parseWallKey(key);
    const x = offsetX + column * cellSize;
    context.moveTo(x, offsetY + row * cellSize);
    context.lineTo(x, offsetY + (row + 1) * cellSize);
  }
  context.stroke();

  if (isCellExplored(visibility, maze.start)) {
    drawOverviewMarker(context, maze.start, cellSize, offsetX, offsetY, 'rgba(154, 167, 255, 0.9)', 'square');
  }
  if (isCellExplored(visibility, maze.end)) {
    drawOverviewMarker(context, maze.end, cellSize, offsetX, offsetY, 'rgba(106, 160, 255, 0.9)', 'square');
  }
  for (const chest of chests) {
    if (isCellExplored(visibility, chest)) {
      drawOverviewMarker(context, chest, cellSize, offsetX, offsetY, 'rgba(255, 204, 110, 0.82)', 'diamond');
    }
  }
  drawOverviewMarker(context, maze.active, cellSize, offsetX, offsetY, '#f4f7ff', 'player');
  drawFog(context, maze, cellSize, offsetX, offsetY, undefined, visibility);
  context.restore();
}

function drawOverviewMarker(
  context: CanvasRenderingContext2D,
  position: GridPosition,
  cellSize: number,
  offsetX: number,
  offsetY: number,
  color: string,
  shape: 'diamond' | 'player' | 'square',
) {
  const centerX = offsetX + position.column * cellSize + cellSize / 2;
  const centerY = offsetY + position.row * cellSize + cellSize / 2;
  const radius = Math.max(2, Math.min(8, cellSize * (shape === 'player' ? 0.5 : 0.36)));

  context.save();
  context.fillStyle = color;
  context.strokeStyle = 'rgba(5, 10, 20, 0.9)';
  context.lineWidth = Math.max(1, Math.min(2, radius * 0.28));
  context.beginPath();
  if (shape === 'diamond') {
    context.moveTo(centerX, centerY - radius);
    context.lineTo(centerX + radius, centerY);
    context.lineTo(centerX, centerY + radius);
    context.lineTo(centerX - radius, centerY);
    context.closePath();
  } else if (shape === 'square') {
    context.rect(centerX - radius, centerY - radius, radius * 2, radius * 2);
  } else {
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  }
  context.fill();
  context.stroke();
  context.restore();
}

function drawFloors(context: CanvasRenderingContext2D, maze: MazeState, cellSize: number, offsetX: number, offsetY: number, viewport?: MazeViewport) {
  const bounds = renderBounds(maze, viewport);
  const x = offsetX + bounds.columnStart * cellSize;
  const y = offsetY + bounds.rowStart * cellSize;
  const width = cellSize * bounds.columns;
  const height = cellSize * bounds.rows;
  const tile = getFloorPatternTile(context, cellSize);
  const pattern = context.createPattern(tile, 'repeat');

  context.save();
  context.beginPath();
  context.rect(x, y, width, height);
  context.clip();

  if (pattern) {
    context.translate(offsetX, offsetY);
    context.fillStyle = pattern;
    context.fillRect(bounds.columnStart * cellSize, bounds.rowStart * cellSize, width, height);
  } else {
    context.fillStyle = MAZE_COLORS.floor;
    context.fillRect(x, y, width, height);
  }

  context.fillStyle = 'rgba(4, 8, 20, 0.38)';
  context.fillRect(pattern ? bounds.columnStart * cellSize : x, pattern ? bounds.rowStart * cellSize : y, width, height);
  context.fillStyle = 'rgba(106, 160, 255, 0.025)';
  context.fillRect(pattern ? bounds.columnStart * cellSize : x, pattern ? bounds.rowStart * cellSize : y, width, height);
  context.restore();
}

function drawLayoutOverlays(context: CanvasRenderingContext2D, maze: MazeState, cellSize: number, offsetX: number, offsetY: number, viewport?: MazeViewport) {
  if (!maze.layout) {
    return;
  }

  drawZoneTints(context, maze, cellSize, offsetX, offsetY, viewport);
  drawMainPath(context, maze, cellSize, offsetX, offsetY, viewport);
  drawRoomHighlights(context, maze, cellSize, offsetX, offsetY, viewport);
}

function drawZoneTints(context: CanvasRenderingContext2D, maze: MazeState, cellSize: number, offsetX: number, offsetY: number, viewport?: MazeViewport) {
  const bounds = renderBounds(maze, viewport);

  context.save();
  for (const zone of maze.layout?.zones ?? []) {
    const rowStart = Math.max(bounds.rowStart, zone.rowStart);
    const rowEnd = Math.min(bounds.rowEnd, zone.rowEnd);
    const columnStart = Math.max(bounds.columnStart, zone.columnStart);
    const columnEnd = Math.min(bounds.columnEnd, zone.columnEnd);

    if (rowStart >= rowEnd || columnStart >= columnEnd) {
      continue;
    }

    context.fillStyle = zone.tint;
    context.fillRect(
      offsetX + columnStart * cellSize,
      offsetY + rowStart * cellSize,
      (columnEnd - columnStart) * cellSize,
      (rowEnd - rowStart) * cellSize,
    );
  }
  context.restore();
}

function drawMainPath(context: CanvasRenderingContext2D, maze: MazeState, cellSize: number, offsetX: number, offsetY: number, viewport?: MazeViewport) {
  const bounds = renderBounds(maze, viewport);

  context.save();
  context.fillStyle = 'rgba(154, 167, 255, 0.055)';
  for (const position of maze.layout?.mainPath ?? []) {
    if (!isInBounds(position, bounds)) {
      continue;
    }

    const inset = cellSize * 0.22;
    context.fillRect(offsetX + position.column * cellSize + inset, offsetY + position.row * cellSize + inset, cellSize - inset * 2, cellSize - inset * 2);
  }
  context.restore();
}

function drawRoomHighlights(context: CanvasRenderingContext2D, maze: MazeState, cellSize: number, offsetX: number, offsetY: number, viewport?: MazeViewport) {
  const bounds = renderBounds(maze, viewport);

  context.save();
  for (const room of maze.layout?.rooms ?? []) {
    const rowStart = Math.max(bounds.rowStart, room.row);
    const rowEnd = Math.min(bounds.rowEnd, room.row + room.rows);
    const columnStart = Math.max(bounds.columnStart, room.column);
    const columnEnd = Math.min(bounds.columnEnd, room.column + room.columns);

    if (rowStart >= rowEnd || columnStart >= columnEnd) {
      continue;
    }

    context.fillStyle = roomFill(room.kind);
    context.fillRect(
      offsetX + columnStart * cellSize,
      offsetY + rowStart * cellSize,
      (columnEnd - columnStart) * cellSize,
      (rowEnd - rowStart) * cellSize,
    );

    if (isInBounds(room.center, bounds)) {
      const centerX = offsetX + room.center.column * cellSize + cellSize / 2;
      const centerY = offsetY + room.center.row * cellSize + cellSize / 2;
      const radius = Math.max(2, Math.min(7, cellSize * 0.08));
      context.fillStyle = roomMarkerFill(room.kind);
      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.restore();
}

function roomFill(kind: string) {
  switch (kind) {
    case 'start':
    case 'exit':
      return 'rgba(154, 167, 255, 0.09)';
    case 'hub':
      return 'rgba(106, 160, 255, 0.08)';
    case 'treasure':
      return 'rgba(255, 204, 110, 0.11)';
    case 'safe':
      return 'rgba(96, 177, 132, 0.1)';
    case 'boss':
      return 'rgba(255, 111, 145, 0.09)';
    default:
      return 'rgba(230, 247, 255, 0.06)';
  }
}

function roomMarkerFill(kind: string) {
  switch (kind) {
    case 'treasure':
      return 'rgba(255, 204, 110, 0.7)';
    case 'safe':
      return 'rgba(96, 177, 132, 0.62)';
    case 'boss':
      return 'rgba(255, 111, 145, 0.62)';
    default:
      return 'rgba(230, 247, 255, 0.5)';
  }
}

function getFloorPatternTile(context: CanvasRenderingContext2D, cellSize: number) {
  const scale = Math.max(36, Math.min(96, Math.floor(cellSize * 0.72)));
  const cached = floorPatternCache.get(scale);

  if (cached) {
    return cached;
  }

  const tile = context.canvas.ownerDocument.createElement('canvas');
  tile.width = scale * 2;
  tile.height = scale * 2;
  const tileContext = tile.getContext('2d');

  if (tileContext) {
    drawFloorPatternTile(tileContext, tile.width, tile.height, scale);
  }

  floorPatternCache.set(scale, tile);
  return tile;
}

function drawFloorPatternTile(context: CanvasRenderingContext2D, width: number, height: number, scale: number) {
  const brickHeight = Math.max(9, Math.floor(scale * 0.22));
  const minBrickWidth = Math.max(18, Math.floor(scale * 0.42));
  const maxBrickWidth = Math.max(minBrickWidth + 8, Math.floor(scale * 0.92));
  const mortar = Math.max(1, Math.floor(scale * 0.035));

  context.fillStyle = MAZE_COLORS.floorMortar;
  context.fillRect(0, 0, width, height);

  let rowIndex = 0;
  for (let y = -brickHeight; y < height + brickHeight; y += brickHeight + mortar) {
    const rowOffset = rowIndex % 2 === 0 ? -minBrickWidth * 0.25 : -maxBrickWidth * 0.52;
    let x = rowOffset;
    let columnIndex = 0;

    while (x < width + maxBrickWidth) {
      const seed = rowIndex * 4099 + columnIndex * 9173;
      const brickWidth = Math.floor(minBrickWidth + seededNoise(seed + 3) * (maxBrickWidth - minBrickWidth));
      const brickX = Math.max(-mortar, x + seededNoise(seed + 5) * mortar);
      const brickY = y + seededNoise(seed + 7) * mortar;
      const brickTone = seededNoise(seed + 11) > 0.52 ? MAZE_COLORS.floorBrick : MAZE_COLORS.floorBrickAlt;

      drawFloorBrick(context, brickX, brickY, brickWidth - mortar, brickHeight, brickTone, seed);
      x += brickWidth;
      columnIndex++;
    }

    rowIndex++;
  }
}

function drawFloorBrick(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, color: string, seed: number) {
  const chip = Math.max(1, Math.min(4, height * 0.16));
  const insetTop = seededNoise(seed + 13) * chip;
  const insetRight = seededNoise(seed + 17) * chip;
  const insetBottom = seededNoise(seed + 19) * chip;
  const insetLeft = seededNoise(seed + 23) * chip;

  context.beginPath();
  context.moveTo(x + insetLeft, y + insetTop);
  context.lineTo(x + width - insetRight, y);
  context.lineTo(x + width, y + insetRight);
  context.lineTo(x + width - seededNoise(seed + 29) * chip, y + height - insetBottom);
  context.lineTo(x + insetLeft, y + height);
  context.lineTo(x, y + height - insetLeft);
  context.lineTo(x + seededNoise(seed + 31) * chip, y + insetTop);
  context.closePath();
  context.fillStyle = color;
  context.fill();
  context.strokeStyle = MAZE_COLORS.floorMortar;
  context.lineWidth = 1;
  context.stroke();

  context.save();
  context.clip();
  context.globalAlpha = 0.32;
  context.strokeStyle = MAZE_COLORS.floorHighlight;
  context.beginPath();
  context.moveTo(x + insetLeft + 1, y + 1);
  context.lineTo(x + width - insetRight - 1, y + 1);
  context.stroke();

  context.globalAlpha = 0.46;
  context.strokeStyle = MAZE_COLORS.floorShadow;
  context.beginPath();
  context.moveTo(x + 1, y + height - 1);
  context.lineTo(x + width - insetRight, y + height - 1);
  context.stroke();

  if (width > 26 && seededNoise(seed + 37) > 0.58) {
    context.globalAlpha = 0.42;
    context.beginPath();
    context.moveTo(x + width * (0.18 + seededNoise(seed + 41) * 0.18), y + height * (0.24 + seededNoise(seed + 43) * 0.22));
    context.lineTo(x + width * (0.44 + seededNoise(seed + 47) * 0.24), y + height * (0.4 + seededNoise(seed + 53) * 0.32));
    context.stroke();
  }

  context.restore();
}

function drawWalls(context: CanvasRenderingContext2D, maze: MazeState, cellSize: number, offsetX: number, offsetY: number, viewport?: MazeViewport) {
  const cells = linkMap(maze);
  const thickness = Math.max(4, Math.floor(cellSize * 0.18));
  const walls = collectWalls(maze, cells, viewport);

  context.save();

  for (const key of walls.horizontal) {
    const [row, column] = parseWallKey(key);
    drawStoneWall(
      context,
      offsetX + column * cellSize,
      offsetY + row * cellSize,
      cellSize,
      thickness,
      'horizontal',
      stoneSeed(row, column, 0),
    );
  }

  for (const key of walls.vertical) {
    const [row, column] = parseWallKey(key);
    drawStoneWall(
      context,
      offsetX + column * cellSize,
      offsetY + row * cellSize,
      cellSize,
      thickness,
      'vertical',
      stoneSeed(row, column, 1),
    );
  }

  drawWallJoints(context, walls, maze.rows, maze.columns, cellSize, offsetX, offsetY, thickness, viewport);

  context.restore();
}

function collectWalls(maze: MazeState, cells: Map<string, { links: Direction[] } | undefined>, viewport?: MazeViewport): WallNetwork {
  const horizontal = new Set<string>();
  const vertical = new Set<string>();
  const bounds = renderBounds(maze, viewport);

  for (let row = bounds.rowStart; row < bounds.rowEnd; row++) {
    for (let column = bounds.columnStart; column < bounds.columnEnd; column++) {
      const cell = cells.get(`${row}:${column}`);

      if (!hasLink(cell?.links, 'north')) horizontal.add(wallKey(row, column));
      if (!hasLink(cell?.links, 'west')) vertical.add(wallKey(row, column));
      if (!hasLink(cell?.links, 'south')) horizontal.add(wallKey(row + 1, column));
      if (!hasLink(cell?.links, 'east')) vertical.add(wallKey(row, column + 1));
    }
  }

  return { horizontal, vertical };
}

function drawWallJoints(
  context: CanvasRenderingContext2D,
  walls: WallNetwork,
  rows: number,
  columns: number,
  cellSize: number,
  offsetX: number,
  offsetY: number,
  thickness: number,
  viewport?: MazeViewport,
) {
  const bounds = renderBounds({ rows, columns }, viewport);
  for (let row = bounds.rowStart; row <= bounds.rowEnd; row++) {
    for (let column = bounds.columnStart; column <= bounds.columnEnd; column++) {
      const connections = wallConnections(walls, row, column, rows, columns);
      const count = connectionCount(connections);

      if (count === 0) {
        continue;
      }

      drawWallJoint(
        context,
        offsetX + column * cellSize,
        offsetY + row * cellSize,
        connections,
        thickness,
        stoneSeed(row, column, 7 + count),
      );
    }
  }
}

function wallConnections(walls: WallNetwork, row: number, column: number, rows: number, columns: number): WallConnections {
  return {
    north: row > 0 && walls.vertical.has(wallKey(row - 1, column)),
    south: row < rows && walls.vertical.has(wallKey(row, column)),
    west: column > 0 && walls.horizontal.has(wallKey(row, column - 1)),
    east: column < columns && walls.horizontal.has(wallKey(row, column)),
  };
}

function drawWallJoint(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  connections: WallConnections,
  thickness: number,
  seed: number,
) {
  const count = connectionCount(connections);
  const straightHorizontal = count === 2 && connections.west && connections.east;
  const straightVertical = count === 2 && connections.north && connections.south;
  const scale = count === 1 ? 0.98 : count === 2 ? 1.16 : count === 3 ? 1.28 : 1.38;
  const width = thickness * (straightHorizontal ? 1.42 : straightVertical ? 0.98 : scale);
  const height = thickness * (straightVertical ? 1.42 : straightHorizontal ? 0.98 : scale);
  const x = centerX - width / 2;
  const y = centerY - height / 2;
  const gap = Math.max(1, Math.floor(thickness * 0.11));

  context.fillStyle = MAZE_COLORS.wallMortar;
  context.fillRect(x - gap, y - gap, width + gap * 2, height + gap * 2);
  drawStone(context, x, y, width, height, seed);
  drawJointDetail(context, centerX, centerY, x, y, width, height, connections, thickness, seed);
}

function drawJointDetail(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  x: number,
  y: number,
  width: number,
  height: number,
  connections: WallConnections,
  thickness: number,
  seed: number,
) {
  const count = connectionCount(connections);
  const lineWidth = Math.max(1, Math.floor(thickness * 0.08));

  context.save();
  context.strokeStyle = MAZE_COLORS.wallMortar;
  context.lineCap = 'square';
  context.lineWidth = lineWidth;
  context.globalAlpha = 0.48;

  if (count === 2 && !isStraightJoint(connections)) {
    drawCornerNotch(context, centerX, centerY, connections, thickness);
  } else if (count === 3) {
    drawTJunctionNotch(context, x, y, width, height, connections, thickness);
  } else if (count === 4) {
    drawCrossJointNotch(context, centerX, centerY, thickness);
  } else if (count === 1) {
    drawEndCapNotch(context, centerX, centerY, connections, thickness);
  } else if (seededNoise(seed + 131) > 0.42) {
    drawStoneCrack(context, x, y, width, height, seed);
  }

  context.restore();
}

function drawCornerNotch(context: CanvasRenderingContext2D, centerX: number, centerY: number, connections: WallConnections, thickness: number) {
  const empty = cornerEmptyQuadrant(connections);
  const inner = thickness * 0.18;
  const outer = thickness * 0.42;

  context.beginPath();
  context.moveTo(centerX + empty.x * inner, centerY + empty.y * outer);
  context.lineTo(centerX + empty.x * outer, centerY + empty.y * inner);
  context.stroke();
}

function drawTJunctionNotch(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, connections: WallConnections, thickness: number) {
  const inset = thickness * 0.18;

  context.beginPath();
  if (!connections.north) {
    context.moveTo(x + inset, y + inset);
    context.lineTo(x + width - inset, y + inset);
  } else if (!connections.south) {
    context.moveTo(x + inset, y + height - inset);
    context.lineTo(x + width - inset, y + height - inset);
  } else if (!connections.west) {
    context.moveTo(x + inset, y + inset);
    context.lineTo(x + inset, y + height - inset);
  } else {
    context.moveTo(x + width - inset, y + inset);
    context.lineTo(x + width - inset, y + height - inset);
  }
  context.stroke();
}

function drawCrossJointNotch(context: CanvasRenderingContext2D, centerX: number, centerY: number, thickness: number) {
  const arm = thickness * 0.24;

  context.beginPath();
  context.moveTo(centerX - arm, centerY);
  context.lineTo(centerX + arm, centerY);
  context.moveTo(centerX, centerY - arm);
  context.lineTo(centerX, centerY + arm);
  context.stroke();
}

function drawEndCapNotch(context: CanvasRenderingContext2D, centerX: number, centerY: number, connections: WallConnections, thickness: number) {
  const half = thickness * 0.26;
  const offset = thickness * 0.18;

  context.beginPath();
  if (connections.north || connections.south) {
    const y = centerY + (connections.north ? offset : -offset);
    context.moveTo(centerX - half, y);
    context.lineTo(centerX + half, y);
  } else {
    const x = centerX + (connections.west ? offset : -offset);
    context.moveTo(x, centerY - half);
    context.lineTo(x, centerY + half);
  }
  context.stroke();
}

function drawStoneCrack(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, seed: number) {
  context.globalAlpha = 0.34;
  context.beginPath();
  context.moveTo(x + width * (0.24 + seededNoise(seed + 137) * 0.16), y + height * (0.28 + seededNoise(seed + 139) * 0.16));
  context.lineTo(x + width * (0.58 + seededNoise(seed + 149) * 0.22), y + height * (0.52 + seededNoise(seed + 151) * 0.22));
  context.stroke();
}

function cornerEmptyQuadrant(connections: WallConnections) {
  if (connections.north && connections.east) return { x: -1, y: 1 };
  if (connections.east && connections.south) return { x: -1, y: -1 };
  if (connections.south && connections.west) return { x: 1, y: -1 };
  return { x: 1, y: 1 };
}

function isStraightJoint(connections: WallConnections) {
  return (connections.north && connections.south) || (connections.west && connections.east);
}

function connectionCount(connections: WallConnections) {
  return Number(connections.north) + Number(connections.south) + Number(connections.west) + Number(connections.east);
}

function wallKey(row: number, column: number) {
  return `${row}:${column}`;
}

function parseWallKey(key: string): [number, number] {
  const [row, column] = key.split(':').map(Number);
  return [row, column];
}

function renderBounds(maze: Pick<MazeState, 'columns' | 'rows'>, viewport?: MazeViewport): RenderBounds {
  if (viewport) {
    return viewport;
  }

  return {
    rowStart: 0,
    rowEnd: maze.rows,
    columnStart: 0,
    columnEnd: maze.columns,
    rows: maze.rows,
    columns: maze.columns,
  };
}

function isInBounds(position: GridPosition, bounds: RenderBounds) {
  return position.row >= bounds.rowStart && position.row < bounds.rowEnd && position.column >= bounds.columnStart && position.column < bounds.columnEnd;
}

function drawFog(
  context: CanvasRenderingContext2D,
  maze: MazeState,
  cellSize: number,
  offsetX: number,
  offsetY: number,
  viewport?: MazeViewport,
  visibility?: MazeVisibilitySnapshot,
) {
  if (!visibility) {
    return;
  }

  const bounds = renderBounds(maze, viewport);
  const bleed = Math.max(1, Math.floor(cellSize * 0.035));

  context.save();
  for (let row = bounds.rowStart; row < bounds.rowEnd; row++) {
    for (let column = bounds.columnStart; column < bounds.columnEnd; column++) {
      const key = cellKey({ row, column });
      if (visibility.visible.has(key)) {
        continue;
      }

      const x = offsetX + column * cellSize - bleed / 2;
      const y = offsetY + row * cellSize - bleed / 2;
      const size = cellSize + bleed;
      context.fillStyle = visibility.explored.has(key) ? 'rgba(4, 8, 20, 0.58)' : MAZE_COLORS.backgroundStart;
      context.fillRect(x, y, size, size);
    }
  }
  context.restore();
}

function drawStoneWall(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  length: number,
  thickness: number,
  orientation: 'horizontal' | 'vertical',
  seed: number,
) {
  const stripX = orientation === 'horizontal' ? x : x - thickness / 2;
  const stripY = orientation === 'horizontal' ? y - thickness / 2 : y;
  const stripWidth = orientation === 'horizontal' ? length : thickness;
  const stripHeight = orientation === 'horizontal' ? thickness : length;
  const gap = Math.max(1, Math.floor(thickness * 0.1));

  context.fillStyle = MAZE_COLORS.wallMortar;
  context.fillRect(stripX - gap, stripY - gap, stripWidth + gap * 2, stripHeight + gap * 2);
  context.strokeStyle = MAZE_COLORS.wallStroke;
  context.lineWidth = 1;
  context.strokeRect(stripX - gap + 0.5, stripY - gap + 0.5, stripWidth + gap * 2 - 1, stripHeight + gap * 2 - 1);

  if (orientation === 'horizontal') {
    drawHorizontalStoneCourses(context, stripX, stripY, length, stripHeight, gap, seed);
  } else {
    drawVerticalStoneCourses(context, stripX, stripY, stripWidth, length, gap, seed);
  }
}

function drawHorizontalStoneCourses(context: CanvasRenderingContext2D, x: number, y: number, length: number, height: number, gap: number, seed: number) {
  const courses = height >= 18 ? 2 : 1;
  const courseHeight = (height - gap * (courses + 1)) / courses;

  for (let course = 0; course < courses; course++) {
    const courseY = y + gap + course * (courseHeight + gap);
    const minStone = Math.max(height * 0.72, length * 0.11);
    const maxStone = Math.max(minStone + 2, length * 0.24);
    let cursor = course % 2 === 0 ? 0 : -minStone * 0.45;
    let index = 0;

    while (cursor < length - gap) {
      const rolled = minStone + seededNoise(seed + course * 409 + index * 31) * (maxStone - minStone);
      const stoneLength = Math.min(maxStone, rolled);
      const stoneStart = Math.max(0, cursor + gap / 2);
      const stoneEnd = Math.min(length, cursor + stoneLength - gap / 2);
      const width = stoneEnd - stoneStart;

      if (width > 4) {
        drawStone(context, x + stoneStart, courseY, width, courseHeight, seed + course * 997 + index * 101);
      }

      cursor += stoneLength;
      index++;
    }
  }
}

function drawVerticalStoneCourses(context: CanvasRenderingContext2D, x: number, y: number, width: number, length: number, gap: number, seed: number) {
  const courses = width >= 18 ? 2 : 1;
  const courseWidth = (width - gap * (courses + 1)) / courses;

  for (let course = 0; course < courses; course++) {
    const courseX = x + gap + course * (courseWidth + gap);
    const minStone = Math.max(width * 0.72, length * 0.11);
    const maxStone = Math.max(minStone + 2, length * 0.24);
    let cursor = course % 2 === 0 ? 0 : -minStone * 0.45;
    let index = 0;

    while (cursor < length - gap) {
      const rolled = minStone + seededNoise(seed + course * 509 + index * 37) * (maxStone - minStone);
      const stoneLength = Math.min(maxStone, rolled);
      const stoneStart = Math.max(0, cursor + gap / 2);
      const stoneEnd = Math.min(length, cursor + stoneLength - gap / 2);
      const height = stoneEnd - stoneStart;

      if (height > 4) {
        drawStone(context, courseX, y + stoneStart, courseWidth, height, seed + course * 991 + index * 113);
      }

      cursor += stoneLength;
      index++;
    }
  }
}

function drawStone(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, seed: number) {
  const chip = Math.max(1, Math.min(4, Math.min(width, height) * (0.06 + seededNoise(seed + 3) * 0.1)));
  const topLeft = chip * (0.55 + seededNoise(seed + 5) * 0.7);
  const topRight = chip * (0.55 + seededNoise(seed + 7) * 0.7);
  const bottomRight = chip * (0.55 + seededNoise(seed + 11) * 0.7);
  const bottomLeft = chip * (0.55 + seededNoise(seed + 13) * 0.7);
  const edgeJitter = Math.max(0.5, chip * 0.45);
  const shade = seededNoise(seed + 23);

  context.beginPath();
  context.moveTo(x + topLeft, y + seededNoise(seed + 17) * edgeJitter);
  context.lineTo(x + width * 0.48, y + seededNoise(seed + 19) * edgeJitter);
  context.lineTo(x + width - topRight, y + seededNoise(seed + 29) * edgeJitter);
  context.lineTo(x + width - seededNoise(seed + 31) * edgeJitter, y + topRight);
  context.lineTo(x + width - seededNoise(seed + 37) * edgeJitter, y + height - bottomRight);
  context.lineTo(x + width - bottomRight, y + height - seededNoise(seed + 41) * edgeJitter);
  context.lineTo(x + width * 0.52, y + height - seededNoise(seed + 43) * edgeJitter);
  context.lineTo(x + bottomLeft, y + height - seededNoise(seed + 47) * edgeJitter);
  context.lineTo(x + seededNoise(seed + 53) * edgeJitter, y + height - bottomLeft);
  context.lineTo(x + seededNoise(seed + 59) * edgeJitter, y + topLeft);
  context.closePath();
  context.fillStyle = shade > 0.52 ? MAZE_COLORS.wallFaceAlt : MAZE_COLORS.wallFace;
  context.fill();
  context.strokeStyle = MAZE_COLORS.wallStroke;
  context.lineWidth = 1;
  context.stroke();

  context.save();
  context.clip();
  context.strokeStyle = MAZE_COLORS.wallHighlight;
  context.globalAlpha = 0.38;
  context.beginPath();
  context.moveTo(x + topLeft, y + 1);
  context.lineTo(x + width - topRight, y + 1);
  context.moveTo(x + 1, y + topLeft);
  context.lineTo(x + 1, y + height - bottomLeft);
  context.stroke();

  context.strokeStyle = MAZE_COLORS.wallShadow;
  context.globalAlpha = 0.58;
  context.beginPath();
  context.moveTo(x + width - 1, y + topRight);
  context.lineTo(x + width - 1, y + height - bottomRight);
  context.moveTo(x + bottomLeft, y + height - 1);
  context.lineTo(x + width - bottomRight, y + height - 1);
  context.stroke();

  if (width > 8 && height > 5 && seededNoise(seed + 67) > 0.48) {
    context.strokeStyle = MAZE_COLORS.wallShadow;
    context.globalAlpha = 0.35;
    context.beginPath();
    context.moveTo(x + width * (0.24 + seededNoise(seed + 71) * 0.18), y + height * (0.28 + seededNoise(seed + 73) * 0.2));
    context.lineTo(x + width * (0.56 + seededNoise(seed + 79) * 0.22), y + height * (0.46 + seededNoise(seed + 83) * 0.28));
    context.stroke();
  }

  context.restore();
}

function stoneSeed(row: number, column: number, side: number) {
  return row * 73856093 + column * 19349663 + side * 83492791;
}

function seededNoise(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function drawStairs(
  context: CanvasRenderingContext2D,
  position: GridPosition,
  cellSize: number,
  offsetX: number,
  offsetY: number,
  direction: 'up' | 'down',
) {
  const x = offsetX + position.column * cellSize;
  const y = offsetY + position.row * cellSize;
  const inset = cellSize * 0.22;
  const wellX = x + inset;
  const wellY = y + cellSize * 0.18;
  const wellWidth = cellSize - inset * 2;
  const wellHeight = cellSize * 0.64;
  const stepCount = 5;
  const stepGap = Math.max(1, cellSize * 0.018);
  const stepHeight = (wellHeight - stepGap * (stepCount + 1)) / stepCount;
  const glow = direction === 'up' ? MAZE_COLORS.stairGlowUp : MAZE_COLORS.stairGlowDown;

  context.save();
  context.shadowColor = 'rgba(5, 10, 20, 0.72)';
  context.shadowBlur = Math.max(2, cellSize * 0.04);
  context.fillStyle = MAZE_COLORS.floorMortar;
  context.fillRect(wellX - stepGap * 2, wellY - stepGap * 2, wellWidth + stepGap * 4, wellHeight + stepGap * 4);

  context.shadowBlur = 0;
  context.fillStyle = MAZE_COLORS.stairWell;
  context.fillRect(wellX, wellY, wellWidth, wellHeight);

  for (let index = 0; index < stepCount; index++) {
    const visualIndex = direction === 'up' ? index : stepCount - index - 1;
    const progress = visualIndex / (stepCount - 1);
    const stepWidth = wellWidth * (0.54 + progress * 0.34);
    const stepX = wellX + (wellWidth - stepWidth) / 2 + (seededNoise(stoneSeed(position.row, position.column, index + 41)) - 0.5) * cellSize * 0.02;
    const stepY = wellY + stepGap + index * (stepHeight + stepGap);
    const seed = stoneSeed(position.row, position.column, direction === 'up' ? index + 17 : index + 29);
    drawStairSlab(context, stepX, stepY, stepWidth, stepHeight, seed);
  }

  drawStairGlyph(context, x + cellSize / 2, y + cellSize / 2, cellSize, direction, glow);
  context.restore();
}

function drawStairSlab(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, seed: number) {
  const chip = Math.max(1, Math.min(3, height * 0.2));
  const shade = seededNoise(seed + 5);
  const leftChip = chip * (0.6 + seededNoise(seed + 7) * 0.7);
  const rightChip = chip * (0.6 + seededNoise(seed + 11) * 0.7);

  context.beginPath();
  context.moveTo(x + leftChip, y);
  context.lineTo(x + width - rightChip, y + seededNoise(seed + 13) * chip);
  context.lineTo(x + width, y + height - rightChip);
  context.lineTo(x + width - rightChip * 0.7, y + height);
  context.lineTo(x + leftChip * 0.7, y + height - seededNoise(seed + 17) * chip);
  context.lineTo(x, y + leftChip);
  context.closePath();
  context.fillStyle = shade > 0.5 ? MAZE_COLORS.stairStoneAlt : MAZE_COLORS.stairStone;
  context.fill();
  context.strokeStyle = MAZE_COLORS.stairEdge;
  context.lineWidth = 1;
  context.stroke();

  context.save();
  context.clip();
  context.globalAlpha = 0.38;
  context.strokeStyle = MAZE_COLORS.wallHighlight;
  context.beginPath();
  context.moveTo(x + leftChip, y + 1);
  context.lineTo(x + width - rightChip, y + 1);
  context.stroke();

  context.globalAlpha = 0.58;
  context.strokeStyle = MAZE_COLORS.wallShadow;
  context.beginPath();
  context.moveTo(x + 1, y + height - 1);
  context.lineTo(x + width - rightChip, y + height - 1);
  context.stroke();
  context.restore();
}

function drawStairGlyph(context: CanvasRenderingContext2D, centerX: number, centerY: number, cellSize: number, direction: 'up' | 'down', glow: string) {
  const arrowHeight = cellSize * 0.16;
  const arrowWidth = cellSize * 0.16;
  const arrowY = centerY + (direction === 'up' ? -cellSize * 0.29 : cellSize * 0.29);
  const sign = direction === 'up' ? -1 : 1;

  context.save();
  context.fillStyle = glow;
  context.shadowColor = glow;
  context.shadowBlur = Math.max(2, cellSize * 0.035);
  context.beginPath();
  context.moveTo(centerX, arrowY + sign * arrowHeight * 0.55);
  context.lineTo(centerX - arrowWidth * 0.5, arrowY - sign * arrowHeight * 0.25);
  context.lineTo(centerX - arrowWidth * 0.18, arrowY - sign * arrowHeight * 0.25);
  context.lineTo(centerX - arrowWidth * 0.18, arrowY - sign * arrowHeight * 0.62);
  context.lineTo(centerX + arrowWidth * 0.18, arrowY - sign * arrowHeight * 0.62);
  context.lineTo(centerX + arrowWidth * 0.18, arrowY - sign * arrowHeight * 0.25);
  context.lineTo(centerX + arrowWidth * 0.5, arrowY - sign * arrowHeight * 0.25);
  context.closePath();
  context.fill();
  context.restore();
}

function drawChests(
  context: CanvasRenderingContext2D,
  chests: GridPosition[],
  cellSize: number,
  offsetX: number,
  offsetY: number,
  viewport?: MazeViewport,
  visibility?: MazeVisibilitySnapshot,
) {
  if (chests.length === 0) {
    return;
  }

  context.save();
  context.font = `${Math.floor(cellSize * 0.48)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.shadowColor = MAZE_COLORS.playerShadow;
  context.shadowBlur = Math.max(2, cellSize * 0.06);

  for (const chest of chests) {
    if ((viewport && !isInViewport(chest, viewport)) || !isCellExplored(visibility, chest)) {
      continue;
    }

    const centerX = offsetX + chest.column * cellSize + cellSize / 2;
    const centerY = offsetY + chest.row * cellSize + cellSize / 2;
    if (!drawSpriteCentered(context, CHEST_SPRITE, centerX, centerY, cellSize * 0.58, cellSize * 0.58)) {
      context.fillText(CHEST_TOKEN, centerX, centerY);
    }
  }

  context.restore();
}

function drawPlayer(context: CanvasRenderingContext2D, position: GridPosition, facing: Direction, cellSize: number, offsetX: number, offsetY: number, now: number) {
  const centerX = offsetX + position.column * cellSize + cellSize / 2;
  const centerY = offsetY + position.row * cellSize + cellSize / 2;
  const frames = KNIGHT_FRAMES[facing] ?? KNIGHT_FRAMES.south;
  const frame = frames[Math.floor(now / PLAYER_FRAME_MS) % frames.length];

  context.save();
  context.font = `${Math.floor(cellSize * 0.58)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.shadowColor = MAZE_COLORS.playerShadow;
  context.shadowBlur = Math.max(3, cellSize * 0.08);
  if (!drawPlayerFrame(context, frame, centerX, centerY + cellSize * 0.42, cellSize * PLAYER_FRAME_TARGET_HEIGHT)) {
    context.fillText(PLAYER_TOKEN, centerX, centerY + cellSize * 0.02);
  }
  context.restore();
}

function createKnightFrames(): Record<Direction, PlayerFrame[]> {
  return {
    south: pingPongFrames([
      playerFrame(new URL('../../assets/sprites/knight-gpt/south-0.png', import.meta.url).href),
      playerFrame(new URL('../../assets/sprites/knight-gpt/south-1.png', import.meta.url).href),
      playerFrame(new URL('../../assets/sprites/knight-gpt/south-2.png', import.meta.url).href),
    ]),
    north: pingPongFrames([
      playerFrame(new URL('../../assets/sprites/knight-gpt/north-0.png', import.meta.url).href),
      playerFrame(new URL('../../assets/sprites/knight-gpt/north-1.png', import.meta.url).href),
      playerFrame(new URL('../../assets/sprites/knight-gpt/north-2.png', import.meta.url).href),
    ]),
    east: pingPongFrames([
      playerFrame(new URL('../../assets/sprites/knight-gpt/east-0.png', import.meta.url).href),
      playerFrame(new URL('../../assets/sprites/knight-gpt/east-1.png', import.meta.url).href),
      playerFrame(new URL('../../assets/sprites/knight-gpt/east-2.png', import.meta.url).href),
    ]),
    west: pingPongFrames([
      playerFrame(new URL('../../assets/sprites/knight-gpt/west-0.png', import.meta.url).href),
      playerFrame(new URL('../../assets/sprites/knight-gpt/west-1.png', import.meta.url).href),
      playerFrame(new URL('../../assets/sprites/knight-gpt/west-2.png', import.meta.url).href),
    ]),
  };
}

function playerFrame(url: string): PlayerFrame {
  return {
    asset: createSpriteAsset(url),
    sourceAnchorX: PLAYER_FRAME_ANCHOR_X,
    sourceAnchorY: PLAYER_FRAME_ANCHOR_Y,
  };
}

function pingPongFrames(frames: [PlayerFrame, PlayerFrame, PlayerFrame]) {
  return [frames[0], frames[1], frames[2], frames[1]];
}

function playerSpriteAssets() {
  return [...new Set(Object.values(KNIGHT_FRAMES).flatMap((frames) => frames.map((frame) => frame.asset)))];
}

function createSpriteAsset(url: string): SpriteAsset {
  return {
    url,
    callbacks: new Set(),
    failed: false,
  };
}

function subscribeSprite(asset: SpriteAsset, callback: () => void) {
  getSpriteImage(asset);
  if (isSpriteReady(asset) || asset.failed) {
    return () => undefined;
  }

  asset.callbacks.add(callback);
  return () => asset.callbacks.delete(callback);
}

function subscribeSpriteSet(assets: SpriteAsset[], callback: () => void) {
  const unsubscribers = assets.map((asset) => subscribeSprite(asset, callback));
  return () => {
    for (const unsubscribe of unsubscribers) {
      unsubscribe();
    }
  };
}

function getSpriteImage(asset: SpriteAsset) {
  if (asset.image || typeof Image === 'undefined') {
    return asset.image;
  }

  const image = new Image();
  image.onload = () => notifySpriteReady(asset);
  image.onerror = () => {
    asset.failed = true;
    asset.callbacks.clear();
  };
  image.src = asset.url;
  asset.image = image;
  return image;
}

function notifySpriteReady(asset: SpriteAsset) {
  for (const callback of asset.callbacks) {
    callback();
  }
  asset.callbacks.clear();
}

function isSpriteReady(asset: SpriteAsset) {
  const image = asset.image;
  return Boolean(image?.complete && image.naturalWidth > 0 && !asset.failed);
}

function drawSpriteCentered(context: CanvasRenderingContext2D, asset: SpriteAsset, centerX: number, centerY: number, maxWidth: number, maxHeight: number, flipX = false) {
  const image = getSpriteImage(asset);
  if (!image || !isSpriteReady(asset)) {
    return false;
  }

  const scale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
  const width = Math.floor(image.naturalWidth * scale);
  const height = Math.floor(image.naturalHeight * scale);

  context.save();
  context.imageSmoothingEnabled = false;
  if (flipX) {
    context.translate(Math.round(centerX), Math.round(centerY));
    context.scale(-1, 1);
    context.drawImage(image, Math.round(-width / 2), Math.round(-height / 2), width, height);
  } else {
    context.drawImage(image, Math.round(centerX - width / 2), Math.round(centerY - height / 2), width, height);
  }
  context.restore();
  return true;
}

function drawPlayerFrame(context: CanvasRenderingContext2D, frame: PlayerFrame, anchorX: number, anchorY: number, bodyHeight: number) {
  const image = getSpriteImage(frame.asset);
  if (!image || !isSpriteReady(frame.asset)) {
    return false;
  }

  const scale = bodyHeight / PLAYER_FRAME_SOURCE_HEIGHT;
  const width = Math.floor(image.naturalWidth * scale);
  const height = Math.floor(image.naturalHeight * scale);
  const drawX = Math.round(-frame.sourceAnchorX * scale);
  const drawY = Math.round(-frame.sourceAnchorY * scale);

  context.save();
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.translate(Math.round(anchorX), Math.round(anchorY));
  context.drawImage(image, drawX, drawY, width, height);
  context.restore();
  return true;
}

function hasLink(links: Direction[] | undefined, direction: Direction) {
  return links?.includes(direction) ?? false;
}
