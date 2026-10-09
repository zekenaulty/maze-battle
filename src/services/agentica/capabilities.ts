import type { AgenticaCapability } from './contracts';

export function mazeCapabilities(): AgenticaCapability[] {
  const topology = { name: 'topologyRevision', type: 'integer' as const, required: true, minimum: 0,
    description: 'Exact topologyRevision from the current host observation.' };
  const capability = (id: string, name: string, description: string, extra: AgenticaCapability['inputSchema']['fields'] = []): AgenticaCapability => ({
    id: `maze.${id}`, name, description, kind: id === 'observe' ? 'query' : 'action',
    effect: id === 'observe' ? 'readOnly' : 'writesLocalState',
    inputSchema: { fields: [{ ...topology }, ...extra], allowAdditionalProperties: false },
  });
  return [
    capability('observe', 'Observe room', 'Read the current visible cells and saved discoveries of this room. No hidden topology is exposed.'),
    capability('move', 'Move one cell', 'Move one cell north/east/south/west or cross a prepared doorway. Does not open chests or prepare frontiers.',
      [{ name: 'direction', type: 'string', required: true, allowedValues: ['north', 'east', 'south', 'west'] }]),
    capability('collect', 'Collect chest', 'Open the unopened chest at the current position, once. Refused if no chest is here.'),
    capability('prepare', 'Prepare visible frontier', 'Advance at most one canonical generation step for a visible known frontier. This does not move; the requested frontier may still be pending.',
      [{ name: 'frontierId', type: 'string', required: true, description: 'An exact id from visibleFrontiers in the current observation.' }]),
    capability('finish', 'Finish expedition', 'Verify sealed finite-scope exploration and all chests, at the home position. Refused until the game verifies completion.'),
  ];
}
