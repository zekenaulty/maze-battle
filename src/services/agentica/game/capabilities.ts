import type { AgenticaCapability } from '../contracts';

/** Opt-in projections; only navigation is an effect. No world-generation hints or implicit tool use. */
export function mazeCapabilities(): AgenticaCapability[] {
  const address = [
    { name: 'level', type: 'integer' as const, required: true, minimum: 1 },
    { name: 'spaceId', type: 'string' as const, required: true },
    { name: 'row', type: 'integer' as const, required: true, minimum: 0, maximum: 511 },
    { name: 'column', type: 'integer' as const, required: true, minimum: 0, maximum: 511 },
  ];
  return [
    { id: 'maze.observe', name: 'Observe', description: 'Actor and earned sight source.', kind: 'query', effect: 'readOnly',
      inputSchema: { fields: [], allowAdditionalProperties: false } },
    { id: 'maze.inspect', name: 'Inspect', description: 'Map lists rooms only. Cell requires all address fields. Room pages a 16x16 query window, not room bounds. Cursor continues the same query.', kind: 'query', effect: 'readOnly',
      inputSchema: { fields: [{ name: 'scope', type: 'string', required: true, allowedValues: ['room', 'map', 'cell'] },
        ...address.map(f => ({ ...f, required: false })), { name: 'cursor', type: 'string', required: false }], allowAdditionalProperties: false } },
    { id: 'maze.navigate', name: 'Navigate', description: 'Navigate to an earned local address; arrival does not interact.', kind: 'action', effect: 'writesLocalState', durableHandoff: true,
      inputSchema: { fields: address, allowAdditionalProperties: false } },
  ];
}
