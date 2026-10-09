import './paged-topology-fixture';
import * as api from '../../src/persistence/streamRepository';
import * as topology from '../../src/persistence/topologyRepository';
import { loadStreamRoom } from '../../src/persistence/streamRecords';
import { createTopology } from '../../src/domain/expedition/topology/generation';
import { recordBytes } from '../../src/persistence/topology/database';
import { boundsBuckets } from '../../src/persistence/topology/buckets';
import { materializeTopologySpace, resolvedSpaceSpec } from '../../src/domain/expedition/topology/projection';
import type { StreamActionRequest, StreamCommand } from '../../src/domain/expedition/streaming/types';
import { playSmallFloor } from './stream-persistence-play';

const recipe = { ...window.paged.recipe, level: 1 };
const harness = {
  api, topology, recipe, loadStreamRoom, createTopology, recordBytes, boundsBuckets, materializeTopologySpace, resolvedSpaceSpec,
  raw: window.paged.snapshot, trace: window.paged.trace, openDB: window.paged.openDB, playSmallFloor,
  async setup(quotaBytes?: number, slot = 'stream') {
    const snapshot = await api.createStreamSlot(slot, recipe, quotaBytes);
    const control = await api.claimStreamControl(slot, 'owner-a', null);
    return { snapshot, control };
  },
  async request(command: StreamCommand, actionId: string = crypto.randomUUID(), slot = 'stream'): Promise<StreamActionRequest> {
    const { checkpoint } = await api.loadStreamSnapshot(slot);
    const control = (await api.loadStreamControl(slot))!;
    return { version: 2, actionId, ...control, expectedRevision: checkpoint.revision, expectedTopologyRevision: checkpoint.topologyRevision, command };
  },
  async act(command: StreamCommand, actionId: string = crypto.randomUUID(), slot = 'stream') {
    return api.executeStreamAction(slot, await harness.request(command, actionId, slot));
  },
};
declare global { interface Window { stream: typeof harness } }
window.stream = harness;
