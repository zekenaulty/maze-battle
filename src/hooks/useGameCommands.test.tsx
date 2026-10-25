import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CanonicalReceipt } from '../persistence/canonical/types';
import { useGameCommands } from './useGameCommands';
import { controllerFixture, deferred } from './canonicalHooks.test-support';

afterEach(cleanup);
describe('explicit canonical commands', () => {
  it('turns off town Auto before inventory interaction and toggles the town return policy', async () => {
    const { controller, publish, receipt } = await controllerFixture(); publish(0, 'town');
    controller.view.game.townReturnMode = 'auto-play';
    controller.execute.mockImplementation(async (kind, input) => {
      if (kind === 'settings') {
        controller.view.game.townReturnMode = (input as { enabled: boolean }).enabled ? 'auto-play' : 'manual';
      }
      return receipt();
    });
    const { result } = renderHook(() => useGameCommands(controller, vi.fn()));
    await result.current.sell('herb');
    expect(controller.execute.mock.calls).toEqual([
      ['settings', { kind: 'auto', enabled: false }], ['roster', { kind: 'sell', itemId: 'herb', amount: 1 }],
    ]);
    await result.current.toggleAuto(); await result.current.toggleAuto();
    expect(controller.execute).toHaveBeenLastCalledWith('settings', { kind: 'auto', enabled: false });
  });
  it.each([undefined, 1, 7])('forwards exact sale quantity %s without a legacy reducer', async amount => {
    const { controller } = await controllerFixture(), pause = vi.fn();
    const { result } = renderHook(() => useGameCommands(controller, pause));
    await result.current.sell('herb', amount);
    expect(pause).toHaveBeenCalledOnce();
    expect(controller.execute).toHaveBeenCalledExactlyOnceWith('roster', { kind: 'sell', itemId: 'herb', amount: amount ?? 1 });
  });

  it('waits for Auto shutdown before a manual move and defaults to deliberate stairs', async () => {
    const { controller, publish, receipt } = await controllerFixture(), paused = vi.fn(), stop = deferred<CanonicalReceipt>();
    publish(0, 'auto-play');
    controller.execute.mockImplementationOnce(() => stop.promise);
    const { result } = renderHook(() => useGameCommands(controller, paused));
    const moving = result.current.move('east');
    await Promise.resolve();
    expect(paused).toHaveBeenCalledOnce();
    expect(controller.execute).toHaveBeenCalledExactlyOnceWith('settings', { kind: 'auto', enabled: false });
    publish(0, 'manual'); stop.resolve(receipt());
    await moving;
    expect(controller.execute).toHaveBeenNthCalledWith(2, 'exploration', { kind: 'move', direction: 'east', triggerStairs: true });
    await result.current.move('east', { triggerStairs: false });
    expect(controller.execute).toHaveBeenLastCalledWith('exploration', { kind: 'move', direction: 'east', triggerStairs: false });
  });

  it('serializes complete manual intents, including toggles queued behind Auto shutdown', async () => {
    const { controller, publish, receipt } = await controllerFixture(), stop = deferred<CanonicalReceipt>();
    publish(0, 'auto-play'); controller.execute.mockImplementationOnce(() => stop.promise);
    const { result, rerender } = renderHook(() => useGameCommands(controller, vi.fn()));
    const moving = result.current.move('east');
    rerender();
    const toggling = result.current.toggleAuto(), next = result.current.move('east');
    await Promise.resolve();
    expect(controller.execute).toHaveBeenCalledExactlyOnceWith('settings', { kind: 'auto', enabled: false });
    publish(0, 'manual'); stop.resolve(receipt());
    await Promise.all([moving, toggling, next]);
    expect(controller.execute.mock.calls).toEqual([
      ['settings', { kind: 'auto', enabled: false }],
      ['exploration', { kind: 'move', direction: 'east', triggerStairs: true }],
      ['settings', { kind: 'auto', enabled: true }],
      ['settings', { kind: 'auto', enabled: false }],
      ['exploration', { kind: 'move', direction: 'east', triggerStairs: true }],
    ]);
  });

  it('rejects stale queued intents and still accepts a later current action', async () => {
    const { controller, publish, receipt } = await controllerFixture(), moving = deferred<CanonicalReceipt>();
    controller.execute.mockImplementationOnce(() => moving.promise);
    const { result } = renderHook(() => useGameCommands(controller, vi.fn()));
    const first = result.current.move('east'), stale = result.current.openChest('old-floor');
    const rejected = expect(stale).rejects.toThrow('cancelled');
    await Promise.resolve(); await Promise.resolve();
    publish(1); controller.view.game.checkpoint.position.level = 2; moving.resolve(receipt());
    await first; await rejected;
    expect(controller.execute).toHaveBeenCalledTimes(1);
    await result.current.camp('healer', 'heal');
    expect(controller.execute).toHaveBeenLastCalledWith('roster', { kind: 'camp', actorId: 'healer', skillId: 'heal' });
  });

  it('refuses a queued 3D crossing if another action moved the actor within the same floor', async () => {
    const { controller, receipt } = await controllerFixture(), first = deferred<CanonicalReceipt>();
    controller.execute.mockImplementationOnce(() => first.promise);
    const { result } = renderHook(() => useGameCommands(controller, vi.fn()));
    const moving = result.current.move('east');
    const expectedPosition = structuredClone(controller.view.game.checkpoint.position);
    const stale = result.current.move('east', { triggerStairs: false, expectedPosition });
    const rejected = expect(stale).rejects.toThrow('actor has moved');
    await Promise.resolve(); await Promise.resolve();
    controller.view.game.checkpoint.position.cell.column++;
    // Caller mutation must not change the queued source witness.
    expectedPosition.cell.column++;
    first.resolve(receipt()); await moving; await rejected;
    expect(controller.execute).toHaveBeenCalledOnce();
    await result.current.move('south', { triggerStairs: false, expectedPosition: controller.view.game.checkpoint.position });
    expect(controller.execute).toHaveBeenLastCalledWith('exploration', { kind: 'move', direction: 'south', triggerStairs: false },
      { expectedPosition: expectedPosition });
  });

  it.each(['failed-stop', 'still-auto', 'custody', 'game', 'floor'])('does not submit a manual action after %s', async failure => {
    const { controller, publish, receipt } = await controllerFixture(); publish(0, 'auto-play');
    controller.execute.mockImplementationOnce(async () => {
      if (failure === 'failed-stop') throw Error('Storage failed');
      if (failure !== 'still-auto') publish(0, 'manual');
      if (failure === 'custody') controller.view.controlled = false;
      if (failure === 'game') controller.view.game.id = 'different';
      if (failure === 'floor') controller.view.game.checkpoint.position.level = 2;
      return receipt();
    });
    const { result } = renderHook(() => useGameCommands(controller, vi.fn()));
    await expect(result.current.openChest('chest')).rejects.toThrow();
    expect(controller.execute).toHaveBeenCalledTimes(1);
  });

  it('toggles from the current controller view, snapshots policies, and omits absent target fields', async () => {
    const { controller, publish } = await controllerFixture();
    const { result } = renderHook(() => useGameCommands(controller, vi.fn()));
    await result.current.toggleAuto();
    expect(controller.execute).toHaveBeenLastCalledWith('settings', { kind: 'auto', enabled: true });
    await result.current.toggleAuto();
    expect(controller.execute).toHaveBeenLastCalledWith('settings', { kind: 'auto', enabled: false });
    publish(0, 'town'); await result.current.toggleAuto();
    expect(controller.execute).toHaveBeenLastCalledWith('settings', { kind: 'auto', enabled: true });
    publish(0, 'manual');
    const patch = { autoEquip: false }, changing = result.current.policy(patch); patch.autoEquip = true;
    await changing;
    expect(controller.execute).toHaveBeenLastCalledWith('roster', { kind: 'policy', patch: { autoEquip: false } });
    await result.current.useItem('herb');
    expect(controller.execute).toHaveBeenLastCalledWith('roster', { kind: 'use', itemId: 'herb' });
    await result.current.useItem('herb', 'actor');
    expect(controller.execute).toHaveBeenLastCalledWith('roster', { kind: 'use', itemId: 'herb', actorId: 'actor' });
  });

  it('dispatches shared content, roster, camp and settings payloads', async () => {
    const { controller } = await controllerFixture(), pause = vi.fn();
    const { result } = renderHook(() => useGameCommands(controller, pause)), c = result.current;
    const cases: [() => Promise<CanonicalReceipt>, string, object][] = [
      [() => c.openChest('chest'), 'content', { kind: 'open-chest', chestId: 'chest' }],
      [() => c.acceptQuest('contract'), 'content', { kind: 'accept-quest', contractId: 'contract' }],
      [() => c.claimQuest('quest'), 'content', { kind: 'claim-quest', questId: 'quest' }],
      [() => c.camp('actor', 'heal'), 'roster', { kind: 'camp', actorId: 'actor', skillId: 'heal' }],
      [() => c.skill('actor', 'resurrect'), 'roster', { kind: 'camp', actorId: 'actor', skillId: 'resurrect' }],
      [() => c.actorAuto('actor', false), 'roster', { kind: 'actor-auto', actorId: 'actor', enabled: false }],
      [() => c.autoSpend('actor', true), 'roster', { kind: 'auto-spend', actorId: 'actor', enabled: true }],
      [() => c.spend('actor', 'vitality'), 'roster', { kind: 'spend-attribute', actorId: 'actor', attribute: 'vitality' }],
      [() => c.equip('actor', 'item'), 'roster', { kind: 'equip', actorId: 'actor', itemId: 'item' }],
      [() => c.unequip('actor', 'body'), 'roster', { kind: 'unequip', actorId: 'actor', slot: 'body' }],
      [() => c.buy('alchemist', 'herb'), 'roster', { kind: 'buy', vendor: 'alchemist', baseId: 'herb' }],
      [() => c.stash('item'), 'roster', { kind: 'stash', itemId: 'item' }],
      [() => c.withdraw('item'), 'roster', { kind: 'withdraw', itemId: 'item' }],
      [() => c.lock('item'), 'roster', { kind: 'lock', itemId: 'item' }],
      [c.portal, 'roster', { kind: 'portal' }], [c.leaveTown, 'roster', { kind: 'leave-town' }],
      [c.rest, 'roster', { kind: 'rest' }], [c.autoEquip, 'roster', { kind: 'auto-equip' }], [c.sellJunk, 'roster', { kind: 'sell-junk' }],
      [() => c.throttle(400), 'settings', { kind: 'throttle', ms: 400 }],
      [() => c.stairs('down'), 'exploration', { kind: 'stairs', direction: 'down' }], [c.look, 'exploration', { kind: 'look' }],
    ];
    for (const [run, kind, input] of cases) { await run(); expect(controller.execute).toHaveBeenLastCalledWith(kind, input); }
    expect(pause).toHaveBeenCalledTimes(cases.length);
    controller.execute.mockClear();
    await expect(c.skill('actor', 'teleport')).rejects.toThrow('outside combat');
    await expect(c.skill('actor', 'slash')).rejects.toThrow('outside combat');
    expect(controller.execute).not.toHaveBeenCalled();
    await expect(c.round()).rejects.toThrow('No current battle');
    await expect(c.closeBattle()).rejects.toThrow('No current battle');
    expect(controller.execute).not.toHaveBeenCalled();
    await c.encounters(true);
    expect(controller.execute).toHaveBeenLastCalledWith('settings', { kind: 'encounters', enabled: true });
  });
});
