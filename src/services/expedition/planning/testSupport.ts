import { StreamHarness } from '../../../domain/expedition/streaming/testSupport';
import { observeStream } from '../../../domain/expedition/streaming/observation';
import { materializeTopologySpace } from '../../../domain/expedition/topology/projection';
import type { StreamActionReceipt, StreamActionRequest, StreamActionResult, StreamCommand } from '../../../domain/expedition/streaming/types';
import { streamActionSignature } from '../../../persistence/streamValidation';
import { DEFAULT_PLANNING_LIMITS, PLANNING_PROTOCOL, type PlanningBinding, type PlanningHost, type PlanningLimits } from './contracts';
import { PlanningSession } from './session';

export function planningFixture(limits: Partial<PlanningLimits> = {}) {
  const world = new StreamHarness(20261008);
  const binding: PlanningBinding = { sessionId: 'browser', epoch: 1, runId: 'run', objectiveId: 'explore', actorId: 'party',
    worldId: 'test', floorId: 'one', scopeId: 'fe6fd22e-70fb-4181-965f-7d7d92cbd23b' };
  const records = new Map<string, StreamActionReceipt>();
  const switches = { time: 0, calls: 0, released: false, loseAck: false, loseLookup: false };
  const host: PlanningHost = {
    async read() {
      const room = world.room();
      return { checkpoint: structuredClone(world.checkpoint), knowledge: room.knowledge!,
        observation: observeStream(world.checkpoint, room, room.knowledge!, materializeTopologySpace(room.space)),
        control: { sessionId: binding.sessionId, epoch: switches.released ? binding.epoch + 1 : binding.epoch } };
    },
    async lookup(request) {
      if (switches.loseLookup) throw new Error('Storage temporarily unavailable');
      const value = records.get(request.actionId);
      if (value && value.signature !== streamActionSignature(request)) throw new Error('Action ID reused');
      return structuredClone(value);
    },
    async execute(request) {
      switches.calls++;
      const prior = await host.lookup(request);
      if (prior) return prior.result;
      const before = world.checkpoint.revision;
      let result: StreamActionResult;
      if (switches.released || request.expectedRevision !== before || request.expectedTopologyRevision !== world.checkpoint.topologyRevision) {
        result = { actionId: request.actionId, disposition: 'conflict', beforeRevision: request.expectedRevision, afterRevision: before,
          topologyRevision: world.checkpoint.topologyRevision, reason: 'Conflict' };
      } else {
        const transition = await world.step(request.command);
        result = { actionId: request.actionId, disposition: transition.applied ? 'applied' : 'refused', beforeRevision: before,
          afterRevision: world.checkpoint.revision, topologyRevision: world.checkpoint.topologyRevision, reason: transition.reason };
        records.set(request.actionId, { request: structuredClone(request), signature: streamActionSignature(request), result });
      }
      if (switches.loseAck) throw new Error('Acknowledgement lost');
      return result;
    },
    async release() { switches.released = true; },
  };
  const session = new PlanningSession(host, binding, { ...DEFAULT_PLANNING_LIMITS, ...limits }, () => switches.time);
  const envelope = { protocol: PLANNING_PROTOCOL, binding };
  const message = (value: object) => JSON.stringify({ ...envelope, ...value });
  const action = (command: StreamCommand, actionId = `step-${world.checkpoint.revision}`) => message({ type: 'action.request', actionId,
    expectedRevision: world.checkpoint.revision, expectedTopologyRevision: world.checkpoint.topologyRevision, command });
  return { world, binding, records, switches, host, session, message, action };
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(finish => { resolve = finish; });
  return { promise, resolve };
}
export type { StreamActionRequest };
