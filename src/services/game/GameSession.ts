import type { GameState, SaveSummary } from '../../domain/types';
import { ModuleCapacityError } from '../../domain/expedition/topology/modules/types';
import { blockAutopilot } from '../../domain/automation/autopilotState';
import { createPlayTelemetry, recordTransition } from '../../domain/telemetry/transitions';
import type { PlayTelemetry, TransitionContext } from '../../domain/telemetry/types';
import { claimGame, readGameControl, updateOwnedGame, replaceOwnedGame, loadOwnedGame, changeOwnedSave, type OwnedGame } from '../../persistence/gameCustody';
import { getGame, listSaves } from '../../persistence/saveRepository';
import { loadTelemetry, saveTelemetry } from '../../persistence/telemetryRepository';
import { sameOwner, SaveOwnershipError, type SaveControl } from '../../persistence/saveControl';
import { importLegacyLocalStorageSaves } from '../../persistence/legacyLocalStorage';
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
  status: string; controlled: boolean; warning?: string;
}

class ObsoleteGameAction extends Error {}

export class GameSession {
  readonly owner = crypto.randomUUID();
  view: GameSessionView = { saves: [], status: 'Loading', controlled: false };
  private control?: SaveControl;
  private queue: Promise<unknown> = Promise.resolve();
  private generation = 0;
  private active = false;
  private autoPending = false;
  private refreshPending = false;
  private diagnosticsWritable = true;
  private readonly lock = new BrowserSaveLock(() => this.publish({ controlled: false, status: 'Read only: control moved to another tab.' }));
  private readonly changed: (view: GameSessionView) => void;
  constructor(changed: (view: GameSessionView) => void) { this.changed = changed; }

  private publish(patch: Partial<GameSessionView>) { this.view = { ...this.view, ...patch }; this.changed(this.view); }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.catch(() => {}).then(work);
    this.queue = result.catch(async error => {
      if (error instanceof ObsoleteGameAction || error instanceof RpgWorkCancelled) return;
      if (error instanceof SaveOwnershipError) {
        this.lock.release();
        this.publish({ controlled: false, status: error.message });
      } else this.publish({ controlled: false, status: `Save failed: ${error instanceof Error ? error.message : 'storage unavailable'}` });
    });
    return result;
  }

  async start() {
    this.active = true;
    const generation = ++this.generation;
    return this.enqueue(async () => {
      let warning: string | undefined;
      let imported = 0;
      try {
        const result = await importLegacyLocalStorageSaves();
        warning = result.warnings.join(' ');
        imported = result.imported;
      } catch (error) { warning = `Original save import needs attention: ${String(error)}`; }
      if (generation !== this.generation) return;
      const acquired = await this.lock.acquire();
      if (generation !== this.generation) { this.lock.release(); return; }
      await this.adopt(await claimGame(this.owner, acquired));
      await this.refreshSaves();
      const ready = imported ? `Imported ${imported} original saves` : 'Ready';
      this.publish({ warning, status: this.view.controlled ? this.diagnosticsWritable ? ready : 'Diagnostics storage unavailable; existing history protected' : 'Read only: another tab controls this game.' });
    }).catch(error => { this.publish({ status: `Load failed: ${String(error)}` }); throw error; });
  }

  stop() { this.active = false; this.generation++; this.lock.release(); this.publish({ controlled: false }); }
  flush = () => this.queue;
  ownedControl = (): SaveControl => {
    if (!this.view.controlled || !this.control) throw new SaveOwnershipError();
    return { ...this.control };
  };

  private async adopt(state: OwnedGame) {
    this.control = state.control;
    let telemetry: PlayTelemetry | undefined;
    this.diagnosticsWritable = true;
    try { telemetry = await loadTelemetry(state.game.id); }
    catch { this.diagnosticsWritable = false; }
    this.publish({ game: state.game, observationHead: state.observationHead, telemetry: telemetry ?? createPlayTelemetry(state.game.id),
      controlled: this.active && state.control.owner === this.owner && (!this.lock.supported || this.lock.held) });
  }

  refresh = () => {
    if (this.refreshPending) return Promise.resolve();
    this.refreshPending = true;
    return this.enqueue(async () => {
      if (!this.active) return;
      const latest = await readGameControl();
      if (latest.control && latest.game && (!sameOwner(latest.control, this.control) || latest.control.revision !== this.control?.revision)) {
        await this.adopt({ control: latest.control, game: latest.game, observationHead: latest.observationHead });
        if (!this.view.controlled) this.publish({ status: 'Read only: another tab controls this game.' });
      }
    }).finally(() => { this.refreshPending = false; });
  };

  takeControl = () => this.enqueue(async () => {
    if (!this.active) throw new SaveOwnershipError();
    if (!await this.lock.acquire(true) && this.lock.supported) throw new SaveOwnershipError();
    await this.adopt(await claimGame(this.owner, true));
    this.publish({ status: 'Control acquired from the latest saved checkpoint.' });
  });

  private owned<T>(work: (control: SaveControl) => Promise<T>): Promise<T> {
    const dispatched = this.control;
    if (!this.view.controlled) return Promise.reject(new SaveOwnershipError());
    return this.enqueue(async () => {
      // A discarded old intent must not revoke a newer successful takeover.
      if (!this.view.controlled || !sameOwner(dispatched, this.control)) throw new ObsoleteGameAction('The action belongs to an inactive control grant.');
      return work(this.control!);
    });
  }

  transition = (update: (game: GameState) => GameState, context: TransitionContext) => {
    const automatic = context.source === 'auto';
    if (automatic && this.autoPending) return;
    if (automatic) this.autoPending = true;
    void this.owned(async control => {
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
      this.control = next.control;
      this.publish({ game: next.game, observationHead: next.observationHead, telemetry: trace, status: 'Saved' });
      await this.persistTrace(trace, next.control);
    }).catch(() => {}).finally(() => { if (automatic) this.autoPending = false; });
  };

  replaceGame = (game: GameState) => this.owned(async control => {
    const next = await replaceOwnedGame(control, game);
    await this.adopt(next);
    this.publish({ status: 'Saved' });
  });

  commandRequest = (command: GameCommand, attemptId = crypto.randomUUID(), deadlineAt = Date.now() + 120_000): GameCommandRequest => {
    if (!this.view.controlled || !this.control || !this.view.game) throw new SaveOwnershipError();
    return structuredClone({ attemptId, command, deadlineAt, control: this.control,
      gameId: this.view.game.id, floor: this.view.game.dungeonLevel, position: this.view.game.maze.active });
  };

  /** Awaitable internal command boundary. Never replace an original's fence with fresh authority. */
  executeCommand = (request: GameCommandRequest, context: TransitionContext = { source: 'system', action: `command:${request.command.type}` }) => {
    const original = structuredClone(request);
    return this.owned(async () => {
      const before = this.view.game, trace = this.view.telemetry, revision = this.control!.revision;
      const result = await executeOwnedGameCommand(original);
      if (result.current) await this.adopt(result.current);
      this.publish({ status: result.receipt.outcome.status === 'not-applied' ? 'Command not applied' : 'Saved' });
      if (!result.replayed && result.current && before && revision === result.receipt.beforeRevision
        && result.receipt.outcome.status !== 'not-applied') {
        const nextTrace = recordTransition(trace ?? createPlayTelemetry(before.id), before, result.current.game, context);
        this.publish({ telemetry: nextTrace });
        await this.persistTrace(nextTrace, result.current.control);
      }
      return result.receipt;
    });
  };

  // Recovery is read/settlement only; it is valid after the old owner has lost control.
  reconcileCommand = async (request: GameCommandRequest) => (await settleGameCommand(structuredClone(request))).receipt;

  prepareTravelMemory = () => this.enqueue(() => prepareRpgMemory('auto', { maxSources: 4 }));
  readTravel = readRpgTravel;
  travelRequest = (operationId: string, action: RpgTravelAction, attemptId = crypto.randomUUID(), deadlineAt = Date.now() + 120_000): RpgTravelRequest => {
    if (!this.view.controlled || !this.control || !this.view.game) throw new SaveOwnershipError();
    return structuredClone({ operationId, action, attemptId, deadlineAt, gameId: this.view.game.id, control: this.control });
  };
  executeTravel = (request: RpgTravelRequest) => {
    const original = structuredClone(request);
    return this.owned(async () => {
      const before = this.view.game, trace = this.view.telemetry;
      const result = await executeRpgTravel(original);
      const latest = result.current;
      if (latest) await this.adopt(latest);
      this.publish({ status: result.receipt.reason });
      if (!result.replayed && result.receipt.command && before && latest
        && result.receipt.command.afterRevision === latest.control.revision) {
        const nextTrace = recordTransition(trace ?? createPlayTelemetry(before.id), before, latest.game,
          { source: 'system', action: 'agentic-travel-step' });
        this.publish({ telemetry: nextTrace });
        await this.persistTrace(nextTrace, latest.control);
      }
      return result.receipt;
    });
  };
  reconcileTravel = async (request: RpgTravelRequest) => (await executeRpgTravel(structuredClone(request), true)).receipt;

  /** SDK callbacks use the same serialized owner and published game as manual play. */
  executeAgenticaAction = (action: AgenticaAction, settleOnly = false, signal?: AbortSignal) => {
    const original = structuredClone(action);
    const work = async () => {
      const outcome = await executeRpgAction(original, settleOnly, signal);
      if (outcome.current) await this.adopt(outcome.current);
      this.publish({ status: outcome.result.summary });
      return outcome.result;
    };
    return settleOnly ? this.enqueue(work) : this.owned(work);
  };
  advanceAgenticaOperation = (request: RpgTravelRequest, signal?: AbortSignal) => {
    const original = structuredClone(request);
    return this.owned(async () => {
      const before = this.view.game, trace = this.view.telemetry;
      const outcome = await advanceRpgHostOperation(original, signal);
      if (outcome.current) await this.adopt(outcome.current);
      if (outcome.event) this.publish({ status: outcome.event.summary });
      if (outcome.receipt?.command && !outcome.replayed && before && outcome.current
        && outcome.receipt.command.afterRevision === outcome.current.control.revision) {
        const next = recordTransition(trace ?? createPlayTelemetry(before.id), before, outcome.current.game,
          { source: 'system', action: 'agentica-travel-step' });
        this.publish({ telemetry: next }); await this.persistTrace(next, outcome.current.control);
      }
      return outcome;
    });
  };

  private async persistTrace(trace: PlayTelemetry | undefined, control: SaveControl) {
    if (!this.diagnosticsWritable || !trace) { this.publish({ status: 'Saved; diagnostics storage unavailable' }); return; }
    try { await saveTelemetry(trace, control); }
    catch (error) {
      if (error instanceof SaveOwnershipError) throw error;
      this.publish({ status: 'Saved; diagnostics storage unavailable' });
    }
  }

  createManualSave = () => this.owned(async control => {
    this.control = await changeOwnedSave(control, { type: 'create', label: new Date().toLocaleString() });
    await this.refreshSaves();
    this.publish({ status: 'Manual save created' });
  });

  loadSave = (id: string) => this.owned(async control => {
    const slot = await getGame(id);
    if (!slot) throw new Error('This save no longer exists.');
    await this.adopt(await loadOwnedGame(control, id));
    this.publish({ status: `Loaded ${slot.label}` });
  });

  removeSave = (id: string) => this.owned(async control => {
    this.control = await changeOwnedSave(control, { type: 'delete', slotId: id });
    await this.refreshSaves();
    this.publish({ status: 'Save deleted' });
  });

  refreshSaves = async () => { this.publish({ saves: await listSaves() }); };
}
