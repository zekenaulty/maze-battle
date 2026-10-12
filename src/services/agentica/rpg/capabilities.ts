import type { AgenticaCapability } from '../contracts';

export function rpgCapabilities(): AgenticaCapability[] {
  const address = ['row', 'column'].map(name => ({ name, type: 'integer' as const, required: true,
    minimum: 0, maximum: Number.MAX_SAFE_INTEGER - 1 }));
  const page = (maximum: number): AgenticaCapability['inputSchema']['fields'] => [
    { name: 'limit', type: 'integer', required: true, minimum: 1, maximum },
    { name: 'snapshotId', type: 'string', required: false, description: 'Source head ID; required when after is supplied.' },
    { name: 'after', type: 'string', required: false, description: 'Returned next cursor, with its matching snapshotId.' },
  ];
  const capability = (id: string, name: string, description: string,
    fields: AgenticaCapability['inputSchema']['fields'], navigate = false): AgenticaCapability => ({
    id, name, description, kind: navigate ? 'action' : 'query', effect: navigate ? 'writesLocalState' : 'readOnly',
    ...(navigate ? { durableHandoff: true } : {}), inputSchema: { fields, allowAdditionalProperties: false },
  });
  return [
    capability('maze.observe', 'Observe current receipt', 'Read bounded cells from the current retained observation. No movement or refresh.', []),
    capability('maze.navigate', 'Travel to remembered cell',
      'Admit host-owned travel to any earned target on the bound floor. The engine checks a known route. Acceptance is not arrival; arrival does not interact.', address, true),
    capability('maze.inspect', 'Inspect remembered cell',
      'Read retained evidence for one cell on the bound floor, preserving source times. Unknown cells remain unknown; this does not refresh unseen state.', address.map(field => ({ ...field }))),
    capability('maze.room', 'Read remembered room',
      'Read one page of remembered cells in a room on the bound floor. Continue using next and snapshotId; original evidence times are retained.',
      [{ name: 'roomId', type: 'string', required: true }, ...page(32)]),
    capability('maze.map', 'Read remembered room summaries',
      'Read a page of remembered room IDs and cell counts on the bound floor, without interiors. Continue using next and snapshotId. No unseen facts are refreshed.', page(12)),
  ];
}
