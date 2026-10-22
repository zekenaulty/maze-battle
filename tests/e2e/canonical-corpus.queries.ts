import type { GameSession } from '../../src/services/game/GameSession';
import type { CanonicalHostPort, CanonicalCommit } from '../../src/services/game/CanonicalHostCommand';
import type { AgenticaAction, AgenticaObservation, AgenticaResult } from '../../src/services/agentica/contracts';
import type { WorldPosition } from '../../src/persistence/canonical/world/types';
import { readCanonicalHead } from '../../src/persistence/canonical/read';
import { createGameActionHooks } from '../../src/services/agentica/game/actionHooks';
import { actionKey, actionFingerprint } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { corpusQueryGrant } from './canonical-corpus.query-grant';

/** One explicitly selected snapshot, real reservation/dispatcher/receipt paths; no network or movement. */
export async function corpusQueries(session: GameSession, recalled: WorldPosition) {
  const granted = await corpusQueryGrant(session), before = (await readCanonicalHead()).head;
  const commits: { operation: string; stats: CanonicalCommit['stats'] }[] = [];
  const port: CanonicalHostPort = { hostSignal: session.hostSignal, submitHostCommand(command) {
    return session.submitHostCommand({ ...command, execute: async (request, options) => {
      const outcome = await command.execute(request, options);
      commits.push({ operation: request.operation, stats: outcome.stats }); return outcome;
    } });
  } };
  const hooks = createGameActionHooks(port, granted.binding);
  const frames: { action: AgenticaAction; result: AgenticaResult & { observation: AgenticaObservation } }[] = [];
  async function inspect(args: Record<string, unknown>) {
    const { run, start } = granted;
    const action: AgenticaAction = { actionId: crypto.randomUUID(), runnerRunId: crypto.randomUUID(), stepId: crypto.randomUUID(),
      runId: run.runId, sessionId: run.sessionId, sessionEpoch: run.sessionEpoch, manifestHash: run.manifestHash,
      capabilityId: 'maze.inspect', arguments: structuredClone(args), expectedRevision: start.observation.revision,
      deadlineAt: new Date(Date.now() + 60_000).toISOString() };
    await hooks.saveAction!(actionKey(action), { fingerprint: actionFingerprint(action), status: 'pending' });
    const result = await hooks.onAction!(action);
    if (!result.observation) throw Error('Query result lacks its observation');
    const observed = { ...result, observation: result.observation };
    frames.push({ action, result: observed }); return observed;
  }
  const list = await inspect({ scope: 'quests', status: 'active' });
  const entries = list.observation.data.quests as { target: string }[];
  if (list.disposition !== 'applied' || entries.length !== 1 || list.observation.data.next)
    throw Error('Expected exactly one disclosed accepted quest, without implicit paging');
  await inspect({ scope: 'quest', target: entries[0].target });
  for (const status of ['complete', 'claimed']) await inspect({ scope: 'quests', status });
  await inspect({ scope: 'objective' });
  await inspect({ scope: 'decision' });
  await inspect({ scope: 'cell', level: recalled.level, ...recalled.cell });
  await inspect({ scope: 'cell', level: recalled.level, spaceId: 'undiscovered-probe', row: 0, column: 0 });
  await inspect({ scope: 'quest', target: 'unearned-quest-handle' });
  const after = (await readCanonicalHead()).head;
  return { start: granted.start, before, after, frames, commits,
    observationBytes: frames.map(f => new TextEncoder().encode(JSON.stringify(f.result.observation)).length),
    resultBytes: frames.map(f => new TextEncoder().encode(JSON.stringify(f.result)).length) };
}
