import { useEffect, useRef, useState } from 'react';
import type { GameSession } from '../services/game/GameSession';
import { readGameAgenticaProfile } from '../config/agentica';
import { createGamePlayController, idleGamePlay } from '../services/agentica/game/playController';
import type { PlayAdoptionOffer } from '../services/agentica/game/playAdoption';

const configuration = readGameAgenticaProfile(import.meta.env);

/** Panel lifetime is independent from the current game's explicit execution lifetime. */
export function useGameAgenticPlay(session: GameSession) {
  const [state, setState] = useState(idleGamePlay);
  const controller = useRef<ReturnType<typeof createGamePlayController> | undefined>(undefined);
  const signal = session.hostSignal;
  useEffect(() => {
    setState(idleGamePlay);
    return () => { controller.current?.close(); controller.current = undefined; };
  }, [session, signal]);
  const start = (objective: string) => {
    try {
      if (!configuration.profile) throw Error(configuration.error ?? 'Agentic play is not configured.');
      controller.current ??= createGamePlayController(session, setState);
      void controller.current.start({ ...configuration.profile, objectiveId: crypto.randomUUID(), objective });
    } catch (error) { setState(current => ({ ...current, error: String(error).slice(0, 240) })); }
  };
  const stop = () => { void controller.current?.stop(); };
  const adoptDecision = (offer: PlayAdoptionOffer) => {
    try {
      controller.current ??= createGamePlayController(session, setState);
      void controller.current.adoptDecision(offer);
    } catch (error) { setState(current => ({ ...current, error: String(error).slice(0, 240) })); }
  };
  const continueDecision = () => {
    try { void controller.current?.continueDecision(); }
    catch (error) { setState(current => ({ ...current, error: String(error).slice(0, 240) })); }
  };
  const recover = () => {
    controller.current?.close(); controller.current = undefined;
    setState({ phase: 'recovery', active: false, message: 'Live execution withdrawn. Retained work requires reconciliation.' });
  };
  return { ...state, profile: state.active && state.profile ? state.profile : configuration.profile,
    configurationError: state.active && state.profile ? undefined : configuration.error,
    start, continueDecision, adoptDecision, stop, recover };
}
