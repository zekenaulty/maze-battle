import { opposite } from '../../domain/maze/movement';
import { boundary } from '../../domain/expedition/topology/geometry';
import { validateRecipe } from '../../domain/expedition/topology/seed';
import type { ExpansionSocket, TopologyRecipe } from '../../domain/expedition/topology/types';
import { boundsBuckets } from './buckets';
import { MAX_TOPOLOGY_QUOTA, type ExpansionRequest, type TopologyRoot, type TopologySpacePage } from './types';

export function validId(value: string) {
  if (typeof value !== 'string' || !value.trim() || value.length > 128) throw new Error('Invalid topology ID');
}
export function validQuota(bytes: number) {
  if (!Number.isSafeInteger(bytes) || bytes < 1024 || bytes > MAX_TOPOLOGY_QUOTA) throw new Error('Invalid topology serialized-byte quota');
}
export function validPublicScopeId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error('Invalid public scope UUID');
  }
}
export function recipeCopy(recipe: TopologyRecipe): TopologyRecipe {
  validateRecipe(recipe);
  return { version: recipe.version, worldId: recipe.worldId, floorId: recipe.floorId, level: recipe.level, seed: recipe.seed };
}
export function recipeScope(recipe: TopologyRecipe) {
  return JSON.stringify([recipe.version, recipe.worldId, recipe.floorId, recipe.level, recipe.seed]);
}
export function validRequest(request: ExpansionRequest) {
  validId(request.requestId);
  if (typeof request.scopeId !== 'string' || request.scopeId.length > 2048 || !request.scopeId.length
    || !Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 0) throw new Error('Invalid expansion request');
}
export function validRoot(root: TopologyRoot) {
  if (Object.hasOwn(root, 'publicScopeId')) validPublicScopeId(root.publicScopeId);
  const { header } = root;
  validateRecipe(header.recipe);
  validQuota(root.quotaBytes);
  if (!Number.isSafeInteger(root.serializedBytes) || root.serializedBytes < 1 || root.serializedBytes > root.quotaBytes
    || (root.streamVersion !== undefined && root.streamVersion !== 1)
    || header.version !== 1 || header.scopeId !== recipeScope(header.recipe)
    || header.roomBudget !== 6 + 2 * header.recipe.level
    || ![header.revision, header.rooms, header.nextSocket, header.socketCount].every(Number.isSafeInteger)
    || header.revision < 0 || header.rooms !== header.revision + 1 || header.rooms > header.roomBudget
    || header.nextSocket !== header.revision || header.socketCount < header.nextSocket || header.socketCount >= header.roomBudget
    || header.start.spaceId !== 'entry' || header.start.row !== 4 || header.start.column !== 4
    || Boolean(header.seal) !== (header.nextSocket === header.socketCount)
    || (header.seal && (header.seal.revision !== header.revision || header.seal.reason !== (header.rooms === header.roomBudget ? 'budget' : 'spatial-limit')))) {
    throw new Error('Invalid topology root');
  }
}
export function validSpace(page: TopologySpacePage, id: string) {
  const { spec, schematic } = page.space;
  validId(spec.id);
  boundsBuckets({ ...spec.origin, rows: spec.rows, columns: spec.columns });
  if (!Array.isArray(spec.openings) || !Array.isArray(spec.chests) || !Array.isArray(page.connections)) throw new Error('Invalid topology space collections');
  if (page.socketSequences !== undefined && (!Array.isArray(page.socketSequences) || page.socketSequences.length > (spec.kind === 'room' ? 4 : 0)
    || new Set(page.socketSequences).size !== page.socketSequences.length
    || page.socketSequences.some(sequence => !Number.isSafeInteger(sequence) || sequence < 0))) throw new Error('Invalid room socket index');
  if (spec.id !== id || schematic !== 'stone-room-v1' || !Number.isInteger(spec.seed) || spec.seed < 0 || spec.seed > 0xffffffff
    || spec.openings.length !== 0 || !['room', 'passage'].includes(spec.kind)
    || (spec.kind === 'room' ? [spec.rows, spec.columns].some(size => size < 5 || size > 15 || size % 2 !== 1)
      : Math.min(spec.rows, spec.columns) !== 1 || Math.max(spec.rows, spec.columns) > 7)
    || spec.chests.length !== (spec.kind === 'room' && id !== 'entry' ? 1 : 0)
    || spec.chests.some(chest => chest.id !== `${id}:chest` || chest.cell.row !== 1 || chest.cell.column !== 1)
    || page.connections.length > (spec.kind === 'room' ? 4 : 2)) throw new Error('Invalid topology space page');
  const ids = new Set<string>();
  const exits = new Set<string>();
  for (const link of page.connections) {
    validId(link.id);
    if (!['north', 'east', 'south', 'west'].includes(link.direction)) throw new Error('Invalid connection direction');
    const forward = link.from.spaceId === id;
    const endpoint = forward ? link.from : link.to;
    const destination = forward ? link.to : link.from;
    const direction = forward ? link.direction : opposite(link.direction);
    const cell = boundary(spec, direction);
    validId(destination.spaceId);
    if (endpoint.spaceId !== id || destination.spaceId === id || endpoint.row !== cell.row || endpoint.column !== cell.column
      || ![destination.row, destination.column].every(value => Number.isSafeInteger(value) && value >= 0 && value < 15)
      || ids.has(link.id) || exits.has(direction)) throw new Error('Invalid connection endpoint');
    ids.add(link.id); exits.add(direction);
  }
}
export function validSocket(socket: ExpansionSocket, sequence: number) {
  validId(socket.source.spaceId);
  boundsBuckets(socket.fallback);
  if (!Number.isSafeInteger(sequence) || sequence < 0 || socket.sequence !== sequence || socket.id !== `socket-${sequence}`
    || !['pending', 'linked'].includes(socket.status) || !['north', 'east', 'south', 'west'].includes(socket.direction)
    || socket.fallback.rows !== 5 || socket.fallback.columns !== 5
    || ![socket.source.row, socket.source.column].every(value => Number.isSafeInteger(value) && value >= 0 && value < 15)) throw new Error('Invalid topology socket');
}
