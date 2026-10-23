import { GameSession } from '../../src/services/game/GameSession';
import { initializeCorpus } from './canonical-corpus.initialize';
import { manualCommands, autoTick, replayCommand } from './canonical-controller-parity.manual';
import { earnChest, key } from './canonical-controller-parity.setup';
import { audit } from './canonical-controller-parity.audit';
import { agentWindow, replayAgent } from './canonical-controller-parity.agent';
import type { CanonicalReceipt } from '../../src/persistence/canonical/types';

if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5466') throw Error('Isolated controller parity fixture only');
let session: GameSession, manual: ReturnType<typeof manualCommands>, setup: Awaited<ReturnType<typeof earnChest>>;
async function boot() {
  session = new GameSession(() => {}); await initializeCorpus('A', session.owner); await session.start();
  manual = manualCommands(session); setup = await earnChest(session, manual.commands);
  return { setup, before: await audit(setup) };
}
async function direct(kind: 'manual' | 'auto') {
  const commands = manual.commands, navigation = [];
  if (kind === 'auto') { await commands.throttle(16); await commands.toggleAuto(); }
  const before = await audit(setup);
  for (let i = 0; i < 4 && key(session.view.game!.checkpoint.position) !== key(setup.target); i++) {
    const receipt = kind === 'auto' ? await autoTick(session) : await commands.move(setup.route[i].direction, { triggerStairs: false });
    navigation.push({ receipt, state: await audit(setup) });
  }
  if (key(session.view.game!.checkpoint.position) !== key(setup.target)) throw Error('Controller did not arrive within four actions');
  const arrived = await audit(setup), original = kind === 'auto' ? await autoTick(session) : await commands.openChest(setup.chestId);
  const opened = await audit(setup), replay = await replayCommand(session, original), repeated = await audit(setup);
  // A second fresh Manual intent is distinct from replay, and must not award again.
  const second = kind === 'manual' ? await commands.openChest(setup.chestId) : null;
  const afterSecond = await audit(setup);
  if (kind === 'auto') await commands.stopAuto();
  return { before, navigation, arrived, original, opened, replay, repeated, second, afterSecond, stopped: await audit(setup) };
}
async function agent() {
  const before = await audit(setup), navigation = await agentWindow(session, setup, 'navigate');
  const arrival = await audit(setup), interaction = await agentWindow(session, setup, 'open');
  return { before, navigation, arrival, interaction, stopped: await audit(setup) };
}
async function reloadReplay(input: { setup: typeof setup; receipt?: CanonicalReceipt;
  agent?: Parameters<typeof replayAgent>[1] }) {
  setup = input.setup;
  const persisted = await audit(setup);
  session = new GameSession(() => {}); await session.start();
  const before = await audit(setup);
  const result = input.receipt ? await replayCommand(session, input.receipt) : await replayAgent(session, input.agent!);
  return { persisted, before, result, after: await audit(setup) };
}
const api = { boot, direct, agent, reloadReplay, stop() { manual?.close(); session?.stop(); } };
declare global { interface Window { canonicalControllerParity: typeof api } }
window.canonicalControllerParity = api;
