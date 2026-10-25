import { useCallback, useState } from 'react';
import { CharactersDialog } from './components/CharactersDialog';
import { ExploreScreen } from './components/ExploreScreen';
import { SavesDialog } from './components/SavesDialog';
import { GameRecovery } from './components/GameRecovery';
import { TownScreen } from './components/TownScreen';
import { BattleView } from './components/BattleView';
import { GameDiagnostics } from './components/diagnostics/GameDiagnostics';
import { AgenticaRecovery } from './components/agentic/AgenticaRecovery';
import { AgenticPlayDialog } from './components/agentic/AgenticPlayDialog';
import { useGameAgenticPlay } from './hooks/useGameAgenticPlay';
import { normalizeInventoryPolicy } from './domain/items/inventory';
import { canUseTownPortal, portalScrollCount } from './domain/town/town';
import { useGameSession } from './hooks/useGameSession';
import { useGameCommands } from './hooks/useGameCommands';
import { useCanonicalMovement } from './hooks/useCanonicalMovement';
import { useCanonicalAuto } from './hooks/useCanonicalAuto';
import { useCanonicalBattle } from './hooks/useCanonicalBattle';
import { automationActive, wavesActive } from './viewModels/gameAutomation';

type DialogName = 'characters' | 'saves' | 'diagnostics' | 'agentic' | 'agentic-recovery' | undefined;

export function App() {
  const session = useGameSession(), { game } = session;
  const agentic = useGameAgenticPlay(session.controller);
  const [dialog, setDialog] = useState<DialogName>();
  const [view3D, setView3D] = useState(() => new URLSearchParams(location.search).get('view') === 'stage3d');
  const recovering = Boolean(session.recoveryRequired || session.busy);
  const blocked = recovering || Boolean(dialog) || !session.controlled || agentic.active;
  const auto = useCanonicalAuto(game, blocked, session.controller);
  const combat = useCanonicalBattle(session.controller, blocked);
  const navigation = useCanonicalMovement(game, blocked, session.controller, auto.cancel);
  const pause = useCallback(() => { navigation.cancel(); auto.cancel(); combat.cancel(); }, [navigation.cancel, auto.cancel, combat.cancel]);
  const commands = useGameCommands(session.controller, pause);
  const open = (name: DialogName) => { pause(); setDialog(name); };
  const openSaves = () => { open('saves'); void session.refreshSaves().catch(() => {}); };
  const newGame = async () => { pause(); await session.resetGame(); setDialog(undefined); };
  const openRecovery = () => { agentic.recover(); open('agentic-recovery'); };
  const openAgentic = () => open(agentic.profile || agentic.configurationError ? 'agentic' : 'agentic-recovery');
  const agenticaRecovery = dialog === 'agentic-recovery' && <AgenticaRecovery controller={session.controller}
    game={game} controlled={session.controlled} onClose={() => setDialog(undefined)}
    onResume={offer => { agentic.resumeNavigation(offer); open('agentic'); }}
    onAdopt={offer => { agentic.adoptDecision(offer); open('agentic'); }} />;
  if (!game || recovering) return <><GameRecovery status={session.status} busy={session.busy}
    onRetry={session.retry} onReset={newGame} onAgenticaRecovery={openRecovery} />{agenticaRecovery}</>;
  const shared = { onCharacters: () => open('characters'), onSaves: openSaves,
    onDiagnostics: () => open('diagnostics'), onAutoToggle: commands.toggleAuto };
  return <>
    {!session.controlled && <aside className="session-custody" role="status">
      <span>{session.status}</span><button onClick={() => { navigation.cancel(); void session.takeControl().catch(() => {}); }}>Take control</button>
    </aside>}
    {game.battle ? <BattleView {...shared} battle={game.battle} party={game.party} inventory={game.inventory}
      controlsDisabled={!session.controlled || agentic.active}
      onRound={commands.round} onSkill={commands.skill} onAutoBattleChange={commands.actorAuto} onEnd={commands.closeBattle}
      autoActive={automationActive(game)} wavesActive={wavesActive(game)} autoThrottleMs={game.autoThrottleMs}
      onWavesToggle={commands.toggleWaves} onAutoThrottleChange={commands.throttle} onStopAutomation={commands.stopAuto}
    /> : game.mode === 'town' ? <TownScreen {...shared} game={game}
      onLeave={commands.leaveTown} onRest={commands.rest} onBuy={commands.buy}
      onAcceptQuest={commands.acceptQuest} onClaimQuest={commands.claimQuest}
      onSellJunk={commands.sellJunk} onWithdrawStash={commands.withdraw} onStashItem={commands.stash}
      onToggleItemLock={commands.lock} onInventoryPolicyChange={commands.policy}
    /> : <ExploreScreen {...shared} game={game} status={game.mode === 'auto-play' ? auto.message || session.status : session.status} onMove={commands.move}
      autoActive={automationActive(game)} autoAvailable={session.controlled && !agentic.active} wavesActive={wavesActive(game)} autoThrottleMs={game.autoThrottleMs}
      onWavesToggle={commands.toggleWaves} onAutoThrottleChange={commands.throttle}
      onTown={commands.portal} portalScrollCount={portalScrollCount(game)} onNewGame={newGame}
      onRandomBattlesChange={commands.encounters} onTileClick={navigation.navigate} onStopWalking={pause}
      navigationMessage={navigation.message} onOpenChest={commands.openChest} controlsDisabled={blocked}
      onAgenticPlay={openAgentic} agenticActive={agentic.active}
      onStopAgenticPlay={agentic.active ? agentic.stop : undefined}
      onStageMove={async (direction, expectedPosition) => { await commands.move(direction, { triggerStairs: false, expectedPosition }); return session.controller.view.game; }}
      onStageStairs={(direction, expectedPosition) => { void commands.stairs(direction, expectedPosition).catch(() => {}); }}
      view3D={view3D} onView3DChange={setView3D}
      onPrepareStairs={(expected, binding) => { pause(); return session.controller.prepareStairs(expected, binding); }}
      onWalkStairs={async (direction, expected, binding) => {
        pause(); await session.controller.execute('exploration', { kind: 'stairs', direction }, { expectedPosition: expected, spatialBinding: binding });
        return session.controller.view.game;
      }}
    />}
    {dialog === 'agentic' && <AgenticPlayDialog profile={agentic.profile} configurationError={agentic.configurationError}
      phase={agentic.phase} active={agentic.active} activeObjective={agentic.objective} message={agentic.message} error={agentic.error}
      canStart={session.controlled && !recovering && game.mode === 'manual' && !game.battle}
      returnQuests={agentic.returnQuests}
      canContinue={agentic.canContinue} onContinue={agentic.continueDecision}
      onStart={agentic.start} onStop={agentic.stop} onRecovery={openRecovery} onClose={() => setDialog(undefined)} />}
    {agenticaRecovery}
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
      onCastSkill={commands.skill} allowOutOfCombatSkills={!game.battle}
      allowTeleport={game.mode !== 'town' && !game.battle && session.controlled && !agentic.active} onClose={() => setDialog(undefined)} />}
    {dialog === 'diagnostics' && <GameDiagnostics snapshot={game.snapshot} diagnostics={session.diagnostics} onClose={() => setDialog(undefined)} />}
  </>;
}
