import type { GameState, SaveSummary } from '../../domain/types';
import { ModuleCapacityError } from '../../domain/expedition/topology/modules/types';
import { blockAutopilot } from '../../domain/automation/autopilotState';
import { createPlayTelemetry, recordTransition } from '../../domain/telemetry/transitions';
import type { PlayTelemetry, TransitionContext } from '../../domain/telemetry/types';
import { claimGame, readGameControl, updateOwnedGame, replaceOwnedGame, loadOwnedGame, changeOwnedSave, type OwnedGame } from '../../persistence/gameCustody';
import { getGame, listSaves } from '../../persistence/saveRepository';
import { loadTelemetry, saveTelemetry } from '../../persistence/telemetryRepository';
import { sameOwner, SaveOwnershipError, type SaveControl } from '../../persistence/saveControl';
import { resetGame } from '../../persistence/gameReset';
import { BrowserSaveLock } from './BrowserSaveLock';
import type { GameCommand } from '../../domain/gameCommands';
import type { GameCommandRequest } from '../../persistence/gameCommandTypes';
import { executeOwnedGameCommand, settleGameCommand } from '../../persistence/gameCommands';
import { executeRpgTravel } from '../../persistence/rpgTravel/execute';
import { readRpgTravel } from '../../persistence/rpgTravel/read';
import { prepareRpgMemory } from '../../persistence/rpgMemory/prepare';
import type { RpgTravelAction, RpgTravelRequest } from '../../persistence/rpgTravel/types';
import type { AgenticaAction } from '../agentica/contracts';
import { executeRpgAction } from '../../persistence/rpgAgentica/actions';
import { advanceRpgHostOperation } from '../../persistence/rpgAgentica/advance';
import { RpgWorkCancelled } from '../../persistence/rpgAgentica/transaction';

export interface GameSessionView {
  game?: GameState; observationHead?: string; telemetry?: PlayTelemetry; saves: SaveSummary[];
  status: string; controlled: boolean; warning?: string; recoveryRequired?: boolean; busy?: boolean;
}

class ObsoleteGameAction extends Error {
  constructor() { super('The action belongs to an inactive game session.'); }
}

export class GameSession {
  private ownerId: string = crypto.randomUUID();
  get owner() { return this.ownerId; }
  view: GameSessionView = { saves: [], status: 'Loading', controlled: false };
  private control?: SaveControl;
  private queue: Promise<unknown> = Promise.resolve();
  private generation = 0;
  private active = false;
  private autoPending = false;
  private refreshPending = false;
  private diagnosticsWritable = true;
  private readonly lock = new BrowserSaveLock(() => {
    this.generation++;
    this.publish({ controlled: false, busy: false,
      recoveryRequired: this.view.recoveryRequired || this.view.busy,
      status: this.view.busy ? 'Recovery failed: game control is unavailable. Retry or explicitly reset.'
        : this.view.recoveryRequired ? this.view.status : 'Read only: control moved to another tab.' });
  });
  private readonly changed: (view: GameSessionView) => void;
  constructor(changed: (view: GameSessionView) => void) { this.changed = changed; }

  private publish(patch: Partial<GameSessionView>) { this.view = { ...this.view, ...patch }; this.changed(this.view); }

  private assertCurrent(generation: number) {
    if (!this.active || generation !== this.generation) throw new ObsoleteGameAction();
  }

  private enqueue<T>(work: (generation: number) => Promise<T>, failure = 'Save failed'): Promise<T> {
    const generation = this.generation;
    const result = this.queue.catch(() => {}).then(async () => {
      this.assertCurrent(generation);
      const value = await work(generation);
      this.assertCurrent(generation);
      return value;
    });
    this.queue = result.catch(async error => {
      if (!this.active || generation !== this.generation || error instanceof ObsoleteGameAction || error instanceof RpgWorkCancelled) return;
      this.lock.release();
      if (error instanceof SaveOwnershipError && failure === 'Save failed') {
        this.publish({ controlled: false, busy: false, status: error.message });
      } else this.publish({ controlled: false, busy: false, recoveryRequired: true,
        status: `${failure}: ${error instanceof Error ? error.message : String(error)}` });
    });
    return result;
  }

  start = () => {
    if (this.active && this.view.busy) return this.flush();
    this.active = true;
    this.beginRecovery('Loading');
    return this.enqueue(async generation => {
      const acquired = await this.lock.acquire();
      this.assertCurrent(generation);
      const next = await claimGame(this.owner, acquired);
      this.assertCurrent(generation);
      if (this.view.recoveryRequired && next.control.owner !== this.owner) {
        throw new Error('Could not validate the saved game while another tab controls it. Retry or explicitly reset.');
      }
      await this.adopt(next, generation);
      await this.readSaves(generation);
      this.publish({ busy: false, recoveryRequired: false, status: this.view.controlled ? this.diagnosticsWritable ? 'Ready' : 'Diagnostics storage unavailable; existing history protected' : 'Read only: another tab controls this game.' });
    }, 'Load failed');
  };

  private beginRecovery(status: string) {
    this.generation++;
    this.publish({ controlled: false, busy: true, status });
  }

  stop() { this.active = false; this.generation++; this.lock.release(); this.publish({ controlled: false, busy: false }); }
  flush = () => this.queue;
  ownedControl = (): SaveControl => {
    if (!this.view.controlled || this.view.busy || this.view.recoveryRequired || !this.control) throw new SaveOwnershipError();
    return { ...this.control };
  };

  private async adopt(state: OwnedGame, generation: number) {
    this.assertCurrent(generation);
    let telemetry: PlayTelemetry | undefined;
    let diagnosticsWritable = true;
    try { telemetry = await loadTelemetry(state.game.id); }
    catch { diagnosticsWritable = false; }
    this.assertCurrent(generation);
    this.control = state.control;
    this.diagnosticsWritable = diagnosticsWritable;
    this.publish({ game: state.game, observationHead: state.observationHead, telemetry: telemetry ?? createPlayTelemetry(state.game.id),
      controlled: this.active && state.control.owner === this.owner && (!this.lock.supported || this.lock.held) });
  }

  refresh = () => {
    if (this.refreshPending || this.view.recoveryRequired || this.view.busy || !this.active) return Promise.resolve();
    this.refreshPending = true;
    return this.enqueue(async generation => {
      if (this.view.recoveryRequired || this.view.busy) return;
      const latest = await readGameControl();
      this.assertCurrent(generation);
      if (latest.control && latest.game && (!sameOwner(latest.control, this.control) || latest.control.revision !== this.control?.revision)) {
        await this.adopt({ control: latest.control, game: latest.game, observationHead: latest.observationHead }, generation);
        if (!this.view.controlled) this.publish({ status: 'Read only: another tab controls this game.' });
      }
    }).finally(() => { this.refreshPending = false; });
  };

  takeControl = () => this.recover(false);
  resetGame = () => this.recover(true);

  private recover(reset: boolean) {
    if (!this.active) return Promise.reject(new SaveOwnershipError());
    if (this.view.busy) return Promise.reject(new Error('Game recovery is already in progress.'));
    this.beginRecovery(reset ? 'Resetting Maze Battle...' : 'Taking control...');
    return this.enqueue(async generation => {
      if (!await this.lock.acquire(true) && this.lock.supported) throw new Error('Could not acquire game storage lock. Try again.');
      this.assertCurrent(generation);
      const next = reset ? await resetGame() : await claimGame(this.owner, true);
      this.assertCurrent(generation);
      if (reset) this.ownerId = next.control.owner;
      await this.adopt(next, generation);
      await this.readSaves(generation);
      this.publish({ busy: false, recoveryRequired: false, warning: undefined,
        status: reset ? 'New game started. Previous saves and history discarded.' : 'Control acquired from the latest saved checkpoint.' });
    }, reset ? 'Reset failed' : 'Load failed');
  }

  private owned<T>(work: (control: SaveControl, generation: number) => Promise<T>): Promise<T> {
    const dispatched = this.control;
    if (!this.view.controlled || this.view.busy || this.view.recoveryRequired) return Promise.reject(new SaveOwnershipError());
    return this.enqueue(async generation => {
      // A discarded old intent must not revoke a newer successful takeover.
      if (!this.view.controlled || !sameOwner(dispatched, this.control)) throw new ObsoleteGameAction();
      return work(this.control!, generation);
    });
  }

  transition = (update: (game: GameState) => GameState, context: TransitionContext) => {
    const automatic = context.source === 'auto';
    if (automatic && this.autoPending) return;
    if (automatic) this.autoPending = true;
    void this.owned(async (control, generation) => {
      let trace = this.view.telemetry;
      const next = await updateOwnedGame(control, before => {
        const started = performance.now();
        let after: GameState;
        try { after = update(before); }
        catch (error) {
          if (!(error instanceof ModuleCapacityError)) throw error;
          // Generation failed before publication. Keep the entire previous floor and control grant.
          after = blockAutopilot(before, `Dungeon expansion unavailable: ${error.message}`);
        }
        trace = recordTransition(trace ?? createPlayTelemetry(before.id), before, after, { ...context, elapsedMs: performance.now() - started });
        return after;
      });
      this.assertCurrent(generation);
      this.control = next.control;
      this.publish({ game: next.game, observationHead: next.observationHead, telemetry: trace, status: 'Saved' });
      await this.persistTrace(trace, next.control, generation);
    }).catch(() => {}).finally(() => { if (automatic) this.autoPending = false; });
  };

  replaceGame = (game: GameState) => this.owned(async (control, generation) => {
    const next = await replaceOwnedGame(control, game);
    await this.adopt(next, generation);
    this.publish({ status: 'Saved' });
  });

  commandRequest = (command: GameCommand, attemptId = crypto.randomUUID(), deadlineAt = Date.now() + 120_000): GameCommandRequest => {
    if (!this.view.controlled || this.view.busy || this.view.recoveryRequired || !this.control || !this.view.game) throw new SaveOwnershipError();
    return structuredClone({ attemptId, command, deadlineAt, control: this.control,
      gameId: this.view.game.id, floor: this.view.game.dungeonLevel, position: this.view.game.maze.active });
  };

  /** Awaitable internal command boundary. Never replace an original's fence with fresh authority. */
  executeCommand = (request: GameCommandRequest, context: TransitionContext = { source: 'system', action: `command:${request.command.type}` }) => {
    const original = structuredClone(request);
    return this.owned(async (_, generation) => {
      const before = this.view.game, trace = this.view.telemetry, revision = this.control!.revision;
      const result = await executeOwnedGameCommand(original);
      this.assertCurrent(generation);
      if (result.current) await this.adopt(result.current, generation);
      this.publish({ status: result.receipt.outcome.status === 'not-applied' ? 'Command not applied' : 'Saved' });
      if (!result.replayed && result.current && before && revision === result.receipt.beforeRevision
        && result.receipt.outcome.status !== 'not-applied') {
        const nextTrace = recordTransition(trace ?? createPlayTelemetry(before.id), before, result.current.game, context);
        this.publish({ telemetry: nextTrace });
        await this.persistTrace(nextTrace, result.current.control, generation);
      }
      return result.receipt;
    });
  };

  // Recovery is read/settlement only; it is valid after the old owner has lost control.
  reconcileCommand = async (request: GameCommandRequest) => (await settleGameCommand(structuredClone(request))).receipt;

  prepareTravelMemory = () => this.enqueue(() => prepareRpgMemory('auto', { maxSources: 4 }));
  readTravel = readRpgTravel;
  travelRequest = (operationId: string, action: RpgTravelAction, attemptId = crypto.randomUUID(), deadlineAt = Date.now() + 120_000): RpgTravelRequest => {
    if (!this.view.controlled || this.view.busy || this.view.recoveryRequired || !this.control || !this.view.game) throw new SaveOwnershipError();
    return structuredClone({ operationId, action, attemptId, deadlineAt, gameId: this.view.game.id, control: this.control });
  };
  executeTravel = (request: RpgTravelRequest) => {
    const original = structuredClone(request);
    return this.owned(async (_, generation) => {
      const before = this.view.game, trace = this.view.telemetry;
      const result = await executeRpgTravel(original);
      const latest = result.current;
      this.assertCurrent(generation);
      if (latest) await this.adopt(latest, generation);
      this.publish({ status: result.receipt.reason });
      if (!result.replayed && result.receipt.command && before && latest
        && result.receipt.command.afterRevision === latest.control.revision) {
        const nextTrace = recordTransition(trace ?? createPlayTelemetry(before.id), before, latest.game,
          { source: 'system', action: 'agentic-travel-step' });
        this.publish({ telemetry: nextTrace });
        await this.persistTrace(nextTrace, latest.control, generation);
      }
      return result.receipt;
    });
  };
  reconcileTravel = async (request: RpgTravelRequest) => (await executeRpgTravel(structuredClone(request), true)).receipt;

  /** SDK callbacks use the same serialized owner and published game as manual play. */
  executeAgenticaAction = (action: AgenticaAction, settleOnly = false, signal?: AbortSignal) => {
    const original = structuredClone(action);
    const work = async (generation: number) => {
      const outcome = await executeRpgAction(original, settleOnly, signal);
      this.assertCurrent(generation);
      if (outcome.current) await this.adopt(outcome.current, generation);
      this.publish({ status: outcome.result.summary });
      return outcome.result;
    };
    return settleOnly ? this.enqueue(work) : this.owned((_, generation) => work(generation));
  };
  advanceAgenticaOperation = (request: RpgTravelRequest, signal?: AbortSignal) => {
    const original = structuredClone(request);
    return this.owned(async (_, generation) => {
      const before = this.view.game, trace = this.view.telemetry;
      const outcome = await advanceRpgHostOperation(original, signal);
      this.assertCurrent(generation);
      if (outcome.current) await this.adopt(outcome.current, generation);
      if (outcome.event) this.publish({ status: outcome.event.summary });
      if (outcome.receipt?.command && !outcome.replayed && before && outcome.current
        && outcome.receipt.command.afterRevision === outcome.current.control.revision) {
        const next = recordTransition(trace ?? createPlayTelemetry(before.id), before, outcome.current.game,
          { source: 'system', action: 'agentica-travel-step' });
        this.publish({ telemetry: next }); await this.persistTrace(next, outcome.current.control, generation);
      }
      return outcome;
    });
  };

  private async persistTrace(trace: PlayTelemetry | undefined, control: SaveControl, generation: number) {
    if (!this.diagnosticsWritable || !trace) { this.publish({ status: 'Saved; diagnostics storage unavailable' }); return; }
    try { await saveTelemetry(trace, control); }
    catch (error) {
      this.assertCurrent(generation);
      if (error instanceof SaveOwnershipError) throw error;
      this.publish({ status: 'Saved; diagnostics storage unavailable' });
    }
  }

  createManualSave = () => this.owned(async (control, generation) => {
    const next = await changeOwnedSave(control, { type: 'create', label: new Date().toLocaleString() });
    this.assertCurrent(generation);
    this.control = next;
    await this.readSaves(generation);
    this.publish({ status: 'Manual save created' });
  });

  loadSave = (id: string) => this.owned(async (control, generation) => {
    const slot = await getGame(id);
    this.assertCurrent(generation);
    if (!slot) throw new Error('This save no longer exists.');
    await this.adopt(await loadOwnedGame(control, id), generation);
    this.publish({ status: `Loaded ${slot.label}` });
  });

  removeSave = (id: string) => this.owned(async (control, generation) => {
    const next = await changeOwnedSave(control, { type: 'delete', slotId: id });
    this.assertCurrent(generation);
    this.control = next;
    await this.readSaves(generation);
    this.publish({ status: 'Save deleted' });
  });

  private async readSaves(generation: number) {
    const saves = await listSaves();
    this.assertCurrent(generation);
    this.publish({ saves });
  }
  refreshSaves = () => this.enqueue(generation => this.readSaves(generation));
}
