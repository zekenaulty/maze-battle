import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useInn } from '../../domain/town/town';
import { itemFixture } from '../../viewModels/characterTestFixtures';
import { TownInn } from './TownInn';
import { townViewFixture } from './townViewFixture';

afterEach(cleanup);
describe('bounded inn projection', () => {
  it('uses equipment-adjusted caps, restores dead members, and disables a fully rested party', () => {
    const game = townViewFixture(), onRest = vi.fn();
    const armor = itemFixture({ id: 'armor', slot: 'body', stats: { maxHp: 20, vitality: 5, maxMp: 10, intellect: 2 } });
    game.inventory.items.push(armor);
    game.party[0].equipment.body = armor.id;
    game.party[1].hp = 0;
    const before = structuredClone(game);
    const { rerender } = render(<TownInn game={game} onRest={onRest} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rest - Free' }));
    expect(onRest).toHaveBeenCalledOnce();
    expect(game).toEqual(before);
    const rested = useInn(game);
    expect(rested.party[0].hp).toBe(game.party[0].maxHp + 30);
    expect(rested.party[0].mp).toBe(game.party[0].maxMp + 14);
    expect(rested.party[1].hp).toBe(game.party[1].maxHp);
    rerender(<TownInn game={rested} onRest={onRest} />);
    expect(screen.getByRole('button', { name: 'Rest - Free' })).toBeDisabled();
  });
});
