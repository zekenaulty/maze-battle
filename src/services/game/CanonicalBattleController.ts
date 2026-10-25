import type { ActorState, BattleState, GameMode } from '../../domain/types';
import type { CanonicalReceipt, CanonicalSnapshot, Json, JsonObject } from '../../persistence/canonical/types';

export interface BattleScheduleView {
  id: string;
  snapshot: Pick<CanonicalSnapshot, 'generation' | 'revision'>;
  checkpoint: { position: { level: number } };
  mode: GameMode;
  party: Pick<ActorState, 'autoBattle'>[];
  battle?: Pick<BattleState, 'id' | 'status'>;
  battleAutomationPaused?: boolean;
  autoThrottleMs: number;
}
export interface CanonicalBattleSession {
  readonly owner: string;
  view: { game?: BattleScheduleView; controlled: boolean; busy?: boolean; recoveryRequired?: boolean };
  execute(kind: 'combat', input: Json): Promise<CanonicalReceipt>;
}

/** Schedules intent only. The canonical command rechecks revision, battle and policy. */
export class CanonicalBattleController {
  private timer?: ReturnType<typeof setTimeout>;
  private pending = false;
  private blocked = true;
  private disposed = false;
  private halted = false;
  private token = 0;
  private source = '';
  private phase = '';
  private readonly session: CanonicalBattleSession;
  private readonly changed: (message: string) => void;
  constructor(session: CanonicalBattleSession, changed: (message: string) => void = () => {}) {
    this.session = session; this.changed = changed;
  }

  private intention(): (JsonObject & { revision: number }) | null {
    const game = this.session.view.game;
    if (!game || game.battleAutomationPaused) return null;
    if (game.battle?.status === 'active' && game.party.some(actor => actor.autoBattle))
      return { kind: 'tick', battleId: game.battle.id, revision: game.snapshot.revision };
    if (!game.battle && game.mode === 'waves') return { kind: 'start', returnMode: 'waves', revision: game.snapshot.revision };
    return null;
  }
  private identity() {
    const game = this.session.view.game;
    return game ? JSON.stringify([game.id, game.snapshot.generation, game.checkpoint.position.level, this.session.owner]) : '';
  }
  update(blocked: boolean) {
    if (this.disposed) return;
    const intent = this.intention(), source = this.identity(), phase = String(intent?.battleId ?? intent?.kind ?? '');
    if (source !== this.source) { this.cancel(); this.halted = Boolean(this.source); }
    if (phase !== this.phase || !intent) this.halted = false;
    if (blocked || !this.session.view.controlled || this.session.view.recoveryRequired || !intent) this.cancel();
    this.source = source; this.phase = phase; this.blocked = blocked;
    this.schedule();
  }
  cancel = () => {
    this.token++;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  };
  dispose = () => { this.disposed = true; this.cancel(); };
  private available() {
    const view = this.session.view;
    return !this.disposed && !this.halted && !this.blocked && !view.busy && view.controlled && !view.recoveryRequired
      && this.source === this.identity() && this.intention();
  }
  private schedule() {
    if (!this.available() || this.pending || this.timer !== undefined) return;
    const ms = this.session.view.game!.autoThrottleMs;
    if (!Number.isSafeInteger(ms) || ms < 0 || ms > 5000) { this.halted = true; this.changed('Invalid battle throttle.'); return; }
    this.timer = setTimeout(() => { this.timer = undefined; void this.tick(); }, Math.max(16, ms));
  }
  private async tick() {
    const intent = this.available();
    if (!intent || this.pending) return;
    const token = this.token, source = this.source;
    this.pending = true;
    try {
      const receipt = await this.session.execute('combat', intent);
      if (this.disposed || token !== this.token || source !== this.identity()) return;
      const game = this.session.view.game!, result = receipt.result;
      if (receipt.gameId !== game.id || receipt.generation !== game.snapshot.generation
        || receipt.beforeRevision !== intent.revision || receipt.afterRevision !== game.snapshot.revision
        || !result || typeof result !== 'object' || Array.isArray(result)
        || !['applied', 'unchanged'].includes(String(result.outcome))) {
        this.halted = true; this.changed('Battle automation stopped; confirm the current state before resuming.');
      }
    } catch (error) {
      if (!this.disposed && token === this.token) {
        this.halted = true; this.changed(error instanceof Error ? error.message : 'Battle automation failed.');
      }
    } finally {
      this.pending = false;
      if (!this.disposed) this.update(this.blocked);
    }
  }
}
