import { useCallback, useEffect, useRef, useState } from 'react';
import { ExpeditionActionSession } from '../domain/expedition/actionSession';
import { createExpeditionPlan, materializeSpace } from '../domain/expedition/generation';
import { applyExpeditionCommand, createExpeditionCheckpoint } from '../domain/expedition/commands';
import { chooseExplorationDecision } from '../domain/expedition/exploration';
import { observeExpedition } from '../domain/expedition/observation';
import { SpaceResidency } from '../domain/expedition/residency';
import type { ExpeditionCheckpoint, ExpeditionCommand, ExpeditionPlan } from '../domain/expedition/types';
import { loadExpedition, saveExpedition } from '../persistence/expeditionRepository';
import type { Direction } from '../domain/types';

const SLOT = 'structural-demo';
export const RESIDENT_CELL_BUDGET = 512;
interface Runtime { plan: ExpeditionPlan; checkpoint: ExpeditionCheckpoint; cache: SpaceResidency; session: ExpeditionActionSession; faulted?: boolean }

async function restore() {
  const saved = await loadExpedition(SLOT);
  if (saved) return saved;
  const plan = createExpeditionPlan({ version: 'spaces-v1', worldId: 'structural-demo', floorId: 'floor-1', level: 1, seed: 20261008 });
  const checkpoint = createExpeditionCheckpoint(plan, materializeSpace);
  try { await saveExpedition(SLOT, plan, checkpoint, null); }
  catch (error) {
    // Another mount/tab may win create-only initialization. Never replace that record.
    const concurrent = await loadExpedition(SLOT);
    if (!concurrent) throw error;
    return concurrent;
  }
  return { plan, checkpoint };
}

export function useExpedition() {
  const runtime = useRef<Runtime | undefined>(undefined);
  const mounted = useRef(false);
  const auto = useRef(false);
  const [view, setView] = useState<{ plan: ExpeditionPlan; checkpoint: ExpeditionCheckpoint }>();
  const [playing, setPlaying] = useState(false);
  const [delay, setDelay] = useState(160);
  const [message, setMessage] = useState('Loading expedition');
  const [error, setError] = useState<string>();
  const [facing, setFacing] = useState<Direction>('south');

  useEffect(() => {
    let cancelled = false;
    mounted.current = true;
    void restore().then(saved => {
      if (cancelled) return;
      const cache = new SpaceResidency(RESIDENT_CELL_BUDGET, materializeSpace);
      const state = { ...saved, cache } as Runtime;
      const activeSpec = state.plan.spaces.find(spec => spec.id === state.checkpoint.position.spaceId);
      if (!activeSpec || !cache.get(activeSpec).cells.some(cell => cell.row === state.checkpoint.position.row && cell.column === state.checkpoint.position.column)) {
        throw new Error('Checkpoint position is not on walkable floor.');
      }
      state.session = new ExpeditionActionSession(crypto.randomUUID(), {
        checkpoint: () => state.checkpoint,
        observe: () => {
          const spec = state.plan.spaces.find(spec => spec.id === state.checkpoint.position.spaceId)!;
          return observeExpedition(state.checkpoint, spec, cache.get(spec));
        },
        execute: async command => {
          const transition = applyExpeditionCommand(state.plan, state.checkpoint, command, spec => cache.get(spec));
          if (transition.applied) {
            await saveExpedition(SLOT, state.plan, transition.checkpoint, state.checkpoint.revision);
            state.checkpoint = transition.checkpoint;
            if (mounted.current && runtime.current === state) setView({ plan: state.plan, checkpoint: state.checkpoint });
          }
          return transition;
        },
      });
      runtime.current = state;
      setView(saved);
      setMessage(saved.checkpoint.phase === 'complete' ? 'Expedition complete.' : 'Checkpoint loaded.');
    }).catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load expedition.'); });
    return () => { cancelled = true; mounted.current = false; auto.current = false; runtime.current?.session.takeOver(); };
  }, []);

  const stop = useCallback(() => {
    auto.current = false;
    setPlaying(false);
    runtime.current?.session.takeOver();
  }, []);
  const dispatch = useCallback(async (command: ExpeditionCommand, manual = false) => {
    if (manual) stop();
    const state = runtime.current;
    if (!state || state.faulted) return;
    const result = await state.session.request({ version: 1, sessionId: state.session.sessionId,
      epoch: state.session.currentEpoch, actionId: crypto.randomUUID(), expectedRevision: state.checkpoint.revision, command });
    if (!mounted.current) return;
    setMessage(result.reason);
    if (result.disposition === 'applied' && command.type === 'move') setFacing(command.direction);
    if (result.disposition !== 'applied' || state.checkpoint.phase === 'complete') stop();
    if (['unresolved', 'conflict'].includes(result.disposition)) {
      state.faulted = true;
      setError(`${result.reason} Reload to reconcile the saved checkpoint.`);
    }
  }, [stop]);

  useEffect(() => {
    if (!playing || !view || view.checkpoint.phase === 'complete' || error) return;
    const timeout = window.setTimeout(() => {
      const state = runtime.current;
      if (!state || !auto.current) return;
      const decision = chooseExplorationDecision(state.checkpoint);
      setMessage(decision.reason);
      if (decision.command) void dispatch(decision.command);
      else stop();
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [playing, view, delay, error, dispatch, stop]);

  const toggle = () => {
    if (auto.current) { stop(); return; }
    if (error || view?.checkpoint.phase === 'complete') return;
    auto.current = true;
    setPlaying(true);
  };
  return { view, runtime: runtime.current, playing, delay, setDelay, toggle, stop, dispatch, message, error, facing };
}
