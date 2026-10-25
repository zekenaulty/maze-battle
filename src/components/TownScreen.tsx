import { useId, useState, type ReactNode } from 'react';
import { Activity, BedSingle, Castle, FlaskConical, Hammer, Settings2, Warehouse } from 'lucide-react';
import type { InventoryPolicy, VendorId } from '../domain/types';
import type { RosterState } from '../domain/party/roster';
import type { GameView } from '../services/game/GameView';
import { normalizeInventoryPolicy, packSlotUsage } from '../domain/items/inventory';
import { AutoStatus, type AutoStatusDetail } from './screens/AutoStatus';
import { TownGuild } from './screens/TownGuild';
import { TownStorage } from './screens/TownStorage';
import { TownVendor } from './screens/TownVendor';
import { TownPolicy } from './screens/TownPolicy';
import { TownInn } from './screens/TownInn';
import { ScreenTabs } from './screens/ScreenTabs';
import './screens/screens.css';
import './screens/town.css';

const TABS = [
  { id: 'guild', label: 'Guild', icon: Castle },
  { id: 'blacksmith', label: 'Blacksmith', icon: Hammer },
  { id: 'alchemist', label: 'Alchemist', icon: FlaskConical },
  { id: 'storage', label: 'Storage', icon: Warehouse },
  { id: 'inn', label: 'Inn', icon: BedSingle },
  { id: 'care', label: 'Auto Care', icon: Settings2 },
] as const;
type TownTab = typeof TABS[number]['id'];

export type TownView = Pick<GameView, keyof RosterState | 'quests' | 'contracts'> & Partial<Pick<GameView, 'snapshot'>>;

interface TownScreenProps {
  game: TownView;
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
  autoStatus?: AutoStatusDetail;
  onAutoToggle?: () => void;
  onStashItem?: (itemId: string) => void;
  onToggleItemLock?: (itemId: string) => void;
  onInventoryPolicyChange?: (policy: InventoryPolicy) => void;
  onDiagnostics?: () => void;
}

export function TownScreen({ game, onLeave, onRest, onBuy, onAcceptQuest, onClaimQuest, onSellJunk, onWithdrawStash, onCharacters, onSaves,
  autoActive = game.townReturnMode === 'auto-play', autoStatus, onAutoToggle, onStashItem, onToggleItemLock, onInventoryPolicyChange, onDiagnostics }: TownScreenProps) {
  const [selected, setSelected] = useState<TownTab>('guild');
  const id = useId();
  const tabs = TABS.filter(tab => tab.id !== 'care' || onInventoryPolicyChange);
  const active = tabs.some(tab => tab.id === selected) ? selected : 'guild';
  const panels: Record<TownTab, ReactNode> = {
    guild: <TownGuild game={game} active={active === 'guild'} onAcceptQuest={onAcceptQuest} onClaimQuest={onClaimQuest} />,
    blacksmith: <TownVendor vendor="blacksmith" title={`${String.fromCodePoint(0x2692)} Blacksmith`} game={game} onBuy={onBuy} />,
    alchemist: <TownVendor vendor="alchemist" title={`${String.fromCodePoint(0x2697)} Alchemist`} game={game} onBuy={onBuy} />,
    storage: <TownStorage game={game} onSellJunk={onSellJunk} onWithdrawStash={onWithdrawStash} onStashItem={onStashItem} onToggleItemLock={onToggleItemLock} />,
    inn: <TownInn game={game} onRest={onRest} />,
    care: onInventoryPolicyChange ? <TownPolicy policy={normalizeInventoryPolicy(game.inventoryPolicy)} onChange={onInventoryPolicyChange} /> : null,
  };
  return (
    <main className="game-screen town-screen refined-screen">
      <div className="screen-bar">
        <div>
          <h1>Town</h1>
          <span className="screen-status">Floor {game.dungeonLevel} - Gold {game.inventory.gold} - Pack {packSlotUsage(game)}/{game.inventory.capacity} - Stash {game.stash.items.length}/{game.stash.capacity}</span>
        </div>
        <nav aria-label="Town actions">
          <button type="button" onClick={onLeave}>Dungeon</button>
          {(onAutoToggle || autoActive) && <button type="button" aria-pressed={autoActive} className={autoActive ? 'is-active' : ''} disabled={!onAutoToggle} onClick={onAutoToggle}>{autoActive ? 'Stop Auto' : 'Auto'}</button>}
          <button type="button" onClick={onCharacters}>Party</button>
          <button type="button" onClick={onSaves}>Saves</button>
          {onDiagnostics && <button className="screen-icon" type="button" title="Diagnostics" aria-label="Diagnostics" onClick={onDiagnostics}><Activity size={18} aria-hidden="true" /></button>}
        </nav>
      </div>
      <AutoStatus game={game} active={autoActive} status={autoStatus} />
      <div className="town-navigation">
        <ScreenTabs id={id} label="Town services" tabs={tabs} selected={active} onSelect={setSelected} />
        {game.activityLog[0] && <p className="town-feedback" role="status" title={game.activityLog[0]}>{game.activityLog[0]}</p>}
      </div>
      <div className="town-content">
        {tabs.map(tab => <section className="town-panel" key={tab.id} role="tabpanel" tabIndex={0}
          id={`${id}-panel-${tab.id}`} aria-labelledby={`${id}-tab-${tab.id}`} hidden={active !== tab.id}>
          {panels[tab.id]}
        </section>)}
      </div>
    </main>
  );
}
