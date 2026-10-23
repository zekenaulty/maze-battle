import { GameSession } from '../../src/services/game/GameSession';
import { initializeCorpus } from './canonical-corpus.initialize';
import type { CorpusVariant } from './canonical-corpus.layout';
import { readCanonicalHead } from '../../src/persistence/canonical/read';
import { dump } from './canonical-decision-ack.storage';
import { actor, travel, successor } from './canonical-corpus.navigation.journey';
import { invoke, launch, measuredHost, type Frame, type WindowSource } from './canonical-corpus.navigation.host';
import { cleanup, replay, corruptHistory } from './canonical-corpus.navigation.evidence';

if (!import.meta.env.DEV || location.href !== 'http://127.0.0.1:5456/tests/e2e/canonical-corpus.navigation.html')
  throw Error('Isolated navigation disclosure fixture only');
let session: GameSession, windowSource: WindowSource, measure: ReturnType<typeof measuredHost>;
const histories: { frame: Frame; terminalAttemptId: string }[] = [];
let checkpoint = -1;
async function boot(variant: CorpusVariant) {
  session = new GameSession(() => {});
  const genesis = await initializeCorpus(variant, session.owner);
  await session.start();
  if (!session.view.controlled || !session.view.game?.observation) throw Error(session.view.status);
  const firstSight = structuredClone(session.view.game.observation);
  const town = await session.execute('exploration', { kind: 'stairs', direction: 'up' });
  const offers = structuredClone(session.view.game!.contracts);
  const survey = offers.find(offer => offer.task.item?.baseId === 'survey-seal');
  if (!survey) throw Error('Expected public survey offer');
  const accepted = await session.execute('content', { kind: 'accept-quest', contractId: survey.id });
  const leave = await session.execute('roster', { kind: 'leave-town' });
  measure = measuredHost(session);
  const admission = await measure(() => launch(session)); windowSource = admission.value;
  return { genesis, firstSight, offers, setup: [town, accepted, leave], admission,
    head: (await readCanonicalHead()).head, allocations: window.corpusControl!.allocations() };
}
async function stage(step: 0 | 6 | 7) {
  if (!(checkpoint === -1 ? step === 0 || step === 6 : checkpoint === 0 ? step === 6 : checkpoint === 6 && step === 7))
    throw Error('Fixed trajectory order changed');
  checkpoint = step;
  const before = (await readCanonicalHead()).head, input = structuredClone(windowSource);
  const trip = await measure(() => travel(session, windowSource, step === 0 ? 0 : step === 6 ? 6 : 1));
  const continuation = await measure(() => successor(session, trip.value)); windowSource = continuation.value;
  window.navigationPredecessor = { trip, continuation };
  const queryBefore = (await readCanonicalHead()).head;
  const queries = await measure(async () => {
    const history = await invoke(session, windowSource, 'maze.inspect', { scope: 'decision' });
    const syntax = await invoke(session, windowSource, 'maze.navigate', { ...actor(windowSource), extra: true });
    const unknown = await invoke(session, windowSource, 'maze.navigate', { ...actor(windowSource), spaceId: 'undiscovered-probe' });
    return { history, syntax, unknown };
  });
  histories.push({ frame: queries.value.history, terminalAttemptId: trip.value.source.terminalAttemptId });
  return { step, before, input, trip, continuation, queryBefore, queries, after: (await readCanonicalHead()).head,
    sight: structuredClone(session.view.game!.observation), allocations: window.corpusControl!.allocations() };
}
async function historicalReplay() {
  const before = await dump(), results = [];
  for (const history of histories) results.push(await measure(() => replay(session, history.frame)));
  return { results, unchanged: before === await dump() };
}
async function faults() {
  const selected = histories.at(-2)!;
  return { missing: await corruptHistory(session, selected.frame, selected.terminalAttemptId, 'missing'),
    inconsistent: await corruptHistory(session, selected.frame, selected.terminalAttemptId, 'inconsistent') };
}
const api = { boot, stage, historicalReplay, faults, cleanup: () => cleanup(session), stop: () => session?.stop() };
declare global { interface Window { corpusNavigation: typeof api; navigationPredecessor?: unknown } }
window.corpusNavigation = api;
