import type { GameView } from './GameView';
import type { CanonicalReceipt, Json } from '../../persistence/canonical/types';
import { autoEnabled } from '../../persistence/canonical/auto/source';

export interface CanonicalAutoSession {
  readonly owner: string;
  view: { game?: Pick<GameView, 'id' | 'snapshot' | 'checkpoint' | 'mode' | 'townReturnMode'> & { autoThrottleMs: number };
    controlled: boolean; busy?: boolean; recoveryRequired?: boolean };
  execute(kind: 'auto', input: Json): Promise<CanonicalReceipt>;
}

/** Disposable scheduler only. Objectives/routes are canonical, and every tick rechecks mode in its transaction. */
export class CanonicalAutoController {
  private readonly session: CanonicalAutoSession;
  private readonly changed: (message: string) => void;
  private timer?: ReturnType<typeof setTimeout>;
  private pending = false;
  private token = 0;
  private scope = '';
  private enabled = false;
  private blocked = false;
  private paused = false;
  private disposed = false;
  constructor(session: CanonicalAutoSession, changed: (message: string) => void = () => {}) { this.session = session; this.changed = changed; }

  update(blocked: boolean) {
    if (this.disposed) return;
    const { game, controlled, recoveryRequired } = this.session.view;
    const scope = game ? JSON.stringify([game.id, game.snapshot.generation, game.checkpoint.position.level, this.session.owner]) : '';
    const enabled = Boolean(game && autoEnabled(game));
    if (!enabled) { this.cancel(); this.paused = false; }
    else if (blocked || !controlled || recoveryRequired || this.enabled && scope !== this.scope) this.cancel();
    else if (!this.enabled) this.paused = false;
    this.scope = scope; this.enabled = enabled; this.blocked = blocked;
    this.schedule();
  }
  cancel = () => {
    this.token++; this.paused = true;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  };
  dispose = () => { this.disposed = true; this.cancel(); };
  private available() {
    const { game, controlled, busy, recoveryRequired } = this.session.view;
    return !this.disposed && !this.paused && !this.blocked && !busy && controlled && !recoveryRequired && game && autoEnabled(game)
      && this.scope === JSON.stringify([game.id, game.snapshot.generation, game.checkpoint.position.level, this.session.owner]);
  }
  private schedule() {
    if (!this.available() || this.pending || this.timer !== undefined) return;
    const ms = this.session.view.game!.autoThrottleMs;
    if (!Number.isSafeInteger(ms) || ms < 0 || ms > 5000) { this.cancel(); this.changed('Invalid Auto throttle.'); return; }
    this.timer = setTimeout(() => { this.timer = undefined; void this.tick(); }, Math.max(16, ms));
  }
  private async tick() {
    if (!this.available() || this.pending) return;
    const token = this.token, game = this.session.view.game!, revision = game.snapshot.revision;
    this.pending = true;
    try {
      const receipt = await this.session.execute('auto', { kind: 'tick', revision });
      if (token !== this.token || this.disposed) return;
      const result = receipt.result;
      if (!result || typeof result !== 'object' || Array.isArray(result) || receipt.beforeRevision !== revision
        || receipt.afterRevision !== this.session.view.game?.snapshot.revision) { this.cancel(); this.changed('Auto publication changed; resume explicitly.'); return; }
      this.changed(typeof result.reason === 'string' ? result.reason : 'Auto paused.');
      if (!['applied', 'planning'].includes(String(result.outcome))) this.cancel();
    } catch (error) {
      if (token === this.token && !this.disposed) { this.cancel(); this.changed(error instanceof Error ? error.message : 'Auto failed.'); }
    } finally { this.pending = false; this.schedule(); }
  }
}
