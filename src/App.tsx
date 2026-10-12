import { useCallback, useState } from 'react';
import { CharactersDialog } from './components/CharactersDialog';
import { BattleScreen } from './components/BattleScreen';
import { ExploreScreen } from './components/ExploreScreen';
import { SavesDialog } from './components/SavesDialog';
import { GameRecovery } from './components/GameRecovery';
import { TownScreen } from './components/TownScreen';
import { DiagnosticsDialog } from './components/diagnostics/DiagnosticsDialog';
import { AgenticPlayDialog } from './components/agentic/AgenticPlayDialog';
import { createNewGameState } from './domain/gameFactory';
import { autoControlActive, wavesControlActive } from './domain/automation/autoPlay';
import { getEffectiveActor, normalizeInventoryPolicy } from './domain/items/inventory';
import { canUseTownPortal, portalScrollCount } from './domain/town/town';
import { useGameSession } from './hooks/useGameSession';
import { useGameLoop } from './hooks/useGameLoop';
import { useGameCommands } from './hooks/useGameCommands';
import { useClickNavigation } from './hooks/useClickNavigation';
import { useAgenticPlay } from './hooks/useAgenticPlay';
import type { GameTransition } from './hooks/useGameLoop';

type DialogName = 'characters' | 'saves' | 'diagnostics' | 'agentic' | undefined;

export function App() {
  const session = useGameSession();
  const { game, telemetry } = session;
  const [dialog, setDialog] = useState<DialogName>();
  const [agentEndpoint, setAgentEndpoint] = useState('ws://127.0.0.1:5085/api/host');
  const recovering = Boolean(session.recoveryRequired || session.busy);
  const agent = useAgenticPlay(session.controller, recovering || !session.controlled || Boolean(dialog && dialog !== 'agentic')
    || game?.mode === 'town' || Boolean(game?.battle && game.battle.status !== 'won'));
  const blocked = recovering || Boolean(dialog) || !session.controlled;
  const navigation = useClickNavigation(game, blocked, session.transition);
  const pauseManual = useCallback(() => { agent.pause(); navigation.cancel(); }, [agent.pause, navigation.cancel]);
  const clock = useGameLoop(game, blocked, session.transition, pauseManual);
  const manualTransition = useCallback<GameTransition>((update, context) => {
    pauseManual();
    session.transition(update, context);
  }, [pauseManual, session.transition]);
  const commands = useGameCommands(manualTransition);
  const openDialog = (name: DialogName) => { pauseManual(); setDialog(name); };
  const openSaves = () => {
    openDialog('saves');
    void session.flush().then(session.refreshSaves, session.refreshSaves).catch(() => undefined);
  };
  const newGame = async () => {
    pauseManual();
    await session.replaceGame(createNewGameState());
    await session.flush();
    setDialog(undefined);
  };

  if (!game || recovering) return <GameRecovery status={session.status} busy={session.busy}
    onRetry={session.retry} onReset={async () => {
      pauseManual();
      await session.resetGame();
      setDialog(undefined);
    }} />;
  const shared = {
    onCharacters: () => openDialog('characters'), onSaves: openSaves,
    onDiagnostics: () => openDialog('diagnostics'), onAutoToggle: commands.toggleAuto,
  };
  const automation = {
    autoActive: autoControlActive(game), wavesActive: wavesControlActive(game),
    autoThrottleMs: game.autoThrottleMs, onAutoToggle: commands.toggleAuto,
    onWavesToggle: commands.toggleWaves, onAutoThrottleChange: commands.throttle,
  };

  return <>
    {!session.controlled && <aside className="session-custody" role="status">
      <span>{session.status}</span>
      <button onClick={() => { pauseManual(); void session.takeControl().catch(() => {}); }}>Take control</button>
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
      observationHead={session.observationHead}
      onTown={commands.portal} portalScrollCount={portalScrollCount(game)} onNewGame={newGame}
      onRandomBattlesChange={commands.encounters}
      onTileClick={position => { pauseManual(); navigation.navigate(position); }} onStopWalking={pauseManual} navigationMessage={navigation.message}
      onOpenChest={commands.openChest} controlsDisabled={blocked}
      onAgenticPlay={() => { navigation.cancel(); setDialog('agentic'); }}
      onStopAgenticPlay={agent.canStop ? () => { void agent.stop(); } : undefined}
    />}
    {dialog === 'agentic' && <AgenticPlayDialog
      position={{ floor: game.dungeonLevel, ...game.maze.active }} view={agent.view}
      entrance={{ floor: game.dungeonLevel, ...game.maze.start }}
      quests={game.quests.filter(quest => quest.floor === game.dungeonLevel && quest.task.objective === 'fetch'
        && quest.task.item && quest.task.required === 1
        && (quest.status === 'active' || quest.status === 'complete'))
        .map(quest => ({ id: quest.id, title: quest.title, itemName: quest.task.item?.displayName ?? quest.task.noun }))}
      busy={agent.busy} canStop={agent.canStop} controlled={session.controlled} error={agent.error}
      endpoint={agentEndpoint} onEndpointChange={setAgentEndpoint}
      onStart={(url, target, mode, questId) => { navigation.cancel(); if (autoControlActive(game) || wavesControlActive(game)) commands.stopAuto(); void agent.start(url, target, mode, questId); }}
      onReconnect={(url, target) => { navigation.cancel(); void agent.reconnect(url, target); }}
      onAdopt={() => { navigation.cancel(); if (autoControlActive(game) || wavesControlActive(game)) commands.stopAuto(); void agent.adopt(); }}
      onStop={() => { void agent.stop(); }} onClose={() => setDialog(undefined)}
    />}
    {dialog === 'saves' && <SavesDialog
      readOnly={!session.controlled}
      saves={session.saves} onClose={() => setDialog(undefined)} onCreateSave={session.createManualSave}
      onLoadSave={async id => { pauseManual(); await session.loadSave(id); setDialog(undefined); }}
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
