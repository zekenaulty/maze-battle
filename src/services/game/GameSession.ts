import type { SaveSummary } from '../../domain/types';
import { readCanonical, readCanonicalHead, snapshotOf } from '../../persistence/canonical/read';
import { controlCanonical } from '../../persistence/canonical/transaction';
import { createCanonicalGame, hasCanonicalGame } from '../../persistence/canonical/game/initialize';
import { prepareGameFloor } from '../../persistence/canonical/game/preparation';
import { gameCheckpoint } from '../../persistence/canonical/game/checkpoint';
import { projectGame } from '../../persistence/canonical/game/projection';
import { executeExplorationCommand } from '../../persistence/canonical/game/explorationCommand';
import { executeRosterCommand } from '../../persistence/canonical/game/rosterCommand';
import { executeContentCommand } from '../../persistence/canonical/game/contentCommand';
import { executeSettingsCommand } from '../../persistence/canonical/game/settings';
import { executeAutoCommand } from '../../persistence/canonical/auto/command';
import { executeSaveCommand, listManualSaves } from '../../persistence/canonical/game/manualSaves';
import { ManualSaveLimitError } from '../../persistence/canonical/game/saveLimits';
import type { CanonicalHead, CanonicalReceipt, Json, JsonObject } from '../../persistence/canonical/types';
import { BrowserSaveLock } from './BrowserSaveLock';
import type { GameDiagnostic, GameView } from './GameView';
import { gameRequest } from './canonicalRequests';
import { captureHostCommand, type CanonicalHostCommand } from './CanonicalHostCommand';
import { captureHostCleanup, executeHostCleanup, type HostCleanup } from './CanonicalHostRecovery';
import type { WorldPosition } from '../../persistence/canonical/world/types';
import { executeBattleCommand } from '../../persistence/canonical/combat/command';
import { loadBattle } from '../../persistence/canonical/combat/records';
import { spatialBinding } from './SpatialView';

export interface GameSessionView {
  game?: GameView; saves: SaveSummary[]; diagnostics: GameDiagnostic[];
  status: string; controlled: boolean; recoveryRequired?: boolean; busy?: boolean;
}
export type CommandKind = 'exploration' | 'roster' | 'content' | 'settings' | 'auto' | 'combat';
const handlers = { exploration: executeExplorationCommand, roster: executeRosterCommand,
  content: executeContentCommand, settings: executeSettingsCommand, auto: executeAutoCommand, combat: executeBattleCommand };
class AgenticControlError extends Error {
  constructor() { super('Manual control is unavailable during Agentic Play.'); }
}
class StalePositionInputError extends Error {
  constructor() { super('Movement cancelled: the actor has moved since this input.'); }
}
class StaleBattleInputError extends Error {
  constructor() { super('Battle input cancelled: that battle has ended.'); }
}

/** One serialized writer. It publishes bounded projections, never accepts full-game reducers. */
export class GameSession {
  readonly owner = crypto.randomUUID();
  view: GameSessionView = { saves: [], diagnostics: [], status: 'Loading', controlled: false };
  private head?: CanonicalHead;
  private queue: Promise<unknown> = Promise.resolve();
  private lifetime = new AbortController();
  get hostSignal() { return this.lifetime.signal; }
  private active = false;
  private refreshing = false;
  private manualVersion = 0;
  private agenticControl?: { gameId: string; generation: string; epoch: number; release: () => void };
  private readonly lock = new BrowserSaveLock(() => this.stop('Read only: control moved to another tab.'));
  private readonly changed: (view: GameSessionView) => void;
  constructor(changed: (view: GameSessionView) => void) { this.changed = changed; }
  private publish(patch: Partial<GameSessionView>) {
    if (patch.controlled === false) this.agenticControl?.release();
    this.view = { ...this.view, ...patch }; this.changed(this.view);
  }
  private assert(signal: AbortSignal) { signal.throwIfAborted(); if (!this.active) throw new Error('Inactive game session'); }
  /** Local exclusion, not host authority. After acquisition, flush and recheck control/Auto before preparing a run. */
  acquireAgenticControl = (): (() => void) => {
    const signal = this.lifetime.signal; this.assert(signal);
    this.assertManualControl();
    if (!this.view.controlled || this.view.busy || this.view.recoveryRequired
      || !this.head || this.head.owner !== this.owner || this.head.status !== 'ready'
      || this.lock.supported && !this.lock.held) throw new Error('Game control unavailable');
    const checkpoint = gameCheckpoint(this.head.checkpoint);
    if (checkpoint.mode === 'auto-play' || checkpoint.townReturnMode === 'auto-play') throw new Error('Disable Auto before Agentic Play.');
    if (checkpoint.mode === 'battle' || checkpoint.mode === 'waves' || checkpoint.townReturnMode === 'waves' || this.view.game?.battle)
      throw new Error('Stop battle automation before Agentic Play.');
    const release = () => {
      if (this.agenticControl?.release !== release) return;
      this.agenticControl = undefined; signal.removeEventListener('abort', release);
    };
    const { gameId, generation, epoch } = this.head;
    // Earlier manual admissions stay invalid even if this lease is released before they dequeue.
    this.agenticControl = { gameId, generation, epoch, release }; this.manualVersion++;
    signal.addEventListener('abort', release, { once: true });
    return release;
  };
  private assertManualControl(version = this.manualVersion) {
    if (this.agenticControl || version !== this.manualVersion) throw new AgenticControlError();
  }
  private async manual<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const version = this.manualVersion; this.assertManualControl(version);
    return this.owned(signal => { this.assertManualControl(version); return work(signal); });
  }
  private enqueue<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const signal = this.lifetime.signal;
    const pending = this.queue.catch(() => {}).then(async () => { this.assert(signal); return work(signal); });
    this.queue = pending.catch(error => {
      if (signal.aborted || !this.active || error instanceof AgenticControlError
        || error instanceof StalePositionInputError || error instanceof StaleBattleInputError) return;
      const status = this.view.recoveryRequired && !this.view.busy ? this.view.status
        : `Action failed: ${error instanceof Error ? error.message : String(error)}`;
      this.publish({ status,
        recoveryRequired: true, busy: false, controlled: false });
      this.lock.release();
    });
    return pending;
  }
  private async adopt(head: CanonicalHead, signal: AbortSignal, reuseRoster = false) {
    const result = await projectGame(head, reuseRoster ? this.view.game : undefined);
    this.assert(signal);
    if (result.head.revision !== head.revision || result.head.epoch !== head.epoch) throw new Error('Game changed during publication. Retry from its latest checkpoint.');
    const lease = this.agenticControl;
    if (lease && (lease.gameId !== head.gameId || lease.generation !== head.generation || lease.epoch !== head.epoch)) lease.release();
    this.head = head;
    this.publish({ game: result.value, controlled: head.owner === this.owner && head.status === 'ready'
      && (!this.lock.supported || this.lock.held) });
  }
  private async prepare(level: number, signal: AbortSignal) {
    for (;;) {
      this.assert(signal);
      const next = await prepareGameFloor(gameRequest(this.head!, 'game.prepare', { level }), { signal });
      this.assert(signal);
      this.head = next.head ?? (await readCanonicalHead()).head;
      this.assert(signal);
      const phase = (next.receipt.result as JsonObject).phase;
      if (phase === 'ready') return;
      this.publish({ status: `Preparing dungeon ${level}: ${phase}` });
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  private async claim(signal: AbortSignal, recovery = false) {
    this.assert(signal);
    let head = this.head!;
    if (head.owner !== this.owner) {
      const action = head.status === 'stopped' ? 'claim' : 'takeover';
      const result = await controlCanonical(gameRequest(head, `control.${action}`,
        { owner: this.owner, ...(action === 'claim' && recovery ? { recovery: true } : {}) }), action, { signal });
      head = result.head ?? (await readCanonicalHead()).head;
      this.assert(signal); this.head = head;
    }
    this.assert(signal);
    if (head.status === 'stopped') {
      const result = await controlCanonical(gameRequest(head, 'control.resume', { owner: this.owner }), 'resume', { signal });
      head = result.head ?? (await readCanonicalHead()).head;
    }
    this.head = head;
  }
  private async stopSavedAuto(signal: AbortSignal) {
    this.assert(signal);
    const c = gameCheckpoint(this.head!.checkpoint);
    if (c.mode === 'battle') {
      const saved = (await readCanonical(loadBattle, { snapshot: snapshotOf(this.head!) })).value;
      this.assert(signal);
      if (!saved || saved.battle.status !== 'active') throw new Error('Active battle checkpoint has no valid battle.');
      const result = await executeBattleCommand(gameRequest(this.head!, 'battle.command',
        { kind: 'automation', battleId: saved.battle.id, mode: 'manual', enabled: false }), { signal });
      this.assert(signal); this.head = result.head ?? (await readCanonicalHead()).head;
      return;
    }
    if (c.mode !== 'auto-play' && c.mode !== 'waves' && c.townReturnMode !== 'auto-play' && c.townReturnMode !== 'waves') return;
    const result = await executeSettingsCommand(gameRequest(this.head!, 'settings.command', { kind: 'auto', enabled: false }), { signal });
    this.assert(signal);
    this.head = result.head ?? (await readCanonicalHead()).head;
  }
  private async load(signal: AbortSignal, reset = false, steal = false) {
    const acquired = await this.lock.acquire(steal);
    this.assert(signal);
    const exists = reset ? false : await hasCanonicalGame(signal);
    this.assert(signal);
    if (!exists) {
      if (this.lock.supported && !acquired) throw new Error('Another tab controls this game.');
      this.head = (await createCanonicalGame(this.owner, reset, signal)).head;
    } else this.head = (await readCanonicalHead()).head;
    this.assert(signal);
    if (acquired || (!this.lock.supported && (steal || this.head.owner === this.owner))) {
      await this.claim(signal, steal);
      const checkpoint = gameCheckpoint(this.head.checkpoint);
      if (!checkpoint.knowledge) {
        await this.prepare(checkpoint.position.level, signal);
        this.assert(signal);
        const look = await executeExplorationCommand(gameRequest(this.head, 'exploration.command', { kind: 'look' }), { signal });
        this.head = look.head ?? (await readCanonicalHead()).head;
      }
      await this.stopSavedAuto(signal);
    }
    await this.adopt(this.head, signal);
    const saves = await listManualSaves(); this.assert(signal);
    this.publish({ saves, busy: false, recoveryRequired: false, status: this.view.controlled ? 'Ready' : 'Read only: another tab controls this game.' });
  }
  start = () => {
    this.lifetime.abort(); this.lifetime = new AbortController(); this.active = true;
    this.publish({ busy: true, controlled: false, status: 'Loading' });
    return this.enqueue(signal => this.load(signal));
  };
  stop = (status = 'Paused') => {
    this.active = false; this.lifetime.abort(); this.lock.release(); this.publish({ controlled: false, busy: false, status });
  };
  flush = () => this.queue;
  private recover(reset: boolean) {
    const version = this.manualVersion;
    try { this.assertManualControl(version); } catch (error) { return Promise.reject(error); }
    this.lifetime.abort(); this.lifetime = new AbortController(); this.active = true;
    this.publish({ controlled: false, busy: true, status: reset ? 'Starting new game' : 'Taking control' });
    return this.enqueue(signal => { this.assertManualControl(version); return this.load(signal, reset, true); });
  }
  resetGame = () => this.recover(true);
  takeControl = () => this.recover(false);
  refresh = () => {
    if (this.refreshing || !this.active || this.view.busy || this.view.recoveryRequired) return Promise.resolve();
    this.refreshing = true;
    return this.enqueue(async signal => {
      const { head } = await readCanonicalHead(); this.assert(signal);
      if (head.generation !== this.head?.generation || head.revision !== this.head.revision) await this.adopt(head, signal);
    }).finally(() => { this.refreshing = false; });
  };
  execute = async (kind: CommandKind, input: Json, guard?: { expectedPosition: WorldPosition; spatialBinding?: string }): Promise<CanonicalReceipt> => {
    const captured = structuredClone(input), expected = guard && structuredClone(guard.expectedPosition);
    const expectedBinding = guard?.spatialBinding;
    return this.manual(async signal => {
      // Check after every other admitted writer, immediately before creating this command.
      // A stale presentation intent is harmless cancellation, not a storage failure.
      if (expected) {
        if (expectedBinding && expectedBinding !== spatialBinding(snapshotOf(this.head!))) throw new StalePositionInputError();
        const actual = gameCheckpoint(this.head!.checkpoint).position;
        if (actual.level !== expected.level || actual.cell.spaceId !== expected.cell.spaceId
          || actual.cell.row !== expected.cell.row || actual.cell.column !== expected.cell.column) throw new StalePositionInputError();
      }
      if (kind === 'combat' && captured && typeof captured === 'object' && !Array.isArray(captured)
        && (captured.kind === 'start' && this.view.game?.battle
          || typeof captured.battleId === 'string' && captured.battleId !== this.view.game?.battle?.id)) throw new StaleBattleInputError();
      const original = gameRequest(this.head!, kind === 'combat' ? 'battle.command' : `${kind}.command`, captured), started = performance.now();
      const result = await handlers[kind](original, { signal });
      this.assert(signal);
      this.head = result.head ?? (await readCanonicalHead()).head;
      const needsFloor = (result.receipt.result as JsonObject).needsFloor;
      if (typeof needsFloor === 'number') {
        this.publish({ busy: true });
        await this.prepare(needsFloor, signal);
        this.assert(signal);
        const stairs = await executeExplorationCommand(gameRequest(this.head, 'exploration.command', { kind: 'stairs', direction: 'down' }), { signal });
        this.head = stairs.head ?? (await readCanonicalHead()).head;
      }
      await this.adopt(this.head, signal, kind === 'exploration' && (captured as JsonObject).kind !== 'teleport' || kind === 'settings'
        || kind === 'auto' && (result.receipt.result as JsonObject).rosterChanged === false);
      const reason = (result.receipt.result as JsonObject).reason;
      this.publish({ busy: false, status: kind === 'auto' && typeof reason === 'string' ? reason : 'Saved', diagnostics: [...this.view.diagnostics.slice(-63), {
        revision: result.receipt.afterRevision, action: kind, replayed: result.replayed, elapsedMs: performance.now() - started, stats: result.stats }] });
      return result.receipt;
    });
  };
  /** Prepare at the descending landing without changing the actor or earning adjacent navigation knowledge. */
  prepareStairs = (expectedPosition: WorldPosition, binding: string) => {
    const expected = structuredClone(expectedPosition);
    return this.manual(async signal => {
      const checkpoint = gameCheckpoint(this.head!.checkpoint);
      if (binding !== spatialBinding(snapshotOf(this.head!)) || JSON.stringify(checkpoint.position) !== JSON.stringify(expected)) throw new StalePositionInputError();
      if (checkpoint.mode !== 'manual' || !this.view.game?.spatial?.prepareDown) throw new StalePositionInputError();
      this.publish({ busy: true, status: `Preparing dungeon ${expected.level + 1}` });
      await this.prepare(expected.level + 1, signal);
      await this.adopt(this.head!, signal, true);
      this.publish({ busy: false, status: 'Adjacent landing ready. Walk onto the stairs to descend.' });
      return this.view.game;
    });
  };
  /** Local host integration shares manual/Auto/save serialization. Its domain executor owns grants and validation. */
  submitHostCommand = async (command: CanonicalHostCommand): Promise<CanonicalReceipt> => {
    const captured = captureHostCommand(command);
    if (captured.signal && captured.signal !== this.lifetime.signal) throw new Error('Discarded stale host lifetime');
    return this.owned(async signal => {
      if (captured.signal && captured.signal !== signal) throw new Error('Discarded stale host lifetime');
      const original = captured.kind === 'retry' ? captured.request : gameRequest(this.head!, captured.operation, captured.input);
      const started = performance.now(), result = await captured.execute(original, { signal });
      this.assert(signal);
      this.head = result.head ?? (await readCanonicalHead()).head;
      await this.adopt(this.head, signal);
      this.publish({ status: result.replayed ? 'Reconciled' : 'Saved', diagnostics: [...this.view.diagnostics.slice(-63), {
        revision: result.receipt.afterRevision, action: original.operation, replayed: result.replayed,
        elapsedMs: performance.now() - started, stats: result.stats }] });
      return result.receipt;
    });
  };
  /** Same-owner funded cleanup remains available after normal quota failure, but never resumes play. */
  cleanupHostOperation = async (command: HostCleanup, hostSignal?: AbortSignal) => {
    const captured = captureHostCleanup(command);
    if (hostSignal && hostSignal !== this.lifetime.signal) throw new Error('Discarded stale cleanup lifetime');
    return this.enqueue(async signal => {
      if (hostSignal && hostSignal !== signal) throw new Error('Discarded stale cleanup lifetime');
      const result = await executeHostCleanup(captured, this.owner, this.lock, signal);
      this.assert(signal); this.head = result.head;
      if (result.head.status !== 'ready') this.publish({ controlled: false });
      return { request: result.request, receipt: result.receipt };
    });
  };
  private owned<T>(work: (signal: AbortSignal) => Promise<T>) {
    if (!this.view.controlled || this.view.busy || this.view.recoveryRequired) return Promise.reject(new Error('Game control unavailable'));
    const epoch = this.head!.epoch, gameId = this.head!.gameId, generation = this.head!.generation;
    return this.enqueue(signal => {
      if (!this.view.controlled || this.head?.epoch !== epoch || this.head.gameId !== gameId
        || this.head.generation !== generation) throw new Error('Discarded stale game action');
      return work(signal);
    });
  }
  private async save(input: Json) {
    const refusal = await this.manual(async signal => {
      let result: Awaited<ReturnType<typeof executeSaveCommand>>;
      try { result = await executeSaveCommand(gameRequest(this.head!, 'save.command', input), { signal }); }
      catch (error) {
        if (!(error instanceof ManualSaveLimitError) || (input as JsonObject).kind !== 'create') throw error;
        this.assert(signal);
        const saves = await listManualSaves(); this.assert(signal);
        this.publish({ saves, status: error.message });
        return error;
      }
      this.assert(signal); this.head = result.head ?? (await readCanonicalHead()).head;
      if ((input as JsonObject).kind === 'load') await this.stopSavedAuto(signal);
      await this.adopt(this.head, signal);
      const saves = await listManualSaves(); this.assert(signal);
      this.publish({ saves, status: 'Saved' });
    });
    // Report capacity to the caller without poisoning the serialized writer queue.
    if (refusal) throw refusal;
  }
  createManualSave = () => this.save({ kind: 'create', label: new Date().toLocaleString() });
  loadSave = (id: string) => this.save({ kind: 'load', id });
  removeSave = (id: string) => this.save({ kind: 'delete', id });
  refreshSaves = () => this.enqueue(async signal => { const saves = await listManualSaves(); this.assert(signal); this.publish({ saves }); });
}
