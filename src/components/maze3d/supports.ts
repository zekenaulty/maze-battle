import type { Point, SceneBox, StageScene } from './scene';
import { CELL_SIZE, PLAYER_RADIUS, WALL_HEIGHT } from './constants';
import { ceilingTimbers, TIMBER } from './timber';
import { WALL_THICKNESS } from './construction';
export interface ArchitectureOptions { cornerPosts: boolean; wallBraces: boolean; stairFraming: boolean; dressedRisers: boolean; ironNosing: boolean }
export const DEFAULT_ARCHITECTURE: ArchitectureOptions = { cornerPosts: false, wallBraces: false, stairFraming: false, dressedRisers: false, ironNosing: false };
export interface SupportPart { box: SceneBox; lean?: number }
const overlaps = (a: SceneBox, b: SceneBox) => a.center.every((v, i) => Math.abs(v - b.center[i]) < (a.size[i] + b.size[i]) / 2 - 1e-6);
const supportHeight = WALL_HEIGHT - TIMBER.joistHeight - TIMBER.rafterHeight;
const postWidth = .32, cornerOffset = CELL_SIZE / 2 - WALL_THICKNESS / 2 - postWidth / 2;
/** Provisional construction strategies, bounded to disclosed rooms and their existing floor bearings. */
export function roomSupports(scene: StageScene, options: ArchitectureOptions, player: Point): SupportPart[] {
  if (!options.cornerPosts && !options.wallBraces && !options.stairFraming) return [];
  const parts: SupportPart[] = [], counts = new Map<string, number>();
  for (const cell of scene.cells) { const key = cell.source.at.level + '/' + cell.source.at.cell.spaceId; counts.set(key, (counts.get(key) ?? 0) + 1); }
  const add = (box: SceneBox, lean?: number, nearStairs = false) => {
    if (parts.length >= 96) return;
    const testBox = !lean ? box : { ...box, size: [Math.abs(Math.cos(lean)) * box.size[0] + Math.abs(Math.sin(lean)) * box.size[1],
      Math.abs(Math.sin(lean)) * box.size[0] + Math.abs(Math.cos(lean)) * box.size[1], box.size[2]] as [number, number, number] };
    const atPlayer = Math.abs(box.center[1] - box.size[1] / 2 - scene.actor.floorY) < .1
      && Math.hypot(Math.max(0, Math.abs(player.x - box.center[0]) - box.size[0] / 2), Math.max(0, Math.abs(player.z - box.center[2]) - box.size[2] / 2)) < PLAYER_RADIUS + .001;
    if (box.solid && atPlayer) return;
    if (scene.boxes.some(b => !b.deck && overlaps(testBox, b))) return;
    if (parts.some(p => overlaps(testBox, !p.lean ? p.box : { ...p.box, size: [Math.abs(Math.cos(p.lean)) * p.box.size[0] + Math.abs(Math.sin(p.lean)) * p.box.size[1], Math.abs(Math.sin(p.lean)) * p.box.size[0] + Math.abs(Math.cos(p.lean)) * p.box.size[1], p.box.size[2]] }))) return;
    if (!nearStairs && scene.flights?.some(f => testBox.center[0] + testBox.size[0] / 2 > f.upper.x - 1.25 && testBox.center[0] - testBox.size[0] / 2 < f.upper.x + 1.25
      && testBox.center[2] + testBox.size[2] / 2 > f.lower.z - 1.2 && testBox.center[2] - testBox.size[2] / 2 < f.upper.z + 1.2)) return;
    if (box.size[1] > 1 && !scene.boxes.some(b => b.deck === 'floor' && Math.abs(b.center[1] + b.size[1] / 2 - (box.center[1] - box.size[1] / 2)) < .01
      && Math.abs(box.center[0] - b.center[0]) + box.size[0] / 2 <= b.size[0] / 2 + 1e-6 && Math.abs(box.center[2] - b.center[2]) + box.size[2] / 2 <= b.size[2] / 2 + 1e-6)) return;
    parts.push({ box, ...(lean ? { lean } : {}) });
  };
  if (options.cornerPosts) for (const cell of scene.cells) {
    if (cell.kind !== 'room' || (counts.get(cell.source.at.level + '/' + cell.source.at.cell.spaceId) ?? 0) < 6) continue;
    const edges = cell.geometryEdges ?? cell.source.edges;
    for (const x of [-1, 1]) for (const z of [-1, 1]) if (edges[x < 0 ? 'west' : 'east'] === null && edges[z < 0 ? 'north' : 'south'] === null) {
      add({ id: cell.key + '/corner-post/' + x + '/' + z, material: 'timber', center: [cell.center.x + x * cornerOffset, cell.floorY + supportHeight / 2, cell.center.z + z * cornerOffset],
        size: [postWidth, supportHeight, postWidth], solid: cell.source.at.level === scene.level, textureOrigin: cell.textureOrigin });
    }
  }
  const braceCounts = new Map<string, number>();
  if (options.wallBraces) for (const member of ceilingTimbers(scene.boxes).filter(m => m.role === 'joist' && m.max[0] - m.min[0] >= CELL_SIZE * 1.75)) {
    const z = (member.min[2] + member.max[2]) / 2;
    // Alternate floor-anchored joist rows, only in larger rooms; at most four pairs per room.
    if (Math.abs(Math.round((z - member.origin[2] - .64) / CELL_SIZE)) % 2) continue;
    const cell = scene.cells.find(c => c.kind === 'room' && Math.abs(c.floorY + supportHeight - member.min[1]) < .01
      && (member.min[0] + member.max[0]) / 2 >= c.center.x - CELL_SIZE / 2 && (member.min[0] + member.max[0]) / 2 < c.center.x + CELL_SIZE / 2
      && z >= c.center.z - CELL_SIZE / 2 && z < c.center.z + CELL_SIZE / 2);
    if (!cell) continue;
    const room = cell.source.at.level + '/' + cell.source.at.cell.spaceId;
    if ((counts.get(room) ?? 0) < 9) continue;
    for (const sign of [-1, 1]) {
      if ((braceCounts.get(room) ?? 0) >= 8) break;
      const end = sign < 0 ? member.min[0] : member.max[0], z = (member.min[2] + member.max[2]) / 2;
      // Only brace a bearing against actual masonry, not a cut end hanging at a void.
      if (!scene.boxes.some(b => !b.deck && ['stone_bricks', 'unknown'].includes(b.material) && Math.abs(end + sign * .24 - b.center[0]) <= b.size[0] / 2 + .02
        && Math.abs(z - b.center[2]) <= b.size[2] / 2 && member.min[1] > b.center[1] - b.size[1] / 2 && member.min[1] < b.center[1] + b.size[1] / 2)) continue;
      const half = (.18 + .72) / Math.SQRT2 / 2;
      const before = parts.length;
      add({ id: `brace/${end}/${member.min[1]}/${z}`, material: 'timber', center: [end + sign * (TIMBER.trimWidth - half), member.min[1] - half, z], size: [.18, .72, .22], solid: false, textureOrigin: member.origin }, sign * Math.PI / 4);
      if (parts.length > before) braceCounts.set(room, (braceCounts.get(room) ?? 0) + 1);
    }
  }
  if (options.stairFraming) for (const f of scene.flights ?? []) {
    const y = f.upper.y, z = f.upper.z - .7;
    const start = parts.length;
    // An entry frame stands on the upper landing, wholly outside the 1.8-wide flight.
    for (const sign of [-1, 1]) add({ id: f.id + '/entry-post/' + sign, material: 'timber', center: [f.upper.x + sign * 1.08, y + 1.8, z],
      size: [.24, 3.6, .24], solid: Math.abs(y - scene.actor.floorY) < .1, textureOrigin: f.textureOrigins?.upper }, undefined, true);
    if (parts.length === start + 2) add({ id: f.id + '/entry-header', material: 'timber', center: [f.upper.x, y + 3.74, z], size: [2.4, .28, .24], solid: false, textureOrigin: f.textureOrigins?.upper }, undefined, true);
    if (parts.length !== start + 3) parts.splice(start);
  }
  return parts;
}
