import { useCallback, useEffect, useState } from 'react';
import { CharactersDialog } from './components/CharactersDialog';
import { BattleScreen } from './components/BattleScreen';
import { ExploreScreen } from './components/ExploreScreen';
import { SavesDialog } from './components/SavesDialog';
import { TownScreen } from './components/TownScreen';
import { createNewGameState, moveActive, setActorAutoBattle, setAutoThrottle, setGameMode, setPartyAutoBattle, setRandomBattles } from './domain/gameFactory';
import type { Direction, EquipmentSlot, GameState, SaveSummary, SkillId, VendorId } from './domain/types';
import { advanceBattleRound, endBattle, setBattleReturnMode, startBattle, useBattleSkill } from './domain/combat/battleEngine';
import { shouldStartEncounter } from './domain/combat/encounters';
import { defaultRng } from './domain/combat/rng';
import { nextDirectionToTarget } from './domain/maze/solver';
import { activeUnopenedChests, openChestAtActivePosition } from './domain/items/chests';
import { buyFromVendor, enterTown, leaveTown, useInn } from './domain/town/town';
import { autoEquipBestGear, equipItem, getEffectiveActor, sellItem, unequipItem, useConsumable } from './domain/items/inventory';
import { deleteSave, getGame, listSaves, saveGame } from './persistence/saveRepository';
import { importLegacyLocalStorageSaves } from './persistence/legacyLocalStorage';
import { AUTO_MAZE_MIN_MS, WAVE_RESTART_MIN_MS } from './domain/automation/throttle';

type DialogName = 'characters' | 'saves' | undefined;

function directionFromKey(key: string): Direction | undefined {
  switch (key.toLowerCase()) {
    case 'arrowup':
    case 'w':
      return 'north';
    case 'arrowright':
    case 'd':
      return 'east';
    case 'arrowdown':
    case 's':
      return 'south';
    case 'arrowleft':
    case 'a':
      return 'west';
    default:
      return undefined;
  }
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
    return true;
  }

  if (target.tagName !== 'INPUT') {
    return false;
  }

  const inputType = target.getAttribute('type') ?? 'text';
  return ['email', 'number', 'password', 'range', 'search', 'tel', 'text', 'url'].includes(inputType);
}

function partyAutoBattleActive(game: GameState) {
  return game.party.some((actor) => actor.autoBattle);
}

function autoControlActive(game: GameState) {
  if (game.battle) {
    return game.battle.returnMode === 'auto-play' || partyAutoBattleActive(game);
  }

  return game.mode === 'auto-play';
}

function wavesControlActive(game: GameState) {
  return game.mode === 'waves' || game.battle?.returnMode === 'waves';
}

export function App() {
  const [game, setGame] = useState<GameState | undefined>();
  const [saves, setSaves] = useState<SaveSummary[]>([]);
  const [dialog, setDialog] = useState<DialogName>();
  const [status, setStatus] = useState('Loading');
  const [combatClock, setCombatClock] = useState(() => Date.now());

  const refreshSaves = useCallback(async () => {
    setSaves(await listSaves());
  }, []);

  const persistAuto = useCallback(
    async (nextGame: GameState) => {
      setGame(nextGame);
      await saveGame('auto', 'Auto Save', 'auto', nextGame);
      await refreshSaves();
      setStatus('Saved');
    },
    [refreshSaves],
  );

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const imported = await importLegacyLocalStorageSaves();
      const autoSave = await getGame('auto');
      const loadedGame = autoSave?.game ?? createNewGameState();

      if (!autoSave) {
        await saveGame('auto', 'Auto Save', 'auto', loadedGame);
      }

      if (!cancelled) {
        setGame(loadedGame);
        await refreshSaves();
        setStatus(imported > 0 ? `Imported ${imported} legacy save${imported === 1 ? '' : 's'}` : 'Ready');
      }
    }

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [refreshSaves]);

  const move = useCallback(
    (direction: Direction) => {
      if (!game) {
        return;
      }

      const moved = moveActive(game, direction);
      if (moved === game) {
        return;
      }

      const changedPosition = moved.maze.active.row !== game.maze.active.row || moved.maze.active.column !== game.maze.active.column;
      const withChest = changedPosition ? openChestAtActivePosition(moved, defaultRng) : moved;
      const changedFloor = withChest.dungeonLevel !== game.dungeonLevel;
      const changedMode = withChest.mode !== game.mode;
      const next = withChest.randomBattles && changedPosition && !changedFloor && !changedMode && !withChest.battle && shouldStartEncounter(defaultRng) ? startBattle(withChest) : withChest;
      void persistAuto(next);
    },
    [game, persistAuto],
  );

  useEffect(() => {
    if (!game || game.battle || dialog) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target)) {
        return;
      }

      const direction = directionFromKey(event.key);
      if (!direction) {
        return;
      }

      event.preventDefault();
      move(direction);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dialog, game, move]);

  useEffect(() => {
    if (!game?.battle || game.battle.status !== 'active') {
      return undefined;
    }

    const id = window.setInterval(() => setCombatClock(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [game?.battle?.id, game?.battle?.status]);

  useEffect(() => {
    if (!game?.battle || game.battle.status !== 'active' || dialog || !partyAutoBattleActive(game)) {
      return undefined;
    }

    const id = window.setInterval(() => {
      const next = advanceBattleRound(game, defaultRng, Date.now());
      if (next !== game) {
        void persistAuto(next);
      }
    }, game.autoThrottleMs);

    return () => window.clearInterval(id);
  }, [dialog, game, persistAuto]);

  useEffect(() => {
    if (!game || game.mode !== 'waves' || game.battle || dialog) {
      return undefined;
    }

    const id = window.setTimeout(() => {
      void persistAuto(startBattle(setPartyAutoBattle(game, true), defaultRng));
    }, Math.max(WAVE_RESTART_MIN_MS, game.autoThrottleMs));

    return () => window.clearTimeout(id);
  }, [dialog, game, persistAuto]);

  useEffect(() => {
    if (!game || game.mode !== 'auto-play' || game.battle || dialog) {
      return undefined;
    }

    const id = window.setInterval(() => {
      const direction = nextDirectionToTarget(game.maze);
      if (direction) {
        move(direction);
      }
    }, Math.max(AUTO_MAZE_MIN_MS, game.autoThrottleMs));

    return () => window.clearInterval(id);
  }, [dialog, game, move]);

  const toggleAutoPlay = () => {
    if (!game) {
      return;
    }

    let next = game;
    const enabled = autoControlActive(game);

    if (enabled) {
      next = setPartyAutoBattle(next, false);
      next = next.battle ? setBattleReturnMode(next, 'manual') : setGameMode(next, 'manual');
    } else {
      next = setPartyAutoBattle(next, true);
      next = next.battle ? setBattleReturnMode(next, 'auto-play') : setGameMode(next, 'auto-play');
    }

    if (next !== game) {
      void persistAuto(next);
    }
  };

  const toggleWaves = () => {
    if (!game) {
      return;
    }

    let next = game;
    const enabled = wavesControlActive(game);

    if (enabled) {
      next = next.battle ? setBattleReturnMode(next, 'manual') : setGameMode(next, 'manual');
    } else {
      next = setPartyAutoBattle(next, true);
      next = next.battle ? setBattleReturnMode(next, 'waves') : startBattle(setGameMode(next, 'waves'), defaultRng);
    }

    if (next !== game) {
      void persistAuto(next);
    }
  };

  const changeRandomBattles = (enabled: boolean) => {
    if (!game) {
      return;
    }

    void persistAuto(setRandomBattles(game, enabled));
  };

  const changeAutoThrottle = (autoThrottleMs: number) => {
    if (!game) {
      return;
    }

    const next = setAutoThrottle(game, autoThrottleMs);
    if (next !== game) {
      void persistAuto(next);
    }
  };

  const createManualSave = async () => {
    if (!game) {
      return;
    }

    const stamp = new Date().toLocaleString();
    await saveGame(`manual-${Date.now()}`, stamp, 'manual', game);
    await refreshSaves();
    setStatus('Manual save created');
  };

  const loadSave = async (slotId: string) => {
    const slot = await getGame(slotId);
    if (!slot) {
      return;
    }

    await persistAuto(slot.game);
    setDialog(undefined);
    setStatus(`Loaded ${slot.label}`);
  };

  const removeSave = async (slotId: string) => {
    await deleteSave(slotId);
    await refreshSaves();
    setStatus('Save deleted');
  };

  const newGame = () => {
    void persistAuto(createNewGameState());
  };

  const fightRound = () => {
    if (!game) {
      return;
    }

    const next = advanceBattleRound(game, defaultRng, Date.now());
    if (next !== game) {
      void persistAuto(next);
    }
  };

  const castSkill = (actorId: string, skillId: SkillId) => {
    if (!game) {
      return;
    }

    void persistAuto(useBattleSkill(game, actorId, skillId, defaultRng, Date.now()));
  };

  const closeBattle = () => {
    if (!game) {
      return;
    }

    void persistAuto(endBattle(game));
  };

  const goTown = () => {
    if (!game) {
      return;
    }

    void persistAuto(enterTown(game));
  };

  const exitTown = () => {
    if (!game) {
      return;
    }

    void persistAuto(leaveTown(game));
  };

  const restAtInn = () => {
    if (!game) {
      return;
    }

    void persistAuto(useInn(game));
  };

  const buyItem = (vendor: VendorId, baseId: string) => {
    if (!game) {
      return;
    }

    void persistAuto(buyFromVendor(game, vendor, baseId));
  };

  const equipInventoryItem = (actorId: string, itemId: string) => {
    if (!game) {
      return;
    }

    void persistAuto(equipItem(game, actorId, itemId));
  };

  const unequipInventoryItem = (actorId: string, slot: EquipmentSlot) => {
    if (!game) {
      return;
    }

    void persistAuto(unequipItem(game, actorId, slot));
  };

  const useInventoryItem = (itemId: string, actorId?: string) => {
    if (!game) {
      return;
    }

    void persistAuto(useConsumable(game, itemId, actorId));
  };

  const sellInventoryItem = (itemId: string) => {
    if (!game) {
      return;
    }

    void persistAuto(sellItem(game, itemId));
  };

  const autoEquipInventory = () => {
    if (!game) {
      return;
    }

    const next = autoEquipBestGear(game);
    if (next !== game) {
      void persistAuto(next);
    }
  };

  const changeActorAutoBattle = (actorId: string, enabled: boolean) => {
    if (!game) {
      return;
    }

    const next = setActorAutoBattle(game, actorId, enabled);
    if (next !== game) {
      void persistAuto(next);
    }
  };

  if (!game) {
    return <main className="loading-screen">Loading</main>;
  }

  const visibleBattle = game.battle?.status === 'won' ? undefined : game.battle;

  return (
    <>
      {visibleBattle ? (
        <BattleScreen
          battle={visibleBattle}
          party={game.party.map((actor) => getEffectiveActor(actor, game.inventory))}
          now={combatClock}
          onRound={fightRound}
          onSkill={castSkill}
          onAutoBattleChange={changeActorAutoBattle}
          autoActive={autoControlActive(game)}
          wavesActive={wavesControlActive(game)}
          autoThrottleMs={game.autoThrottleMs}
          onAutoToggle={toggleAutoPlay}
          onWavesToggle={toggleWaves}
          onAutoThrottleChange={changeAutoThrottle}
          onEnd={closeBattle}
          onCharacters={() => setDialog('characters')}
          onSaves={() => setDialog('saves')}
        />
      ) : game.mode === 'town' ? (
        <TownScreen game={game} onLeave={exitTown} onRest={restAtInn} onBuy={buyItem} onCharacters={() => setDialog('characters')} onSaves={() => setDialog('saves')} />
      ) : (
        <ExploreScreen
          game={game}
          status={status}
          onMove={move}
          chests={activeUnopenedChests(game).map((chest) => chest.position)}
          autoActive={autoControlActive(game)}
          wavesActive={wavesControlActive(game)}
          autoThrottleMs={game.autoThrottleMs}
          onAutoToggle={toggleAutoPlay}
          onWavesToggle={toggleWaves}
          onAutoThrottleChange={changeAutoThrottle}
          onTown={goTown}
          onCharacters={() => setDialog('characters')}
          onSaves={() => setDialog('saves')}
          onNewGame={newGame}
          onRandomBattlesChange={changeRandomBattles}
        />
      )}
      {dialog === 'saves' ? (
        <SavesDialog saves={saves} onClose={() => setDialog(undefined)} onCreateSave={createManualSave} onLoadSave={loadSave} onDeleteSave={removeSave} />
      ) : null}
      {dialog === 'characters' ? (
        <CharactersDialog
          party={game.party}
          inventory={game.inventory}
          onAutoBattleChange={changeActorAutoBattle}
          onEquipItem={equipInventoryItem}
          onUnequipItem={unequipInventoryItem}
          onUseItem={useInventoryItem}
          onAutoEquip={autoEquipInventory}
          onSellItem={sellInventoryItem}
          canSellItems={game.mode === 'town'}
          onClose={() => setDialog(undefined)}
        />
      ) : null}
    </>
  );
}
