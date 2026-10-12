import { canonicalJson } from '../../services/agentica/sdk/agentica-host.mjs';
import { directions, sourceOf, validId } from '../../domain/agentic/knowledge/shared';
import type { RpgAddress, RpgEdgeFact, RpgRememberedCell } from '../../domain/agentic/knowledge/types';
import type { Direction } from '../../domain/types';
import { ancestorAt, type ObservationReader } from '../observationNodes';
import type { RpgObservationNode } from '../observationTypes';
import { requireMemory, type MemoryValue } from './types';

export function memoryWitnesses(reader: ObservationReader, head: RpgObservationNode) {
  const authorized = new Map<string, RpgObservationNode>();
  const source = async (id: string) => {
    requireMemory(validId(id));
    let node = authorized.get(id);
    if (!node) {
      node = await reader.read(id);
      requireMemory((await ancestorAt(reader, head, node.depth)).id === id);
      authorized.set(id, node);
    }
    return node;
  };
  const at = (node: RpgObservationNode, address: RpgAddress) => {
    const cell = node.observation.cells.find(c => canonicalJson(c.address) === canonicalJson(address));
    requireMemory(cell);
    return cell;
  };
  return async (value: unknown, address: RpgAddress): Promise<RpgRememberedCell | undefined> => {
    if (value === undefined) return;
    const input = value as MemoryValue;
    requireMemory(input?.kind === 'cell' && input.fact?.source && input.fact.edges && typeof input.fact.edges === 'object');
    const fact = input.fact, node = await source(fact.source.id), current = at(node, address);
    const edges: Partial<Record<Direction, RpgEdgeFact>> = {};
    requireMemory(Object.keys(fact.edges).every(d => directions.includes(d as Direction)));
    for (const d of [...current.links, ...current.blocked]) requireMemory(fact.edges[d]?.source?.id === node.id);
    for (const direction of directions) {
      const edge = fact.edges[direction];
      if (!edge) continue;
      requireMemory(edge.source);
      const witness = await source(edge.source.id), cell = at(witness, address);
      requireMemory(edge.state === 'open' ? cell.links.includes(direction) : edge.state === 'blocked' && cell.blocked.includes(direction));
      edges[direction] = { state: edge.state, source: sourceOf(witness.observation) };
    }
    const result: RpgRememberedCell = { address: current.address, roomIds: current.roomIds, chests: current.chests,
      stairs: current.stairs, source: sourceOf(node.observation), edges };
    requireMemory(canonicalJson({ kind: 'cell', fact: result }) === canonicalJson(input));
    return result;
  };
}
