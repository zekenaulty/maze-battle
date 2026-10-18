import { expect } from '@playwright/test';
import { serviceOrigin } from '../agentica-start-service/service.mjs';
import type { AgenticaAction } from '../../src/services/agentica/contracts';

export interface PendingRunEvidence {
  runId: string; hostId: string; sessionId: string; sessionEpoch: string;
  terminal: boolean; completionCompleted: boolean; unresolved: boolean;
}

/** Reads the actual retained run task, not a status string or an inferred terminal outcome. */
export async function readPendingRun(action: AgenticaAction): Promise<PendingRunEvidence> {
  const url = new URL('/fixture/run', serviceOrigin); url.searchParams.set('runId', action.runId);
  const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  expect(response.ok).toBe(true);
  const run: PendingRunEvidence = await response.json();
  expect(run).toMatchObject({ runId: action.runId, hostId: 'maze-battle',
    sessionId: action.sessionId, sessionEpoch: action.sessionEpoch });
  return run;
}

export async function waitPendingRunTerminal(action: AgenticaAction) {
  await expect.poll(async () => {
    const run = await readPendingRun(action);
    return { terminal: run.terminal, completionCompleted: run.completionCompleted, unresolved: run.unresolved };
  }, { timeout: 10_000 }).toEqual({ terminal: true, completionCompleted: true, unresolved: true });
  return readPendingRun(action);
}
