import type { AgenticaCapability } from '../contracts';

export function directedCapabilities(): AgenticaCapability[] {
  const revision = { name: 'topologyRevision', type: 'integer' as const, required: true, minimum: 0 };
  const address = [ { name: 'spaceId', type: 'string' as const, required: true },
    { name: 'row', type: 'integer' as const, required: true, minimum: 0 },
    { name: 'column', type: 'integer' as const, required: true, minimum: 0 } ];
  return [
    { id: 'maze.observe', name: 'Observe current room', kind: 'query', effect: 'readOnly',
      description: 'Read current actor-visible evidence. No movement or interaction.',
      inputSchema: { fields: [revision], allowAdditionalProperties: false } },
    { id: 'maze.inspect', name: 'Inspect remembered cell', kind: 'query', effect: 'readOnly',
      description: 'Retrieve retained observations of one known cell. Historical evidence does not refresh unseen facts.',
      inputSchema: { fields: [revision, ...address], allowAdditionalProperties: false } },
    { id: 'maze.navigate', name: 'Travel to known destination', kind: 'action', effect: 'writesLocalState', durableHandoff: true,
      description: 'Admit browser-owned travel to the explicitly designated known destination. The host follows known paths and doorways without per-cell calls. Acceptance is not arrival. Arrival does not interact.',
      inputSchema: { fields: [revision, ...address], allowAdditionalProperties: false } },
  ];
}
