import { readGameAgenticaProfile } from '../../src/config/agentica';
import { GameSession } from '../../src/services/game/GameSession';
import { CANONICAL_DATABASE } from '../../src/persistence/canonical/database';
import { readCanonicalHead, snapshotOf } from '../../src/persistence/canonical/read';
import { readLaunch } from '../../src/persistence/canonical/agentica/launch';
import { initializeCorpus } from '../e2e/canonical-corpus.initialize';
import type { CorpusVariant } from '../e2e/canonical-corpus.layout';
import { acceptAppSurvey } from '../e2e/canonical-start-service.corpus-fixture';
import { chestEffects } from '../e2e/canonical-start-service.chest-fixture';

if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5488') throw Error('Isolated live corpus setup only');
const configured = readGameAgenticaProfile(import.meta.env);
if (!configured.profile) throw Error(configured.error ?? 'Missing public Agentica profile');
export const publicAgenticProfile = Object.freeze({ ...configured.profile,
  provider: Object.freeze({ ...configured.profile.provider }), limits: Object.freeze({ ...configured.profile.limits }) });
let initializing = false;
function appSession() {
  const session: unknown = Reflect.get(globalThis, '__canonicalStartAppSession');
  if (!(session instanceof GameSession) || !session.view.game) throw Error('Mounted actual App session required');
  return session;
}
const api = Object.freeze({
  publicAgenticProfile,
  async initialize(variant: CorpusVariant) {
    if (variant !== 'A' && variant !== 'B') throw Error('Expected authored corpus A or B');
    if (initializing) throw Error('Use a fresh disposable browser context');
    initializing = true;
    if ((await indexedDB.databases()).some(db => db.name === CANONICAL_DATABASE)) throw Error('Existing game is never reset by this fixture');
    const initialized = await initializeCorpus(variant, 'live-corpus-genesis');
    const genesis = snapshotOf((await readCanonicalHead()).head);
    if (genesis.checkpoint.knowledge !== null) throw Error('Genesis must not discover cells');
    await import('../../src/main');
    return { version: initialized.version, genesis };
  },
  async accept() {
    const session = appSession();
    if (!session.view.controlled || session.view.busy || session.view.recoveryRequired) throw Error('App is not ready for owner acceptance');
    const audit = await acceptAppSurvey();
    if (appSession() !== session) throw Error('App session changed during acceptance');
    return audit;
  },
  // Privileged test audit only. Neither the target nor these effects enter the profile or planner input.
  effects: chestEffects,
  async snapshot() {
    const session = appSession(), view = session.view, { head } = await readCanonicalHead();
    return { owner: session.owner, controlled: view.controlled, busy: Boolean(view.busy), recoveryRequired: Boolean(view.recoveryRequired),
      status: view.status, game: structuredClone(view.game), canonical: snapshotOf(head), headStatus: head.status,
      launch: (await readLaunch()).value };
  },
});
declare global { interface Window { liveCorpus: typeof api } }
window.liveCorpus = api;
