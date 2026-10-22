import type { AgenticaAction, AgenticaResult } from '../../src/services/agentica/contracts';
import type { CanonicalCommit, CanonicalHostPort } from '../../src/services/game/CanonicalHostCommand';
import type { GameSession } from '../../src/services/game/GameSession';
import { createGameActionHooks } from '../../src/services/agentica/game/actionHooks';
import { actionKey, actionFingerprint } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { readLaunch } from '../../src/persistence/canonical/agentica/launch';
import { readCanonicalHead } from '../../src/persistence/canonical/read';
import { traceConnections, bytes } from './canonical-room-connections.trace';

export async function connectionsActions(session: GameSession) {
  const launch = (await readLaunch()).value!;
  const binding = { grant: launch.grant!.ref, publication: launch.binding.publication };
  const commits: { operation: string; measured: Awaited<ReturnType<typeof traceConnections<CanonicalCommit>>> }[] = [];
  const port: CanonicalHostPort = { hostSignal: session.hostSignal, submitHostCommand(command) {
    return session.submitHostCommand({ ...command, execute: async (request, options) => {
      const measured = await traceConnections(() => command.execute(request, options));
      commits.push({ operation: request.operation, measured }); return measured.value;
    } });
  } };
  const hooks = createGameActionHooks(port, binding);
  return {
    async inspect(scope: 'connections' | 'links', spaceId: string) {
      const run = launch.run!.value.data.started, start = commits.length;
      const action: AgenticaAction = { actionId: crypto.randomUUID(), runnerRunId: crypto.randomUUID(), stepId: crypto.randomUUID(),
        runId: run.runId, sessionId: run.sessionId, sessionEpoch: run.sessionEpoch, manifestHash: run.manifestHash,
        capabilityId: 'maze.inspect', arguments: { scope, level: 1, spaceId }, expectedRevision: launch.publication.wireRevision,
        deadlineAt: new Date(Date.now() + 60_000).toISOString() };
      const before = (await readCanonicalHead()).head;
      await hooks.saveAction!(actionKey(action), { fingerprint: actionFingerprint(action), status: 'pending' });
      const result = await hooks.onAction!(action), after = (await readCanonicalHead()).head;
      return { action, result, before, after, commits: commits.slice(start),
        observationBytes: bytes(result.observation), resultBytes: bytes(result) };
    },
    async replay(action: AgenticaAction, original: AgenticaResult) {
      const before = (await readCanonicalHead()).head, start = commits.length;
      const measured = await traceConnections(async () => {
        const loaded = await hooks.loadAction!(actionKey(action));
        await hooks.saveAction!(actionKey(action), { fingerprint: actionFingerprint(action), status: 'completed', result: original });
        const repeated = await hooks.onAction!(action), reconciled = await hooks.reconcileAction!(action, loaded);
        return { loaded, repeated, reconciled };
      }, true);
      return { ...measured, before, after: (await readCanonicalHead()).head, commits: commits.slice(start) };
    },
  };
}
