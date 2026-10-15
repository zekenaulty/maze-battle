import { describe, expect, it } from 'vitest';
import { launchStartFixture } from '../../../persistence/canonical/agentica/launch.test-support';
import { mazeManifestDigest } from './manifestDigest';
import { cancellationRequested, discoverOriginalRun, runRecoveryUrl } from './launchRecovery.wire';

async function sample() {
  const start = launchStartFixture();
  const { hostId, sessionId, sessionEpoch, scopeId, perspectiveId, objectiveId, objective } = start;
  const row = { hostId, sessionId, sessionEpoch, scopeId, perspectiveId, objectiveId, objective,
    continuation: null, runId: 'original/run', status: 'running', manifestHash: await mazeManifestDigest(start.capabilities) };
  return { start, row };
}
describe('uncertain launch discovery is positive, partial evidence only', () => {
  it('returns only compact metadata, not potentially privileged remote context', async () => {
    const { start, row } = await sample();
    expect(await discoverOriginalRun([{ ...row, context: { hiddenMap: 'must not escape' } }], start)).toEqual({
      runId: row.runId, status: row.status, manifestHash: row.manifestHash,
    });
  });
  it('does not infer missing original request fields from the current provider or limits', async () => {
    const { start, row } = await sample();
    // Snapshot identity cannot certify these omitted fields. The caller always reports equivalence unverified.
    const changed = structuredClone(start); changed.limits.maxSteps++; changed.observation.data = { changed: true };
    expect(await discoverOriginalRun([row], changed)).not.toBeNull();
  });
  it.each(['hostId', 'sessionId', 'sessionEpoch', 'scopeId', 'perspectiveId', 'objectiveId'] as const)
    ('never matches a different %s', async key => {
      const { start, row } = await sample();
      expect(await discoverOriginalRun([{ ...row, [key]: 'foreign' }], start)).toBeNull();
    });
  it('cannot substitute a different run for a retained announcement', async () => {
    const { start, row } = await sample();
    await expect(discoverOriginalRun([row], start, 'different-run')).rejects.toThrow('retained announcement');
  });
  it.each([null, {}, ['invalid'], Array.from({ length: 65 }, () => ({}))])('rejects malformed inventory %j', async value => {
    await expect(discoverOriginalRun(value, launchStartFixture())).rejects.toThrow('bounded run inventory');
  });
  it('encodes the run path and retains only the authorized service origin', () => {
    expect(runRecoveryUrl('wss://example.test/api/host', 'id/with?characters')).toBe('https://example.test/api/runs/id%2Fwith%3Fcharacters/cancel');
    expect(runRecoveryUrl('ws://127.0.0.1:5198/api/host')).toBe('http://127.0.0.1:5198/api/runs');
  });
  it('accepts only the requested run cancellation acknowledgement', () => {
    expect(() => cancellationRequested({ runId: 'run', status: 'cancel_requested' }, 'run')).not.toThrow();
    for (const row of [null, { runId: 'other', status: 'cancel_requested' }, { runId: 'run', status: 'cancelled' }])
      expect(() => cancellationRequested(row, 'run')).toThrow('cancellation acknowledgement');
  });
});
