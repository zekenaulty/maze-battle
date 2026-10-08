import { Activity } from 'lucide-react';
import type { GameState, InventoryPolicy, VendorId } from '../domain/types';
import { getEffectiveActor } from '../domain/items/inventory';
import { AutoStatus } from './screens/AutoStatus';
import { TownGuild } from './screens/TownGuild';
import { TownStorage } from './screens/TownStorage';
import { TownVendor } from './screens/TownVendor';
import { TownPolicy } from './screens/TownPolicy';
import './screens/screens.css';
import './screens/town.css';

interface TownScreenProps {
  game: GameState;
  onLeave: () => void;
  onRest: () => void;
  onBuy: (vendor: VendorId, baseId: string) => void;
  onAcceptQuest: (contractId: string) => void;
  onClaimQuest: (questId: string) => void;
  onSellJunk: () => void;
  onWithdrawStash: (itemId: string) => void;
  onCharacters: () => void;
  onSaves: () => void;
  autoActive?: boolean;
  onAutoToggle?: () => void;
  onStashItem?: (itemId: string) => void;
  onToggleItemLock?: (itemId: string) => void;
  onInventoryPolicyChange?: (policy: InventoryPolicy) => void;
  onDiagnostics?: () => void;
}

export function TownScreen({ game, onLeave, onRest, onBuy, onAcceptQuest, onClaimQuest, onSellJunk, onWithdrawStash, onCharacters, onSaves,
  autoActive = game.townReturnMode === 'auto-play', onAutoToggle, onStashItem, onToggleItemLock, onInventoryPolicyChange, onDiagnostics }: TownScreenProps) {
  const rested = game.party.every((actor) => {
    const effective = getEffectiveActor(actor, game.inventory);
    return effective.hp === effective.maxHp && effective.mp === effective.maxMp;
  });
  return (
    <main className="game-screen town-screen refined-screen">
      <div className="screen-bar">
        <div>
          <h1>Town</h1>
          <span className="screen-status">Floor {game.dungeonLevel} - Gold {game.inventory.gold} - Pack {game.inventory.items.length}/{game.inventory.capacity} - Stash {game.stash.items.length}/{game.stash.capacity}</span>
        </div>
        <nav aria-label="Town actions">
          <button type="button" onClick={onLeave}>Dungeon</button>
          {(onAutoToggle || autoActive) && <button type="button" aria-pressed={autoActive} className={autoActive ? 'is-active' : ''} disabled={!onAutoToggle} onClick={onAutoToggle}>{autoActive ? 'Stop Auto' : 'Auto'}</button>}
          <button type="button" onClick={onCharacters}>Party</button>
          <button type="button" onClick={onSaves}>Saves</button>
          {onDiagnostics && <button className="screen-icon" type="button" title="Diagnostics" aria-label="Diagnostics" onClick={onDiagnostics}><Activity size={18} aria-hidden="true" /></button>}
        </nav>
      </div>
      <AutoStatus game={game} active={autoActive} />
      <div className="town-content">
        {game.activityLog[0] && <p className="town-feedback" role="status">{game.activityLog[0]}</p>}
        <div className="town-grid">
          <section className="town-card town-inn">
            <h2>{String.fromCodePoint(0x1f6cf)} Inn</h2>
            <span>{rested ? 'The party is fully rested.' : 'Restore the party to full HP and MP.'}</span>
            <button type="button" disabled={rested} onClick={onRest}>Rest - Free</button>
          </section>
          <TownGuild game={game} onAcceptQuest={onAcceptQuest} onClaimQuest={onClaimQuest} />
          <TownVendor vendor="blacksmith" title={`${String.fromCodePoint(0x2692)} Blacksmith`} game={game} onBuy={onBuy} />
          <TownVendor vendor="alchemist" title={`${String.fromCodePoint(0x2697)} Alchemist`} game={game} onBuy={onBuy} />
          <TownStorage game={game} onSellJunk={onSellJunk} onWithdrawStash={onWithdrawStash} onStashItem={onStashItem} onToggleItemLock={onToggleItemLock} />
          {game.inventoryPolicy && onInventoryPolicyChange && <TownPolicy policy={game.inventoryPolicy} onChange={onInventoryPolicyChange} />}
        </div>
      </div>
    </main>
  );
}
