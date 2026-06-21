import type { GameState, VendorId } from '../domain/types';
import { vendorStock } from '../domain/town/town';

interface TownScreenProps {
  game: GameState;
  onLeave: () => void;
  onRest: () => void;
  onBuy: (vendor: VendorId, baseId: string) => void;
  onCharacters: () => void;
  onSaves: () => void;
}

export function TownScreen({ game, onLeave, onRest, onBuy, onCharacters, onSaves }: TownScreenProps) {
  return (
    <main className="game-screen town-screen">
      <div className="screen-bar">
        <div>
          <h1>Town</h1>
          <span className="screen-status">
            Floor {game.dungeonLevel} - Gold {game.inventory.gold} - Pack {game.inventory.items.length}/{game.inventory.capacity}
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
          <strong>🛏️ Inn</strong>
          <span>Rest and recover HP/MP.</span>
          <button type="button" onClick={onRest}>
            Rest
          </button>
        </article>
        <VendorCard vendor="blacksmith" title="⚒️ Blacksmith" game={game} onBuy={onBuy} />
        <VendorCard vendor="alchemist" title="⚗️ Alchemist" game={game} onBuy={onBuy} />
        <article className="town-card">
          <strong>🏰 Guild Hall</strong>
          <span>Contracts, titles, and roster work will live here.</span>
          <button type="button" onClick={onCharacters}>
            Party
          </button>
        </article>
      </section>
    </main>
  );
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
