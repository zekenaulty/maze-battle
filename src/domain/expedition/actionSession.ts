import type { ExpeditionCheckpoint, ExpeditionCommand, ExpeditionObservation } from './types';
import { commandSignature, type ExpeditionActionRequest, type ExpeditionActionResult } from './protocol';

interface ActionHost {
  checkpoint(): ExpeditionCheckpoint;
  observe(): ExpeditionObservation;
  execute(command: ExpeditionCommand): Promise<{ applied: boolean; reason: string }>;
}

/** Reliable results are retained separately from any lossy UI progress stream. */
export class ExpeditionActionSession {
  private epoch = 0;
  private busy = false;
  private results = new Map<string, { signature: string; result: Promise<ExpeditionActionResult> }>();
  readonly sessionId: string;
  private host: ActionHost;
  private maxActions: number;

  constructor(sessionId: string, host: ActionHost, maxActions = 4096) {
    if (!sessionId || !Number.isSafeInteger(maxActions) || maxActions < 1) throw new Error('Invalid action session limits.');
    this.sessionId = sessionId;
    this.host = host;
    this.maxActions = maxActions;
  }

  get currentEpoch() { return this.epoch; }
  takeOver() { return ++this.epoch; }
  async result(actionId: string) {
    const pending = this.results.get(actionId);
    return pending ? structuredClone(await pending.result) : undefined;
  }

  async request(request: ExpeditionActionRequest): Promise<ExpeditionActionResult> {
    const revision = this.host.checkpoint().revision;
    const refused = (disposition: ExpeditionActionResult['disposition'], reason: string): ExpeditionActionResult => ({
      actionId: typeof request?.actionId === 'string' ? request.actionId : '', disposition, reason,
      beforeRevision: revision, afterRevision: revision,
    });
    let command: ExpeditionCommand;
    let signature: string;
    try {
      if (request.version !== 1 || request.sessionId !== this.sessionId || typeof request.actionId !== 'string'
        || !request.actionId || request.actionId.length > 128 || !Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 0
        || !Number.isSafeInteger(request.epoch) || request.epoch < 0) throw new Error('Invalid request.');
      command = JSON.parse(JSON.stringify(request.command)) as ExpeditionCommand;
      signature = JSON.stringify([request.sessionId, request.epoch, request.expectedRevision, commandSignature(command)]);
    } catch { return refused('refused', 'Invalid action request.'); }
    const previous = this.results.get(request.actionId);
    if (previous) return previous.signature === signature ? structuredClone(await previous.result) : refused('refused', 'Action ID was reused with different input.');
    if (request.epoch !== this.epoch) return refused('conflict', 'Control ownership changed.');
    if (request.expectedRevision !== revision) return refused('conflict', 'World revision changed.');
    if (this.busy) return refused('unavailable', 'An action is already in flight.');
    if (this.results.size >= this.maxActions) return refused('unavailable', 'Session action budget exhausted. Start a new session.');
    this.busy = true;
    const result = this.execute(request.actionId, revision, command);
    this.results.set(request.actionId, { signature, result });
    return structuredClone(await result);
  }

  private async execute(actionId: string, revision: number, command: ExpeditionCommand): Promise<ExpeditionActionResult> {
    try {
      const transition = await this.host.execute(command);
      return { actionId, disposition: transition.applied ? 'applied' : 'refused', reason: transition.reason,
        beforeRevision: revision, afterRevision: this.host.checkpoint().revision, observation: this.host.observe() };
    } catch (error) {
      return { actionId, disposition: 'unresolved', beforeRevision: revision, afterRevision: this.host.checkpoint().revision,
        reason: error instanceof Error ? error.message : 'Action outcome is unresolved.' };
    } finally { this.busy = false; }
  }
}
