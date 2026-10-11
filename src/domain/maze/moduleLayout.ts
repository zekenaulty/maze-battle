import type { MazeLayoutState } from '../types';
import { validateModuleRecipe } from '../expedition/topology/modules/policy';

export function normalizeModuleMetadata(layout: MazeLayoutState): MazeLayoutState['assembly'] {
  if (layout.version !== 'structured-v3') {
    if (layout.assembly) throw new Error('Module metadata attached to a legacy layout');
    return undefined;
  }
  const metadata = layout.assembly;
  if (!metadata || metadata.schematic !== 'stone-room-v1') throw new Error('Missing or unsupported module schematic');
  validateModuleRecipe(metadata.recipe);
  if (!metadata.origin || ![metadata.origin.row, metadata.origin.column].every(Number.isSafeInteger)
    || layout.rooms?.length !== metadata.recipe.roomBudget || layout.connections?.length !== layout.rooms.length - 1) {
    throw new Error('Incomplete module layout');
  }
  const ids = new Set(layout.rooms.map(room => room.id));
  if (ids.size !== layout.rooms.length || layout.connections.some(edge => !ids.has(edge.fromRoomId) || !ids.has(edge.toRoomId))) {
    throw new Error('Invalid module identity or connection');
  }
  return structuredClone(metadata);
}
