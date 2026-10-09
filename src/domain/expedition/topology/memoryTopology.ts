import { createTopology, expandTopology } from './generation';
import { OccupancyIndex } from './occupancy';
import type { Bounds, ExpansionSocket, TopologyConnection, TopologyDelta, TopologyHeader, TopologyReader, TopologyRecipe, TopologySpace } from './types';

/** Reference host for qualification. Durable paging must replace its world maps. */
export class MemoryTopology implements TopologyReader {
  private current!: TopologyHeader;
  private readonly spaces = new Map<string, TopologySpace>();
  private readonly sockets = new Map<number, ExpansionSocket>();
  private readonly links = new Map<string, TopologyConnection[]>();
  private readonly receipts = new Map<string, { signature: string; revision: number }>();
  private readonly receiptLimit: number;
  readonly occupancy = new OccupancyIndex();

  constructor(recipe: TopologyRecipe, receiptLimit = 4096) {
    if (!Number.isSafeInteger(receiptLimit) || receiptLimit < 1) throw new Error('Invalid receipt budget');
    this.receiptLimit = receiptLimit;
    this.commit(createTopology(recipe));
  }

  header() { return structuredClone(this.current); }
  space(id: string) { return structuredClone(this.spaces.get(id)); }
  socket(sequence: number) { return structuredClone(this.sockets.get(sequence)); }
  occupied(bounds: Bounds, except?: string) { return this.occupancy.occupied(bounds, except); }
  connections(spaceId: string) { return structuredClone(this.links.get(spaceId) ?? []); }
  spaceIds() { return [...this.spaces.keys()]; }

  commit(input: TopologyDelta): { status: 'applied' | 'duplicate' | 'conflict'; revision: number } {
    const signature = JSON.stringify(input);
    const receipt = this.receipts.get(input.requestId);
    if (receipt) {
      if (receipt.signature !== signature) throw new Error('Expansion request identity reused with changed input');
      return { status: 'duplicate', revision: receipt.revision };
    }
    if (this.current && (input.scopeId !== this.current.scopeId || input.expectedRevision !== this.current.revision)) {
      return { status: 'conflict', revision: this.current.revision };
    }
    if (this.receipts.size >= this.receiptLimit) throw new Error('Expansion receipt budget exhausted');
    // Re-derive the small proposal before publishing any writes. Never accept partial/forged deltas.
    const proposal = this.current ? expandTopology(this, input.expectedRevision, input.requestId) : undefined;
    const expected = this.current ? proposal?.status === 'ready' ? proposal.delta : undefined : createTopology(input.header.recipe);
    if (!expected || JSON.stringify(expected) !== signature) throw new Error('Invalid topology transaction');
    const delta = structuredClone(input);
    for (const id of delta.removeOccupancy) this.occupancy.remove(id);
    for (const entry of delta.addOccupancy) this.occupancy.add(entry);
    for (const value of delta.spaces) this.spaces.set(value.spec.id, value);
    for (const socket of delta.sockets) this.sockets.set(socket.sequence, socket);
    if (delta.resolved) this.sockets.set(delta.resolved.sequence, delta.resolved);
    for (const link of delta.connections) {
      for (const id of [link.from.spaceId, link.to.spaceId]) this.links.set(id, [...(this.links.get(id) ?? []), link]);
    }
    this.current = delta.header;
    this.receipts.set(delta.requestId, { signature, revision: delta.header.revision });
    return { status: 'applied', revision: delta.header.revision };
  }
}
