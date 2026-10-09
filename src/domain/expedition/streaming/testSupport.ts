import { MemoryTopology } from '../topology/memoryTopology';
import { expandTopology } from '../topology/generation';
import { materializeTopologySpace } from '../topology/projection';
import type { TopologyRecipe } from '../topology/types';
import type { StreamCheckpoint, StreamCommand, StreamKnowledgePage, StreamRoom } from './types';
import { applyStreamCommand, initializeStream } from './transition';

/** Unbounded in-memory test oracle; the browser host uses point-read pages instead. */
export class StreamHarness {
  readonly topology: MemoryTopology;
  readonly pages = new Map<string, StreamKnowledgePage>();
  checkpoint: StreamCheckpoint;

  constructor(seed = 1, level = 1) {
    const recipe: TopologyRecipe = { version: 'spaces-v2', worldId: 'test', floorId: 'one', level, seed };
    this.topology = new MemoryTopology(recipe);
    const initial = initializeStream(this.topology.header(), this.room('entry'), materializeTopologySpace);
    this.checkpoint = initial.checkpoint;
    for (const page of initial.pages) this.pages.set(page.spaceId, page);
  }

  room(id = this.checkpoint.position.spaceId): StreamRoom {
    const space = this.topology.space(id);
    if (!space) throw new Error('Missing test space');
    const sockets = Array.from({ length: this.topology.header().socketCount }, (_, index) => this.topology.socket(index)!)
      .filter(socket => socket.source.spaceId === id);
    return { space, sockets, connections: this.topology.connections(id), knowledge: structuredClone(this.pages.get(id)) };
  }

  async step(command: StreamCommand) {
    const result = await applyStreamCommand({ header: this.topology.header(), checkpoint: this.checkpoint, current: this.room(),
      geometry: materializeTopologySpace, loadRoom: async id => this.room(id), prepareNext: async () => {
        const proposal = expandTopology(this.topology, this.topology.header().revision, `command-${this.checkpoint.revision}`);
        if (proposal.status !== 'ready') throw new Error('Expected canonical expansion');
        this.topology.commit(proposal.delta);
        return this.topology.header();
      } }, command);
    if (result.applied) {
      this.checkpoint = result.checkpoint;
      for (const page of result.pages) this.pages.set(page.spaceId, page);
    }
    return result;
  }
}
