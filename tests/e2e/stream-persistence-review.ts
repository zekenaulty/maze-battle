import './stream-persistence-fixture';
import { StreamPlanner } from '../../src/domain/expedition/streaming/planner';
import type { StreamActionRequest } from '../../src/domain/expedition/streaming/types';

const review = {
  planner: new StreamPlanner(),
  async step() {
    const { api, trace } = window.stream;
    const snapshot = await api.loadStreamSnapshot('stream');
    const control = (await api.loadStreamControl('stream'))!;
    // The planner receives only saved observations and the checkpoint, never room geometry.
    const knowledge = (await api.readStreamKnowledge('stream', snapshot.checkpoint.position.spaceId))!;
    const decision = review.planner.choose(snapshot.checkpoint, knowledge, control);
    if (!decision.command) throw new Error(decision.reason);
    const request: StreamActionRequest = { version: 2, actionId: `review-${crypto.randomUUID()}`, ...control,
      expectedRevision: snapshot.checkpoint.revision, expectedTopologyRevision: snapshot.checkpoint.topologyRevision,
      command: decision.command };
    const measured = await trace(() => api.executeStreamAction('stream', request));
    if (measured.result.disposition !== 'applied') throw new Error(JSON.stringify({ request, result: measured.result }));
    if (measured.total > (request.command.type === 'prepare' ? 43 : 16)) throw new Error('Unbounded command reads');
    return { before: snapshot, after: await api.loadStreamSnapshot('stream'), request, measured };
  },
  async firstCrossing() {
    for (let step = 0; step < 200; step++) {
      const result = await review.step();
      if (result.before.checkpoint.position.spaceId !== result.after.checkpoint.position.spaceId) return result;
    }
    throw new Error('No crossing in bounded planner fixture');
  },
};
declare global { interface Window { streamReview: typeof review } }
window.streamReview = review;
