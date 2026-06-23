import type { GameState, VendorId } from '../domain/types';
import { guildContractsForFloor, type GuildContract } from '../domain/guild/contracts';
import { itemSummary } from '../domain/items/catalog';
import { junkItemsForSale } from '../domain/items/inventory';
import { vendorStock } from '../domain/town/town';

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
}

const BUILDING_TOKENS = {
  inn: String.fromCodePoint(0x1f6cf),
  blacksmith: String.fromCodePoint(0x2692),
  alchemist: String.fromCodePoint(0x2697),
  guild: String.fromCodePoint(0x1f3f0),
};

export function TownScreen({ game, onLeave, onRest, onBuy, onAcceptQuest, onClaimQuest, onSellJunk, onWithdrawStash, onCharacters, onSaves }: TownScreenProps) {
  const contracts = guildContractsForFloor(game);

  return (
    <main className="game-screen town-screen">
      <div className="screen-bar">
        <div>
          <h1>Town</h1>
          <span className="screen-status">
            Floor {game.dungeonLevel} - Gold {game.inventory.gold} - Pack {game.inventory.items.length}/{game.inventory.capacity} - Stash {game.stash.items.length}/{game.stash.capacity}
          </span>
        </div>
        <nav aria-label="Town actions">
          <button type="button" onClick={onLeave}>
            Dungeon
          </button>
          <button type="button" onClick={onCharacters}>
            Party
          </button>
          <button type="button" onClick={onSaves}>
            Saves
          </button>
        </nav>
      </div>
      <section className="town-grid">
        <article className="town-card">
          <strong>{BUILDING_TOKENS.inn} Inn</strong>
          <span>Rest and recover HP/MP.</span>
          <button type="button" onClick={onRest}>
            Rest
          </button>
        </article>
        <VendorCard vendor="blacksmith" title={`${BUILDING_TOKENS.blacksmith} Blacksmith`} game={game} onBuy={onBuy} />
        <VendorCard vendor="alchemist" title={`${BUILDING_TOKENS.alchemist} Alchemist`} game={game} onBuy={onBuy} />
        <GuildCard game={game} contracts={contracts} onAcceptQuest={onAcceptQuest} onClaimQuest={onClaimQuest} onSellJunk={onSellJunk} onWithdrawStash={onWithdrawStash} />
      </section>
    </main>
  );
}

function GuildCard({
  game,
  contracts,
  onAcceptQuest,
  onClaimQuest,
  onSellJunk,
  onWithdrawStash,
}: {
  game: GameState;
  contracts: GuildContract[];
  onAcceptQuest: (contractId: string) => void;
  onClaimQuest: (questId: string) => void;
  onSellJunk: () => void;
  onWithdrawStash: (itemId: string) => void;
}) {
  const junkItems = junkItemsForSale(game);

  return (
    <article className="town-card guild-card">
      <strong>{BUILDING_TOKENS.guild} Guild Hall</strong>
      <span>Room contracts posted from the current dungeon floor.</span>
      <div className="guild-actions">
        <button type="button" disabled={junkItems.length === 0} onClick={onSellJunk}>
          Sell Junk ({junkItems.length})
        </button>
      </div>
      {contracts.length > 0 ? (
        <div className="guild-contract-list">
          {contracts.map((contract) => {
            const quest = game.quests.find((item) => item.id === contract.id);
            const status = quest?.status ?? contract.status;
            return (
              <div key={contract.id} className={`guild-contract is-${status}`}>
                <div>
                  <strong>{contract.title}</strong>
                  <span>{contract.description}</span>
                </div>
                <small>
                  {statusLabel(status)} - {contract.rewardGold}g
                </small>
                <QuestButton contract={contract} quest={quest} onAcceptQuest={onAcceptQuest} onClaimQuest={onClaimQuest} />
              </div>
            );
          })}
        </div>
      ) : (
        <span className="empty-state">No room contracts are posted for this floor yet.</span>
      )}
      <StashList game={game} onWithdrawStash={onWithdrawStash} />
    </article>
  );
}

function StashList({ game, onWithdrawStash }: { game: GameState; onWithdrawStash: (itemId: string) => void }) {
  return (
    <section className="guild-stash">
      <strong>Stash {game.stash.items.length}/{game.stash.capacity}</strong>
      {game.stash.items.length > 0 ? (
        <div className="stash-list">
          {game.stash.items.slice(0, 8).map((item) => (
            <button key={item.id} type="button" onClick={() => onWithdrawStash(item.id)} title={itemSummary(item)}>
              <span>{item.token}</span>
              <span>{item.displayName}{(item.quantity ?? 1) > 1 ? ` x${item.quantity}` : ''}</span>
            </button>
          ))}
        </div>
      ) : (
        <span className="empty-state">No items stored.</span>
      )}
    </section>
  );
}

function QuestButton({
  contract,
  quest,
  onAcceptQuest,
  onClaimQuest,
}: {
  contract: GuildContract;
  quest: GameState['quests'][number] | undefined;
  onAcceptQuest: (contractId: string) => void;
  onClaimQuest: (questId: string) => void;
}) {
  if (!quest) {
    return (
      <button type="button" onClick={() => onAcceptQuest(contract.id)}>
        Accept
      </button>
    );
  }

  if (quest.status === 'complete') {
    return (
      <button type="button" onClick={() => onClaimQuest(quest.id)}>
        Claim
      </button>
    );
  }

  return (
    <button type="button" disabled>
      {quest.status === 'claimed' ? 'Claimed' : `${quest.task.progress}/${quest.task.required}`}
    </button>
  );
}

function statusLabel(status: GuildContract['status'] | GameState['quests'][number]['status']) {
  switch (status) {
    case 'nearby':
      return 'Nearby';
    case 'located':
      return 'Located';
    case 'posted':
      return 'Posted';
    case 'active':
      return 'Active';
    case 'complete':
      return 'Complete';
    case 'claimed':
      return 'Claimed';
  }
}

function VendorCard({ vendor, title, game, onBuy }: { vendor: VendorId; title: string; game: GameState; onBuy: (vendor: VendorId, baseId: string) => void }) {
  const packFull = game.inventory.items.length >= game.inventory.capacity;

  return (
    <article className="town-card vendor-card">
      <strong>{title}</strong>
      <div className="vendor-list">
        {vendorStock(vendor, game.dungeonLevel).map((item) => (
          <button key={item.id} type="button" disabled={packFull || game.inventory.gold < item.value} onClick={() => onBuy(vendor, item.id)}>
            <span>{item.token}</span>
            <span>{item.displayName}</span>
            <small>{item.value}g</small>
          </button>
        ))}
      </div>
    </article>
  );
}
