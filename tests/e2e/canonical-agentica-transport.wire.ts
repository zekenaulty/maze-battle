import type { AgenticaStart } from '../../src/services/agentica/contracts';
import type { AgenticaMessage } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { launchEntryFixture, launchStartedFixture } from '../../src/persistence/canonical/agentica/launch.test-support';
import { mazeManifestDigest } from '../../src/services/agentica/game/manifestDigest';

export function durableSubmission(message: AgenticaMessage): { attemptId: string; request: AgenticaStart } {
  if (message.type !== 'start.durable' || typeof message.payload?.attemptId !== 'string' || !message.payload.request)
    throw Error('Fixture requires an exact durable-start submission');
  return message.payload;
}
export async function durableStarted(message: AgenticaMessage, runId: string) {
  const { request, attemptId } = durableSubmission(message);
  const entry = launchEntryFixture(request, attemptId, runId, await mazeManifestDigest(request.capabilities));
  return { protocolVersion: 1 as const, type: 'started', requestId: message.requestId, runId,
    payload: { ...launchStartedFixture(request, runId, entry.manifestHash), startAdmission: entry } };
}
