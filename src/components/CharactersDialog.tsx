import { useRef, useState } from 'react';
import type { ActorState, EquipmentSlot, InventoryPolicy, InventoryState, SkillId } from '../domain/types';
import type { SpendableAttribute } from '../viewModels/characterSheet';
import { Dialog } from './Dialog';
import { CharacterNavigation, SheetNavigation, type SheetView } from './characters/CharacterNavigation';
import { CharacterSummary } from './characters/CharacterSummary';
import { CharacterStats } from './characters/CharacterStats';
import { CharacterEquipment } from './characters/CharacterEquipment';
import { CharacterSkills } from './characters/CharacterSkills';
import { InventoryPanel } from './characters/InventoryPanel';
import { useCharacterDialogFocus } from './characters/useCharacterDialogFocus';
import './characters/characters.css';

export interface CharactersDialogProps {
  party: ActorState[];
  inventory: InventoryState;
  onAutoBattleChange: (actorId: string, enabled: boolean) => void;
  onEquipItem: (actorId: string, itemId: string) => void;
  onUnequipItem: (actorId: string, slot: EquipmentSlot) => void;
  onUseItem: (itemId: string, actorId?: string) => void;
  onAutoEquip: () => void;
  onSellItem?: (itemId: string) => void;
  onStashItem?: (itemId: string) => void;
  canSellItems?: boolean;
  canStashItems?: boolean;
  canUseTownPortal?: boolean;
  inventoryPolicy?: InventoryPolicy;
  onInventoryPolicyChange?: (patch: Partial<InventoryPolicy>) => void;
  onToggleItemLock?: (itemId: string) => void;
  onSpendAttribute?: (actorId: string, attribute: SpendableAttribute) => void;
  onAutoSpendChange?: (actorId: string, enabled: boolean) => void;
  onCastSkill?: (actorId: string, skillId: SkillId) => void;
  allowOutOfCombatSkills?: boolean;
  allowTeleport?: boolean;
  now?: number;
  onClose: () => void;
}

export function CharactersDialog(props: CharactersDialogProps) {
  const { party, inventory, onClose } = props;
  const [selectedActorId, setSelectedActorId] = useState(() => party[0]?.id);
  const [view, setView] = useState<SheetView>('Stats');
  const [slotFilter, setSlotFilter] = useState<EquipmentSlot | 'all'>('all');
  const root = useRef<HTMLDivElement>(null);
  useCharacterDialogFocus(root);
  const actor = party.find((candidate) => candidate.id === selectedActorId) ?? party[0];

  return (
    <Dialog title="Characters" onClose={onClose}>
      <div className="character-sheet" ref={root}>
        {actor ? <>
          <CharacterNavigation party={party} selectedId={actor.id} onSelect={setSelectedActorId} />
          <article className="character-card is-selected">
            <CharacterSummary actor={actor} inventory={inventory} onAutoBattleChange={props.onAutoBattleChange} />
            <SheetNavigation view={view} onChange={setView} />
            <section id="character-stats" role="tabpanel" aria-labelledby="character-tab-Stats" hidden={view !== 'Stats'} tabIndex={0}>
              <CharacterStats actor={actor} inventory={inventory} onSpendAttribute={props.onSpendAttribute} onAutoSpendChange={props.onAutoSpendChange} />
            </section>
            <section id="character-equipment" role="tabpanel" aria-labelledby="character-tab-Equipment" hidden={view !== 'Equipment'} tabIndex={0}>
              <CharacterEquipment actor={actor} inventory={inventory} onUnequipItem={props.onUnequipItem} onBrowse={(slot) => {
                setSlotFilter(slot);
                setView('Inventory');
                root.current?.querySelector<HTMLButtonElement>('#character-tab-Inventory')?.focus();
              }} />
            </section>
            <section id="character-skills" role="tabpanel" aria-labelledby="character-tab-Skills" hidden={view !== 'Skills'} tabIndex={0}>
              {view === 'Skills' && <CharacterSkills actor={actor} party={party} inventory={inventory} onCastSkill={props.onCastSkill} allowOutOfCombatSkills={props.allowOutOfCombatSkills} allowTeleport={props.allowTeleport} now={props.now} />}
            </section>
            <section id="character-inventory" role="tabpanel" aria-labelledby="character-tab-Inventory" hidden={view !== 'Inventory'} tabIndex={0}>
              <InventoryPanel {...props} selectedActor={actor} slotFilter={slotFilter} onSlotFilterChange={setSlotFilter} />
            </section>
          </article>
        </> : <p className="empty-state">No characters in this party.</p>}
      </div>
    </Dialog>
  );
}
