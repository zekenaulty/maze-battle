import { useCallback, useState } from 'react';
import { CharactersDialog } from './components/CharactersDialog';
import { ExploreScreen } from './components/ExploreScreen';
import { SavesDialog } from './components/SavesDialog';
import { GameRecovery } from './components/GameRecovery';
import { TownScreen } from './components/TownScreen';
import { Dialog } from './components/Dialog';
import { normalizeInventoryPolicy } from './domain/items/inventory';
import { canUseTownPortal, portalScrollCount } from './domain/town/town';
import { useGameSession } from './hooks/useGameSession';
import { useGameCommands } from './hooks/useGameCommands';
import { useCanonicalMovement } from './hooks/useCanonicalMovement';
import { useCanonicalAuto } from './hooks/useCanonicalAuto';

type DialogName = 'characters' | 'saves' | 'diagnostics' | 'agentic' | undefined;

export function App() {
  const session = useGameSession(), { game } = session;
  const [dialog, setDialog] = useState<DialogName>();
  const recovering = Boolean(session.recoveryRequired || session.busy);
  const blocked = recovering || Boolean(dialog) || !session.controlled;
  const auto = useCanonicalAuto(game, blocked, session.controller);
  const navigation = useCanonicalMovement(game, blocked, session.controller, auto.cancel);
  const pause = useCallback(() => { navigation.cancel(); auto.cancel(); }, [navigation.cancel, auto.cancel]);
  const commands = useGameCommands(session.controller, pause);
  const open = (name: DialogName) => { pause(); setDialog(name); };
  const openSaves = () => { open('saves'); void session.refreshSaves().catch(() => {}); };
  const newGame = async () => { pause(); await session.resetGame(); setDialog(undefined); };
  if (!game || recovering) return <GameRecovery status={session.status} busy={session.busy} onRetry={session.retry} onReset={newGame} />;
  const shared = { onCharacters: () => open('characters'), onSaves: openSaves,
    onDiagnostics: () => open('diagnostics'), onAutoToggle: commands.toggleAuto };
  return <>
    {!session.controlled && <aside className="session-custody" role="status">
      <span>{session.status}</span><button onClick={() => { navigation.cancel(); void session.takeControl().catch(() => {}); }}>Take control</button>
    </aside>}
    {game.mode === 'town' ? <TownScreen {...shared} game={game}
      onLeave={commands.leaveTown} onRest={commands.rest} onBuy={commands.buy}
      onAcceptQuest={commands.acceptQuest} onClaimQuest={commands.claimQuest}
      onSellJunk={commands.sellJunk} onWithdrawStash={commands.withdraw} onStashItem={commands.stash}
      onToggleItemLock={commands.lock} onInventoryPolicyChange={commands.policy}
    /> : <ExploreScreen {...shared} game={game} status={game.mode === 'auto-play' ? auto.message || session.status : session.status} onMove={commands.move}
      autoActive={game.mode === 'auto-play'} autoAvailable={session.controlled} wavesActive={false} autoThrottleMs={game.autoThrottleMs}
      onWavesToggle={() => {}} onAutoThrottleChange={commands.throttle}
      onTown={commands.portal} portalScrollCount={portalScrollCount(game)} onNewGame={newGame}
      onRandomBattlesChange={() => {}} onTileClick={navigation.navigate} onStopWalking={pause}
      navigationMessage={navigation.message} onOpenChest={commands.openChest} controlsDisabled={blocked}
      onAgenticPlay={() => open('agentic')}
    />}
    {dialog === 'agentic' && <Dialog title="Agentic Play" onClose={() => setDialog(undefined)}>
      <p role="status">Agentica is unavailable during the canonical storage cutover. No service or model calls will be made.</p>
    </Dialog>}
    {dialog === 'saves' && <SavesDialog readOnly={!session.controlled} saves={session.saves}
      onClose={() => setDialog(undefined)} onCreateSave={session.createManualSave}
      onLoadSave={async id => { pause(); await session.loadSave(id); setDialog(undefined); }}
      onDeleteSave={session.removeSave} onNewGame={newGame} />}
    {dialog === 'characters' && <CharactersDialog party={game.party} inventory={game.inventory} stash={game.stash}
      onAutoBattleChange={commands.actorAuto} onEquipItem={commands.equip} onUnequipItem={commands.unequip}
      onUseItem={(id, actorId) => { commands.useItem(id, actorId); if (game.inventory.items.find(i => i.id === id)?.consumableEffect === 'townPortal' && canUseTownPortal(game)) setDialog(undefined); }}
      onAutoEquip={commands.autoEquip} onSellItem={commands.sell} onStashItem={commands.stash}
      canSellItems={game.mode === 'town'} canStashItems={game.mode === 'town'} canUseTownPortal={canUseTownPortal(game)}
      inventoryPolicy={normalizeInventoryPolicy(game.inventoryPolicy)} onInventoryPolicyChange={commands.policy}
      onToggleItemLock={commands.lock} onSpendAttribute={commands.spend} onAutoSpendChange={commands.autoSpend}
      onCastSkill={commands.skill} now={Date.now()} allowOutOfCombatSkills allowTeleport={false} onClose={() => setDialog(undefined)} />}
    {dialog === 'diagnostics' && <Dialog title="Storage diagnostics" onClose={() => setDialog(undefined)}>
      <p>Revision {game.snapshot.revision}</p>
      <table><thead><tr><th>Action</th><th>Reads</th><th>Writes</th><th>Logical bytes written</th><th>ms</th></tr></thead>
        <tbody>{session.diagnostics.slice().reverse().map(d => <tr key={d.revision}>
          <td>{d.action}</td><td>{d.stats.reads}</td><td>{d.stats.writes}</td><td>{d.stats.writeBytes}</td><td>{Math.round(d.elapsedMs)}</td>
        </tr>)}</tbody></table>
    </Dialog>}
  </>;
}
