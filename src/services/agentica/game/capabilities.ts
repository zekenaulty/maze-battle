import type { AgenticaCapability } from '../contracts';

/** Opt-in earned projections and bounded approaches. No world-generation hints or implicit tool use. */
export function mazeCapabilities(): AgenticaCapability[] {
  const address = [
    { name: 'level', type: 'integer' as const, required: true, minimum: 1 },
    { name: 'spaceId', type: 'string' as const, required: true },
    { name: 'row', type: 'integer' as const, required: true, minimum: 0, maximum: 511 },
    { name: 'column', type: 'integer' as const, required: true, minimum: 0, maximum: 511 },
  ];
  return [
    { id: 'maze.observe', name: 'Observe', description: 'Actor/source.', kind: 'query', effect: 'readOnly',
      inputSchema: { fields: [], allowAdditionalProperties: false } },
    { id: 'maze.inspect', name: 'Inspect', description: 'Map/room/cell/frontiers; quests by status; quest by returned target. Scoped cursor.', kind: 'query', effect: 'readOnly',
      inputSchema: { fields: [{ name: 'scope', type: 'string', required: true, allowedValues: ['room', 'map', 'cell', 'frontiers', 'quests', 'quest'] },
        ...address.map(f => ({ ...f, required: false })), { name: 'cursor', type: 'string', required: false },
        { name: 'status', type: 'string', required: false, allowedValues: ['active', 'complete', 'claimed'] },
        { name: 'target', type: 'string', required: false }], allowAdditionalProperties: false } },
    { id: 'maze.navigate', name: 'Navigate', description: 'Earned address only.', kind: 'action', effect: 'writesLocalState', durableHandoff: true,
      inputSchema: { fields: address, allowAdditionalProperties: false } },
    { id: 'maze.explore', name: 'Explore', description: 'Default: approach. Room: local survey, stop on discoveries/bounds. No loot.', kind: 'action', effect: 'writesLocalState', durableHandoff: true,
      inputSchema: { fields: [{ name: 'frontier', type: 'string', required: true },
        { name: 'mode', type: 'string', required: false, allowedValues: ['room'] }], allowAdditionalProperties: false } },
    { id: 'maze.interact', name: 'Interact', description: 'Open an inspected current-tile chest. No movement.', kind: 'action', effect: 'writesLocalState', durableHandoff: true,
      inputSchema: { fields: [{ name: 'target', type: 'string', required: true }], allowAdditionalProperties: false } },
  ];
}
