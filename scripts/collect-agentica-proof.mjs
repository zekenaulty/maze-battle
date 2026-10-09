import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const source = process.argv[2] ?? 'test-results/agentica-final';
const destination = process.argv[3] ?? 'docs/evidence/agentica-fixture-2026-10-09.json';
const sdk = await readFile('src/services/agentica/sdk/agentica-host.mjs');
const scenarios = [];
for (const directory of await readdir(source, { withFileTypes: true })) {
  if (!directory.isDirectory()) continue;
  for (const file of await readdir(join(source, directory.name))) {
    if (!file.endsWith('-evidence.json')) continue;
    const bytes = await readFile(join(source, directory.name, file));
    const proof = JSON.parse(bytes);
    if (proof.first) scenarios.push({ name: 'takeover and new-epoch continuity',
      runIds: [proof.first.runId, proof.second.runId], scopeId: proof.second.scopeId,
      epochs: [proof.first.sessionEpoch, proof.second.sessionEpoch], fencedRevision: proof.fencedRevision,
      rememberedCells: proof.rememberedCells, originalObservedAtPreserved: proof.originalObservedAtPreserved,
      exactRecoveredEntriesEqual: proof.exactRecoveredEntriesEqual, recoveredReads: proof.recoveredReads,
      finalRevision: proof.completion.revision, chests: proof.completion.collectedChests,
      boundary: proof.boundary, sourceSha256: createHash('sha256').update(bytes).digest('hex') });
    else scenarios.push({ name: proof.lostAcknowledgement ? 'lost acknowledgement' : 'first chest',
      runId: proof.runId, scopeId: proof.scopeId, revision: proof.snapshot.revision,
      visitedSpaces: proof.snapshot.visitedSpaces, chests: proof.snapshot.collectedChests,
      receiptCount: proof.receiptCount, providerCalls: proof.providerCalls, completionEvidence: proof.completionEvidence,
      replayEqual: proof.replayEqual, liveTextDelta: proof.liveTextDelta, exactSourceRecovered: proof.exactSourceRecovered,
      droppedResultReplayedExactly: proof.droppedResultReplayedExactly, sourceSha256: createHash('sha256').update(bytes).digest('hex') });
  }
}
if (scenarios.length !== 3) throw new Error('Expected all three named successful scenario artifacts.');
await mkdir('docs/evidence', { recursive: true });
await writeFile(destination, JSON.stringify({ evidence: 'Provider-free Chromium, real SDK, WebSocket, .NET Agentica runner and IndexedDB',
  serviceCommit: '10e14c6914f318761ee09b823d7f4b27af0b7c37', sdkCommit: '6dc1c6d510dde06aa67c3b0f5118e13894711af5',
  sdkSha256: createHash('sha256').update(sdk).digest('hex'),
  seed: 20261008, maxStepsPerRun: 128, maxProviderCallsPerRun: 128, liveProvider: 'NOT EXERCISED', scenarios }, null, 2) + '\n');
console.log(destination);
