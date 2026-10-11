import type { AgenticaMessage } from '../sdk/agentica-host.mjs';
import { readLabJson } from './configuration';

export interface LaunchUsage { steps: number; refinements: number; continuations: number; providerCalls: number }
export const EMPTY_USAGE: LaunchUsage = { steps: 0, refinements: 0, continuations: 0, providerCalls: 0 };
export function messageSummary(message: AgenticaMessage): string {
  const p = message.payload;
  if (message.type === 'progress') {
    const r = p.record ?? {};
    return [r.kind, r.activity, r.finishReason, r.reason,
      Number.isFinite(r.outputCharacters) ? `${r.outputCharacters} output characters` : undefined,
      Number.isFinite(r.elapsedMs) ? `${r.elapsedMs}ms` : undefined,
      p.droppedRecords > 0 ? `${p.droppedRecords} telemetry updates dropped` : undefined,
    ].filter(v => typeof v === 'string').join(' / ').slice(0, 1200) || 'Provider activity';
  }
  if (message.type === 'outcome') return [p.outcome?.status, p.outcome?.stopReason, p.outcome?.summary].filter(Boolean).join(': ');
  if (message.type === 'run.terminated' || message.type === 'error') return [p.code, p.message].filter(Boolean).join(': ');
  if (message.type === 'action.pending') return String(p.capabilityId ?? 'Action requested');
  if (message.type === 'action.accepted') return `${p.disposition ?? ''} ${p.evidenceId ?? ''}`;
  if (message.type === 'operation.parked') return 'Journey admitted; browser movement active';
  return String(p.status ?? p.runId ?? message.runId ?? message.type);
}
export async function readLaunchUsage(url: string, runId: string): Promise<LaunchUsage> {
  const data = await readLabJson(url, `/api/runs/${encodeURIComponent(runId)}`) as { usage?: LaunchUsage };
  const usage = data.usage;
  if (!usage || Object.keys(EMPTY_USAGE).some(key => !Number.isSafeInteger(usage[key as keyof LaunchUsage]) || usage[key as keyof LaunchUsage] < 0)) {
    throw new Error('Lab usage is unavailable.');
  }
  return { steps: usage.steps, refinements: usage.refinements, continuations: usage.continuations, providerCalls: usage.providerCalls };
}
