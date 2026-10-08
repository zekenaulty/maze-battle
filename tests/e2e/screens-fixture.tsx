import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ExploreScreen } from '../../src/components/ExploreScreen';
import { BattleScreen } from '../../src/components/BattleScreen';
import { TownScreen } from '../../src/components/TownScreen';
import { SavesDialog } from '../../src/components/SavesDialog';
import { createNewGameState } from '../../src/domain/gameFactory';
import { createVendorItem } from '../../src/domain/items/loot';
import type { SaveSummary } from '../../src/domain/types';
import '../../src/styles.css';

const initial = createNewGameState();
initial.autopilot = { phase: 'blocked', floor: 1, targetId: 'Guild cache', reason: 'No route to remaining guild cache; waiting for manual recovery.', route: [], stalledTicks: 2 };
initial.stash.items = Array.from({ length: 12 }, (_, index) => ({ ...createVendorItem('iron-sword'), displayName: `Stored sword ${index + 1}` }));
const noop = () => {};

function Fixture() {
  const mode = new URLSearchParams(location.search).get('screen');
  const [game, setGame] = useState(initial);
  const [auto, setAuto] = useState(true);
  const [savesOpen, setSavesOpen] = useState(mode === 'saves');
  const [saves, setSaves] = useState<SaveSummary[]>([{ slotId: 'fixture-one', label: 'Before the descent into the lower halls', kind: 'manual', updatedAt: '2026-10-08T12:00:00Z', dungeonLevel: 4, partyLevels: { warrior: 4, mage: 4, healer: 4 } }]);
  const diagnostics = () => { document.body.dataset.diagnostics = 'opened'; };
  return <>
    {mode === 'battle' ? <BattleScreen battle={{ id: 'fixture-battle', wave: 8, round: 4, status: 'active', log: Array.from({ length: 25 }, (_, index) => `Round ${index + 1}: The party holds its ground.`), enemies: [{ id: 'enemy', displayName: 'Slime', token: String.fromCodePoint(0x1f7e2), tags: ['ooze'], level: 4, hp: 90, maxHp: 120, mp: 0, maxMp: 0, attributes: { strength: 1, vitality: 1, intellect: 1, available: 0 }, combat: { baseDamage: 2, scaleWith: 'strength' }, skills: [] }] }} party={game.party} now={1000} onRound={noop} onSkill={(id) => setGame({ ...game, party: game.party.map((actor) => actor.id === id ? { ...actor, gcdUntil: 2000 } : actor) })} onAutoBattleChange={noop} autoActive={auto} wavesActive={false} autoThrottleMs={500} onAutoToggle={() => setAuto(!auto)} onWavesToggle={noop} onAutoThrottleChange={noop} onEnd={noop} onCharacters={noop} onSaves={() => setSavesOpen(true)} onDiagnostics={diagnostics} autopilot={game.autopilot} />
    : mode === 'town' ? <TownScreen game={{ ...game, mode: 'town' }} autoActive={auto} onAutoToggle={() => setAuto(!auto)} onLeave={noop} onRest={noop} onBuy={noop} onAcceptQuest={noop} onClaimQuest={noop} onSellJunk={noop} onWithdrawStash={(id) => setGame({ ...game, stash: { ...game.stash, items: game.stash.items.filter((item) => item.id !== id) } })} onCharacters={noop} onSaves={() => setSavesOpen(true)} onDiagnostics={diagnostics} />
    : <ExploreScreen game={game} status="Ready" onMove={noop} chests={[]} autoActive={auto} wavesActive={false} autoThrottleMs={500} onAutoToggle={() => setAuto(!auto)} onWavesToggle={noop} onAutoThrottleChange={noop} onTown={noop} onCharacters={noop} onSaves={() => setSavesOpen(true)} onNewGame={() => { document.body.dataset.newGame = 'confirmed'; }} onRandomBattlesChange={noop} onDiagnostics={diagnostics} />}
    {savesOpen && <SavesDialog saves={saves} onClose={() => setSavesOpen(false)} onCreateSave={noop} onLoadSave={noop} onDeleteSave={(id) => setSaves(saves.filter((save) => save.slotId !== id))} />}
  </>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
