import { useState } from 'react';
import { CharactersDialog } from './components/CharactersDialog';
import { BattleScreen } from './components/BattleScreen';
import { ExploreScreen } from './components/ExploreScreen';
import { SavesDialog } from './components/SavesDialog';
import { TownScreen } from './components/TownScreen';
import { DiagnosticsDialog } from './components/diagnostics/DiagnosticsDialog';
import { createNewGameState } from './domain/gameFactory';
import { autoControlActive, wavesControlActive } from './domain/automation/autoPlay';
import { activeUnopenedChests } from './domain/items/chests';
import { getEffectiveActor, normalizeInventoryPolicy } from './domain/items/inventory';
import { canUseTownPortal, portalScrollCount } from './domain/town/town';
import { useGameSession } from './hooks/useGameSession';
import { useGameLoop } from './hooks/useGameLoop';
import { useGameCommands } from './hooks/useGameCommands';

type DialogName = 'characters' | 'saves' | 'diagnostics' | undefined;

export function App() {
  const session = useGameSession();
  const { game, telemetry } = session;
  const [dialog, setDialog] = useState<DialogName>();
  const clock = useGameLoop(game, Boolean(dialog) || !session.controlled, session.transition);
  const commands = useGameCommands(session.transition);
  const openSaves = () => {
    setDialog('saves');
    void session.flush().then(session.refreshSaves, session.refreshSaves).catch(() => undefined);
  };
  const newGame = async () => {
    await session.replaceGame(createNewGameState());
    await session.flush();
    setDialog(undefined);
  };

  if (!game) return <main className="loading-screen"><p>{session.status}</p>{session.status.startsWith('Load failed') && <button onClick={() => location.reload()}>Retry</button>}</main>;
  const shared = {
    onCharacters: () => setDialog('characters'), onSaves: openSaves,
    onDiagnostics: () => setDialog('diagnostics'), onAutoToggle: commands.toggleAuto,
  };
  const automation = {
    autoActive: autoControlActive(game), wavesActive: wavesControlActive(game),
    autoThrottleMs: game.autoThrottleMs, onAutoToggle: commands.toggleAuto,
    onWavesToggle: commands.toggleWaves, onAutoThrottleChange: commands.throttle,
  };

  return <>
    {!session.controlled && <aside className="session-custody" role="status">
      <span>{session.status.startsWith('Save failed') ? session.status : 'Read only. Another tab controls this game.'}</span>
      <button onClick={() => { void session.takeControl().catch(() => {}); }}>Take control</button>
    </aside>}
    {session.warning && <aside className="session-warning" role="alert">{session.warning}</aside>}
    {game.battle && game.battle.status !== 'won' ? <BattleScreen
      {...shared} {...automation} battle={game.battle} autopilot={game.autopilot}
      party={game.party.map(actor => getEffectiveActor(actor, game.inventory))} now={clock}
      onRound={commands.round} onSkill={commands.skill} onAutoBattleChange={commands.actorAuto}
      onEnd={commands.closeBattle} onStopAutomation={commands.stopAuto}
    /> : game.mode === 'town' ? <TownScreen
      {...shared} game={game} autoActive={!game.automationPaused && Boolean(game.townReturnMode && game.townReturnMode !== 'manual')}
      onLeave={commands.leaveTown} onRest={commands.rest} onBuy={commands.buy}
      onAcceptQuest={commands.acceptQuest} onClaimQuest={commands.claimQuest}
      onSellJunk={commands.sellJunk} onWithdrawStash={commands.withdraw} onStashItem={commands.stash}
      onToggleItemLock={commands.lock} onInventoryPolicyChange={commands.policy}
    /> : <ExploreScreen
      {...shared} {...automation} game={game} status={session.status} onMove={commands.move}
      chests={activeUnopenedChests(game).map(chest => chest.position)}
      onTown={commands.portal} portalScrollCount={portalScrollCount(game)} onNewGame={newGame}
      onRandomBattlesChange={commands.encounters}
    />}
    {dialog === 'saves' && <SavesDialog
      readOnly={!session.controlled}
      saves={session.saves} onClose={() => setDialog(undefined)} onCreateSave={session.createManualSave}
      onLoadSave={async id => { await session.loadSave(id); setDialog(undefined); }}
      onDeleteSave={session.removeSave} onNewGame={newGame}
    />}
    {dialog === 'characters' && <CharactersDialog
      party={game.party} inventory={game.inventory} stash={game.stash} onAutoBattleChange={commands.actorAuto}
      onEquipItem={commands.equip} onUnequipItem={commands.unequip}
      onUseItem={(id, actorId) => { commands.useItem(id, actorId); if (game.inventory.items.find(i => i.id === id)?.consumableEffect === 'townPortal' && canUseTownPortal(game)) setDialog(undefined); }}
      onAutoEquip={commands.autoEquip} onSellItem={commands.sell} onStashItem={commands.stash}
      canSellItems={game.mode === 'town'} canStashItems={game.mode === 'town'} canUseTownPortal={canUseTownPortal(game)}
      inventoryPolicy={normalizeInventoryPolicy(game.inventoryPolicy)} onInventoryPolicyChange={commands.policy}
      onToggleItemLock={commands.lock} onSpendAttribute={commands.spend}
      onAutoSpendChange={commands.autoSpend} onCastSkill={commands.skill} now={clock}
      allowOutOfCombatSkills={!game.battle}
      allowTeleport={game.mode !== 'town'}
      onClose={() => setDialog(undefined)}
    />}
    {dialog === 'diagnostics' && telemetry && <DiagnosticsDialog game={game} telemetry={telemetry} onClose={() => setDialog(undefined)} />}
  </>;
}
