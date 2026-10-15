import type { AgenticaStart } from '../../src/services/agentica/contracts';
import type {
  AgenticaHost, AgenticaOperationEntry, AgenticaStarted, HostDecisionAdoption, HostOperationEvent,
  HostRequestDigest, HostRunRequest, HostRunUsage, HostStartEntry, HostStartKey, HostStartReference,
  HostStartSnapshot, HostStartSubmission, HostStartTerminal,
} from '../../src/services/agentica/sdk/agentica-host.mjs';

export async function durableSurface(host: AgenticaHost, request: AgenticaStart, fetchImpl: typeof fetch) {
  const submission: HostStartSubmission = { attemptId: 'attempt', request };
  const snapshot: HostStartSnapshot = await host.startDurable(submission);
  const legacySnapshot: AgenticaStarted = snapshot;
  const key: HostStartKey = { hostId: request.hostId, sessionId: request.sessionId, attemptId: submission.attemptId };
  const entry: HostStartEntry = await host.getStart(key, { fetchImpl });
  const reference: HostStartReference = { ...key, runId: entry.runId, acceptedRequestHash: entry.acceptedRequestHash };
  const stopped: HostStartEntry = await host.stopStart(reference, { fetchImpl });
  const digest: HostRequestDigest = snapshot.manifestHash;
  const schema: 1 = stopped.schema;
  return { legacySnapshot, entry, stopped, digest, schema };
}

export function typedEcho(request: AgenticaStart): HostRunRequest {
  return {
    ...request,
    observation: { ...request.observation, facts: null },
    capabilities: request.capabilities.map(capability => ({
      ...capability,
      inputSchema: { ...capability.inputSchema, fields: capability.inputSchema.fields.map(field => ({
        ...field, description: null, allowedValues: null, example: null, minimum: null, maximum: null,
      })) },
    })),
    provider: { ...request.provider, model: null, thinkingEffort: null, geminiApi: null, thinkingEffortResolved: true },
    limits: { ...request.limits, maxRecentObservations: 6, maxRecentReceipts: 6 },
  };
}

export function terminalUsage(entry: HostStartEntry): HostRunUsage | null {
  if (entry.terminal === null) return null;
  if (entry.terminal.reason === 'interrupted') {
    const unknown: true = entry.terminal.usageUnknown;
    const usage: null = entry.terminal.usage;
    return unknown ? usage : null;
  }
  const known: false = entry.terminal.usageUnknown;
  const usage: HostRunUsage = entry.terminal.usage;
  return known ? null : usage;
}

export async function richerExistingSurface(host: AgenticaHost, request: AgenticaStart, event: HostOperationEvent, adoption: HostDecisionAdoption) {
  const started: AgenticaStarted = await host.start(request);
  const operations: AgenticaOperationEntry[] = await host.listOperations({ hostId: request.hostId, sessionId: request.sessionId });
  const signalled: AgenticaOperationEntry = await host.signalOperation(event);
  const stopped: AgenticaOperationEntry = await host.stopDecision(event);
  const woke: AgenticaStarted = await host.wakeOperation(event);
  const adopted: AgenticaStarted = await host.adoptDecision(event, adoption);
  const retained: HostDecisionAdoption | undefined = stopped.wakeAdoption;
  return { started, operations, signalled, stopped, woke, adopted, retained };
}

export function rejectedShapes(host: AgenticaHost, key: HostStartKey, entry: HostStartEntry) {
  // @ts-expect-error Stop requires the exact run and accepted-request digest.
  void host.stopStart(key);
  // @ts-expect-error Durable submission requires a frozen attempt identity.
  void host.startDurable({ request: entry.originalRequest });
  // @ts-expect-error Wire echoes with nullable/default fields are not narrow launch inputs.
  const narrow: AgenticaStart = entry.originalRequest;
  // @ts-expect-error Unknown interrupted usage cannot be represented as known counters.
  const interrupted: HostStartTerminal = { reason: 'interrupted', usage: { steps: 0, refinements: 0, continuations: 0, providerCalls: 0 }, usageUnknown: true, settledAt: 'now' };
  // @ts-expect-error A stopped terminal requires known original-run usage.
  const stopped: HostStartTerminal = { reason: 'stopped', usage: null, usageUnknown: false, settledAt: 'now' };
  return { narrow, interrupted, stopped };
}
