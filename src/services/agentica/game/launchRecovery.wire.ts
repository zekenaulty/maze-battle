import type { AgenticaStart } from '../contracts';
import { check, isObject } from '../../../persistence/canonical/validation';
import { wireId } from '../../../persistence/canonical/agentica/validation';
import { mazeManifestDigest } from './manifestDigest';

export type DiscoveredLaunch = { runId: string; manifestHash: string; status: string };
const identity = ['hostId', 'sessionId', 'sessionEpoch', 'scopeId', 'perspectiveId', 'objectiveId'] as const;

/** A live registry is positive evidence only. It cannot prove absence or full-start equivalence. */
export async function discoverOriginalRun(input: unknown, start: AgenticaStart, retainedRunId?: string): Promise<DiscoveredLaunch | null> {
  check(Array.isArray(input) && input.length <= 64 && input.every(isObject), 'invalid bounded run inventory');
  const matches = input.filter(row => identity.every(key => row[key] === start[key]));
  check(matches.length <= 1, 'ambiguous original run inventory');
  if (!matches.length) return null;
  const row = matches[0]; wireId(row.runId);
  check(row.continuation === null && row.objective === start.objective, 'discovered run differs from original objective');
  check(!retainedRunId || row.runId === retainedRunId, 'discovered run differs from retained announcement');
  check(row.manifestHash === await mazeManifestDigest(start.capabilities), 'discovered capability manifest changed');
  check(typeof row.status === 'string' && row.status.length > 0 && row.status.length <= 64, 'invalid discovered run status');
  // Status is descriptive, including "completed" or "cancelled". It never proves reconciled effects.
  return { runId: row.runId, manifestHash: row.manifestHash, status: row.status };
}

export function runRecoveryUrl(endpoint: string, runId?: string) {
  const url = new URL(endpoint);
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  url.pathname = runId === undefined ? '/api/runs' : `/api/runs/${encodeURIComponent(runId)}/cancel`;
  return url.href;
}

export function cancellationRequested(input: unknown, runId: string) {
  check(isObject(input) && input.runId === runId && input.status === 'cancel_requested', 'invalid run cancellation acknowledgement');
}
