import { useState } from 'react';
import type { ActorState, EquipmentSlot, InventoryState, ItemInstance } from '../domain/types';
import { xpForNextLevel } from '../domain/combat/rewards';
import { SKILLS } from '../domain/combat/skillCatalog';
import { getEffectiveActor, getSellValue } from '../domain/items/inventory';
import { itemSummary } from '../domain/items/catalog';
import { getActorGearScore, getItemGearScore } from '../domain/items/gearScore';
import { getItemTooltip } from '../domain/items/itemDetails';
import { Dialog } from './Dialog';
import { ItemDetails } from './ItemDetails';

interface CharactersDialogProps {
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
  onClose: () => void;
}

const EQUIPMENT_SLOTS: EquipmentSlot[] = ['weapon', 'offhand', 'head', 'body', 'hands', 'feet', 'ring', 'amulet'];

export function CharactersDialog({ party, inventory, onAutoBattleChange, onEquipItem, onUnequipItem, onUseItem, onAutoEquip, onSellItem, onStashItem, canSellItems = false, canStashItems = false, onClose }: CharactersDialogProps) {
  const [selectedActorId, setSelectedActorId] = useState(() => party[0]?.id);
  const selectedActor = party.find((actor) => actor.id === selectedActorId) ?? party[0];

  return (
    <Dialog title="Characters" onClose={onClose}>
      <div className="character-grid">
        {party.map((actor) => (
          <CharacterCard
            key={actor.id}
            actor={actor}
            inventory={inventory}
            selected={actor.id === selectedActor.id}
            onSelect={() => setSelectedActorId(actor.id)}
            onAutoBattleChange={onAutoBattleChange}
            onUnequipItem={onUnequipItem}
          />
        ))}
      </div>
      <InventoryPanel
        party={party}
        inventory={inventory}
        selectedActor={selectedActor}
        onEquipItem={onEquipItem}
        onUseItem={onUseItem}
        onAutoEquip={onAutoEquip}
        onSellItem={onSellItem}
        onStashItem={onStashItem}
        canSellItems={canSellItems}
        canStashItems={canStashItems}
      />
    </Dialog>
  );
}

function CharacterCard({
  actor,
  inventory,
  selected,
  onSelect,
  onAutoBattleChange,
  onUnequipItem,
}: {
  actor: ActorState;
  inventory: InventoryState;
  selected: boolean;
  onSelect: () => void;
  onAutoBattleChange: (actorId: string, enabled: boolean) => void;
  onUnequipItem: (actorId: string, slot: EquipmentSlot) => void;
}) {
  const effective = getEffectiveActor(actor, inventory);
  const gearScore = getActorGearScore(actor, inventory.items);

  return (
    <article className={`character-card ${selected ? 'is-selected' : ''}`}>
      <header>
        <div className="character-card-title">
          <h3>{actor.displayName}</h3>
          <span>{actor.role}</span>
        </div>
        <div className="character-card-actions">
          <label className="compact-toggle auto-toggle">
            <input type="checkbox" checked={actor.autoBattle} onChange={(event) => onAutoBattleChange(actor.id, event.currentTarget.checked)} />
            <span>Auto</span>
          </label>
          <button type="button" onClick={onSelect}>
            View
          </button>
        </div>
      </header>
      <dl>
        <div>
          <dt>Level</dt>
          <dd>{actor.level}</dd>
        </div>
        <div>
          <dt>XP</dt>
          <dd>
            {actor.xp}/{xpForNextLevel(actor.level)}
          </dd>
        </div>
        <div>
          <dt>HP</dt>
          <dd>
            {effective.hp}/{effective.maxHp}
          </dd>
        </div>
        <div>
          <dt>MP</dt>
          <dd>
            {effective.mp}/{effective.maxMp}
          </dd>
        </div>
        <div>
          <dt>Strength</dt>
          <dd>{effective.attributes.strength}</dd>
        </div>
        <div>
          <dt>Vitality</dt>
          <dd>{effective.attributes.vitality}</dd>
        </div>
        <div>
          <dt>Intellect</dt>
          <dd>{effective.attributes.intellect}</dd>
        </div>
        <div>
          <dt>Gear</dt>
          <dd>{gearScore}</dd>
        </div>
        <div>
          <dt>Damage</dt>
          <dd>{effective.combat.baseDamage}</dd>
        </div>
      </dl>
      <EquipmentSlots actor={actor} inventory={inventory} onUnequipItem={onUnequipItem} />
      <div className="skill-list">
        {(actor.skills ?? []).map((skill) => (
          <span key={skill.id}>
            {SKILLS[skill.id].name}
            {skill.charges !== undefined ? ` (${skill.charges}/${skill.maxCharges})` : ''}
          </span>
        ))}
      </div>
    </article>
  );
}

function EquipmentSlots({ actor, inventory, onUnequipItem }: { actor: ActorState; inventory: InventoryState; onUnequipItem: (actorId: string, slot: EquipmentSlot) => void }) {
  return (
    <div className="equipment-grid">
      {EQUIPMENT_SLOTS.map((slot) => {
        const item = inventory.items.find((candidate) => candidate.id === actor.equipment[slot]);
        return (
          <div className="equipment-slot" key={slot}>
            <span>{slot}</span>
            {item ? (
              <button className="equipment-item-button" type="button" title={getItemTooltip(item, `Equipped by ${actor.displayName} - ${slot}`)} onClick={() => onUnequipItem(actor.id, slot)}>
                <span className="item-name">{itemSummary(item)}</span>
                <ItemDetails item={item} compact />
              </button>
            ) : (
              <em>empty</em>
            )}
          </div>
        );
      })}
    </div>
  );
}

function InventoryPanel({
  party,
  inventory,
  selectedActor,
  onEquipItem,
  onUseItem,
  onAutoEquip,
  onSellItem,
  onStashItem,
  canSellItems,
  canStashItems,
}: {
  party: ActorState[];
  inventory: InventoryState;
  selectedActor: ActorState;
  onEquipItem: (actorId: string, itemId: string) => void;
  onUseItem: (itemId: string, actorId?: string) => void;
  onAutoEquip: () => void;
  onSellItem?: (itemId: string) => void;
  onStashItem?: (itemId: string) => void;
  canSellItems: boolean;
  canStashItems: boolean;
}) {
  return (
    <section className="inventory-panel">
      <header>
        <h3>Inventory</h3>
        <span>
          Gold {inventory.gold} - Pack {inventory.items.length}/{inventory.capacity} - Target {selectedActor.displayName}
        </span>
        <button type="button" onClick={onAutoEquip}>
          Auto Equip
        </button>
      </header>
      <div className="inventory-list">
        {inventory.items.map((item) => {
          const equipped = getEquippedItemOwner(item.id, party);
          return (
            <InventoryItem
              key={item.id}
              item={item}
              equipped={equipped}
              selectedActor={selectedActor}
              onEquipItem={onEquipItem}
              onUseItem={onUseItem}
              onSellItem={onSellItem}
              onStashItem={onStashItem}
              canSellItems={canSellItems}
              canStashItems={canStashItems}
            />
          );
        })}
        {inventory.items.length === 0 ? <p className="empty-state">The pack is empty.</p> : null}
      </div>
    </section>
  );
}

function InventoryItem({
  item,
  equipped,
  selectedActor,
  onEquipItem,
  onUseItem,
  onSellItem,
  onStashItem,
  canSellItems,
  canStashItems,
}: {
  item: ItemInstance;
  equipped?: EquippedItemOwner;
  selectedActor: ActorState;
  onEquipItem: (actorId: string, itemId: string) => void;
  onUseItem: (itemId: string, actorId?: string) => void;
  onSellItem?: (itemId: string) => void;
  onStashItem?: (itemId: string) => void;
  canSellItems: boolean;
  canStashItems: boolean;
}) {
  const equippedLabel = equipped ? `Equipped: ${equipped.actor.displayName} - ${equipped.slot}` : undefined;
  const equippedBySelectedActor = equipped?.actor.id === selectedActor.id;
  const canEquip = Boolean(item.slot);
  const gearScore = getItemGearScore(item, selectedActor);
  const quantity = item.quantity ?? 1;

  return (
    <article className={`inventory-item rarity-${item.rarity} ${equipped ? 'is-equipped' : ''}`} title={getItemTooltip(item, equippedLabel)}>
      <div>
        <div className="inventory-item-title">
          <strong>{itemSummary(item)}</strong>
          {equipped ? <b className="item-equipped-badge">{equippedLabel}</b> : null}
        </div>
        <span className="item-meta">
          {gearScore > 0 ? `GS ${gearScore} - ` : ''}
          Lv {item.itemLevel} - {item.slot ?? item.consumableEffect ?? item.category} - {item.value}g{quantity > 1 ? ` - Stack ${quantity}` : ''}
        </span>
        <ItemDetails item={item} />
      </div>
      <div className="inventory-actions">
        {canEquip ? (
          <button type="button" disabled={equippedBySelectedActor} onClick={() => onEquipItem(selectedActor.id, item.id)}>
            {equippedBySelectedActor ? 'Equipped' : equipped ? 'Move' : 'Equip'}
          </button>
        ) : null}
        {item.consumableEffect ? (
          <button type="button" onClick={() => onUseItem(item.id, selectedActor.id)}>
            Use
          </button>
        ) : null}
        {canSellItems && onSellItem ? (
          <button type="button" onClick={() => onSellItem(item.id)}>
            Sell {getSellValue(item)}g
          </button>
        ) : null}
        {canStashItems && onStashItem && !equipped ? (
          <button type="button" onClick={() => onStashItem(item.id)}>
            Stash
          </button>
        ) : null}
      </div>
    </article>
  );
}

interface EquippedItemOwner {
  actor: ActorState;
  slot: EquipmentSlot;
}

function getEquippedItemOwner(itemId: string, party: ActorState[]): EquippedItemOwner | undefined {
  for (const actor of party) {
    const slot = Object.entries(actor.equipment).find(([, equippedItemId]) => equippedItemId === itemId)?.[0] as EquipmentSlot | undefined;

    if (slot) {
      return { actor, slot };
    }
  }

  return undefined;
}
