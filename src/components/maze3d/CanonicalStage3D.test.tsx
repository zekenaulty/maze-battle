import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameView } from '../../services/game/GameView';
import type { StageWalker } from './movement';
import { addressKey } from './scene';
import { stageFixture } from './stage.test-support';
import CanonicalStage3D from './CanonicalStage3D';
import { spatialBinding } from '../../services/game/SpatialView';

interface RendererDouble {
  canvas: HTMLCanvasElement;
  walker: StageWalker;
  fail: (message: string) => void;
  dispose: ReturnType<typeof vi.fn>;
}
const doubles = vi.hoisted(() => ({ renderers: [] as RendererDouble[] }));

vi.mock('../../assets3d/registry', () => ({
  AssetRegistry: class {}, loadAssetRegistry: vi.fn(async () => ({})),
}));
vi.mock('../../assets3d/humanoid/contract', () => ({
  loadSkinCatalog: vi.fn(async () => { throw new Error('No optional skins in input fixture'); }),
}));
// Keep the real disclosed-scene compiler and movement reconciler. Only GPU work is replaced.
vi.mock('./StageRenderer', async () => {
  const { StageWalker } = await import('./movement');
  const { compileStageScene } = await import('./scene');
  return { StageRenderer: class {
    canvas = document.createElement('canvas');
    walker: StageWalker;
    yaw = 0;
    fail: (message: string) => void;
    constructor(host: HTMLElement, _registry: unknown, game: GameView, fail: (message: string) => void) {
      this.walker = new StageWalker(compileStageScene(game)!); this.fail = fail;
      this.canvas.setAttribute('aria-label', 'Explorable 3D dungeon'); host.append(this.canvas);
      doubles.renderers.push(this);
    }
    update(game: GameView) {
      const next = compileStageScene(game, this.walker.scene.origin, this.walker.scene.originFrame);
      if (next) this.walker.update(next);
    }
    render() {
      this.canvas.dataset.actor = this.walker.scene.actor.key;
      this.canvas.dataset.pose = JSON.stringify(this.walker.position);
    }
    look = vi.fn();
    setPlayer = vi.fn(async () => {});
    chooseSkin = vi.fn(async () => {});
    setThirdPerson = vi.fn();
    setArchitecture = vi.fn();
    dispose = vi.fn(() => this.canvas.remove());
  } };
});

let callbacks: Map<number, FrameRequestCallback>, nextFrame: number, time: number;
let hidden: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  callbacks = new Map(); nextFrame = 0; time = 1000; doubles.renderers.length = 0;
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { callbacks.set(++nextFrame, callback); return nextFrame; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => callbacks.delete(id)));
  hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
});
afterEach(() => { cleanup(); document.querySelectorAll('dialog, input').forEach(node => node.remove()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function frames(count = 1) {
  for (let i = 0; i < count; i++) await act(async () => {
    time += 50; const ready = [...callbacks.values()]; callbacks.clear(); ready.forEach(callback => callback(time));
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve };
}
async function setup() {
  const fixture = await stageFixture();
  const onMove = vi.fn<(direction: string) => Promise<GameView | undefined>>(async () => structuredClone(fixture.game));
  const onReturn = vi.fn();
  const props = { game: structuredClone(fixture.game), disabled: false, onMove, onReturn };
  const mounted = render(<CanonicalStage3D {...props} />);
  await act(async () => {});
  expect(doubles.renderers).toHaveLength(1);
  return { ...fixture, ...mounted, props, onMove, onReturn, renderer: doubles.renderers[0] };
}

describe('canonical 3D input and lifetime', () => {
  it('retains pending command custody after Escape and refuses to strand a second crossing', async () => {
    const f = await setup(), game = structuredClone(f.props.game), source = game.checkpoint.position;
    const target = { level: 2, cell: { spaceId: 'entry', row: 4, column: 4 } };
    game.spatial = { version: 'connector-sight-v1', binding: spatialBinding(game.snapshot), frame: [0, 0, 0], prepareDown: false,
      connector: { id: 'fixture/stairs/1', upper: source, lower: target,
        upperPoint: { row: 0, column: 0 }, lowerPoint: { row: 4, column: 4 }, targetFrame: [-12.8, -4.68, -22.16],
        placement: { version: 'straight-stair-placement-v1', recipe: 'straight-stair-v1', upperFrame: [0, 0, 0], lowerFrame: [-12.8, -4.68, -22.16] },
        cells: [{ at: target, world: { row: 4, column: 4 }, edges: {}, chests: [], stairs: [] }] } };
    const pending = deferred<GameView | undefined>(), onWalkStairs = vi.fn(() => pending.promise), onFlightChange = vi.fn();
    f.rerender(<CanonicalStage3D {...f.props} game={game} onWalkStairs={onWalkStairs} onFlightChange={onFlightChange} />);
    await act(async () => {}); const renderer = doubles.renderers.at(-1)!;
    fireEvent.keyDown(window, { key: 'w' }); await frames(40);
    expect(onWalkStairs).toHaveBeenCalledOnce(); expect(renderer.walker.stairs?.pending).toBeDefined();
    fireEvent.keyDown(window, { key: 'Escape' }); await frames(1);
    expect(renderer.walker.stairs).toBeUndefined(); expect(onFlightChange).toHaveBeenLastCalledWith(true);
    fireEvent.keyUp(window, { key: 'w' }); fireEvent.keyDown(window, { key: 'w' }); await frames(80);
    expect(onWalkStairs).toHaveBeenCalledOnce(); expect(renderer.walker.stairs).toBeUndefined();
    await act(async () => pending.resolve(game)); fireEvent.keyUp(window, { key: 'w' }); await frames(1);
    expect(onFlightChange).toHaveBeenLastCalledWith(false); expect(renderer.walker.stairs).toBeUndefined();
  });
  it('consumes WASD before legacy movement and ignores editable and modified shortcuts', async () => {
    const { onMove } = await setup();
    const legacyMove = vi.fn(), legacy = vi.fn((event: KeyboardEvent) => { if (!event.defaultPrevented) legacyMove(); });
    window.addEventListener('keydown', legacy);
    try {
      fireEvent.keyDown(window, { key: 'd' });
      expect(legacy).toHaveBeenCalledOnce();
      expect(legacy.mock.calls[0][0].defaultPrevented).toBe(true);
      expect(legacyMove).not.toHaveBeenCalled();
      await frames(16);
      expect(onMove).toHaveBeenCalledExactlyOnceWith('east', expect.objectContaining({ level: 1, cell: expect.objectContaining({ spaceId: 'library', row: 0, column: 0 }) }));
      fireEvent.keyUp(window, { key: 'd' }); onMove.mockClear();
      const input = document.createElement('input'); document.body.append(input);
      // Native editing and shortcuts must not become held movement keys.
      fireEvent.keyDown(input, { key: 'd' }); fireEvent.keyDown(window, { key: 'd', ctrlKey: true });
      fireEvent.keyDown(window, { key: 'd', altKey: true }); fireEvent.keyDown(window, { key: 'd', metaKey: true });
      await frames(16);
      expect(legacyMove).toHaveBeenCalledTimes(4); expect(onMove).not.toHaveBeenCalled();
    } finally { window.removeEventListener('keydown', legacy); }
  });

  it('admits one crossing while movement is pending, then adopts the committed actor', async () => {
    const { onMove, renderer, setActor, cells } = await setup(), movement = deferred<GameView | undefined>();
    onMove.mockReturnValueOnce(movement.promise);
    fireEvent.keyDown(window, { key: 'd' }); await frames(40);
    expect(onMove).toHaveBeenCalledExactlyOnceWith('east', expect.objectContaining({ level: 1, cell: expect.objectContaining({ spaceId: 'library', row: 0, column: 0 }) }));
    expect(renderer.walker.pending?.target).toBe(addressKey(cells[1].at));
    expect(renderer.walker.scene.actor.key).toBe(addressKey(cells[0].at));
    fireEvent.keyUp(window, { key: 'd' });
    await act(async () => { movement.resolve(await setActor(1)); }); await frames(20);
    expect(renderer.walker.scene.actor.key).toBe(addressKey(cells[1].at));
    expect(renderer.walker.pending).toBeUndefined();
    expect(onMove).toHaveBeenCalledOnce();
  });

  it('does not accept a resolved same-position response or retry while the key remains down', async () => {
    const { onMove, renderer, cells } = await setup();
    fireEvent.keyDown(window, { key: 'd' }); await frames(50);
    expect(onMove).toHaveBeenCalledExactlyOnceWith('east', expect.objectContaining({ level: 1, cell: expect.objectContaining({ spaceId: 'library', row: 0, column: 0 }) }));
    expect(renderer.walker.scene.actor.key).toBe(addressKey(cells[0].at));
    expect(renderer.walker.position.x).toBeLessThan(1.6);
    expect(renderer.walker.pending).toBeUndefined();
    expect(screen.getByRole('status').textContent).toContain('Movement refused');
    await frames(30); expect(onMove).toHaveBeenCalledOnce();
  });

  it.each(['disabled', 'dialog', 'blur', 'hidden'] as const)('clears held input after %s and never resumes on unblocking', async cause => {
    const { onMove, renderer, rerender, props } = await setup();
    fireEvent.keyDown(window, { key: 'd' }); await frames(5);
    const pose = { ...renderer.walker.position };
    expect(pose.x).toBeGreaterThan(0); expect(onMove).not.toHaveBeenCalled();
    const dialog = document.createElement('dialog');
    await act(async () => {
      if (cause === 'disabled') rerender(<CanonicalStage3D {...props} disabled />);
      if (cause === 'dialog') { dialog.open = true; document.body.append(dialog); }
      if (cause === 'blur') fireEvent.blur(window);
      if (cause === 'hidden') { hidden.mockReturnValue(true); fireEvent(document, new Event('visibilitychange')); }
    });
    await frames(5);
    await act(async () => {
      if (cause === 'disabled') rerender(<CanonicalStage3D {...props} disabled={false} />);
      if (cause === 'dialog') dialog.remove();
      if (cause === 'hidden') { hidden.mockReturnValue(false); fireEvent(document, new Event('visibilitychange')); }
    });
    // OS repeats from the original physical hold must not re-arm cancelled input.
    fireEvent.keyDown(window, { key: 'd', repeat: true });
    await frames(30);
    expect(renderer.walker.position).toEqual(pose); expect(onMove).not.toHaveBeenCalled();
    fireEvent.keyUp(window, { key: 'd' });
    fireEvent.keyDown(window, { key: 'd' }); await frames(15);
    expect(onMove).toHaveBeenCalledExactlyOnceWith('east', expect.objectContaining({ level: 1, cell: expect.objectContaining({ spaceId: 'library', row: 0, column: 0 }) }));
  });

  it.each(['disabled', 'dialog', 'blur', 'hidden'] as const)('stops an already predicted crossing on %s without resuming after acceptance', async cause => {
    const { onMove, renderer, rerender, props, setActor } = await setup(), movement = deferred<GameView | undefined>();
    onMove.mockReturnValueOnce(movement.promise);
    fireEvent.keyDown(window, { key: 'd' }); await frames(12);
    const pose = { ...renderer.walker.position };
    expect(pose.x).toBeGreaterThan(2); expect(onMove).toHaveBeenCalledOnce();
    const dialog = document.createElement('dialog');
    await act(async () => {
      if (cause === 'disabled') rerender(<CanonicalStage3D {...props} disabled />);
      if (cause === 'dialog') { dialog.open = true; document.body.append(dialog); }
      if (cause === 'blur') fireEvent.blur(window);
      if (cause === 'hidden') { hidden.mockReturnValue(true); fireEvent(document, new Event('visibilitychange')); }
    });
    await frames(10); expect(renderer.walker.position).toEqual(pose);
    await act(async () => {
      movement.resolve(await setActor(1));
      if (cause === 'disabled') rerender(<CanonicalStage3D {...props} disabled={false} />);
      if (cause === 'dialog') dialog.remove();
      if (cause === 'hidden') { hidden.mockReturnValue(false); fireEvent(document, new Event('visibilitychange')); }
    });
    fireEvent.keyDown(window, { key: 'd', repeat: true }); await frames(20);
    expect(renderer.walker.position).toEqual(pose); expect(onMove).toHaveBeenCalledOnce();
    expect(renderer.walker.pending).toBeUndefined();
  });

  it('rolls back predicted position on command exception and cancels the held input', async () => {
    const { onMove, renderer } = await setup();
    let reject!: (error: Error) => void;
    onMove.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
    fireEvent.keyDown(window, { key: 'd' }); await frames(12);
    expect(renderer.walker.position.x).toBeGreaterThan(2);
    await act(async () => reject(new Error('Writer unavailable'))); await frames(20);
    expect(renderer.walker.position.x).toBeLessThan(1.6); expect(renderer.walker.pending).toBeUndefined();
    expect(onMove).toHaveBeenCalledOnce(); expect(screen.getByRole('status')).toHaveTextContent('Writer unavailable');
  });

  it('does not strand a new crossing behind an obsolete in-flight command after relocation', async () => {
    const { onMove, renderer, setActor, rerender, props, cells } = await setup(), movement = deferred<GameView | undefined>();
    onMove.mockReturnValueOnce(movement.promise);
    fireEvent.keyDown(window, { key: 'd' }); await frames(12);
    const late = await setActor(1), relocated = await setActor(2);
    rerender(<CanonicalStage3D {...props} game={relocated} />);
    fireEvent.keyUp(window, { key: 'd' }); fireEvent.keyDown(window, { key: 'a' }); await frames(30);
    expect(renderer.walker.pending).toBeUndefined(); expect(onMove).toHaveBeenCalledOnce();
    expect(renderer.walker.scene.actor.key).toBe(addressKey(cells[2].at));
    onMove.mockReturnValueOnce(new Promise(() => {}));
    await act(async () => movement.resolve(late));
    expect(renderer.walker.scene.actor.key).toBe(addressKey(cells[2].at));
    await frames(15);
    expect(onMove).toHaveBeenCalledTimes(2);
    expect(renderer.walker.pending?.direction).toBe('west');
  });

  it('disposes the renderer and ignores a command completion after teardown', async () => {
    const { onMove, renderer, unmount, setActor } = await setup(), movement = deferred<GameView | undefined>();
    onMove.mockReturnValueOnce(movement.promise);
    fireEvent.keyDown(window, { key: 'd' }); await frames(15);
    expect(onMove).toHaveBeenCalledOnce();
    const actor = renderer.walker.scene.actor.key;
    unmount();
    expect(renderer.dispose).toHaveBeenCalledOnce(); expect(renderer.canvas.isConnected).toBe(false);
    expect(callbacks.size).toBe(0);
    await act(async () => { movement.resolve(await setActor(1)); });
    fireEvent.keyDown(window, { key: 'd' }); await frames(20);
    expect(renderer.walker.scene.actor.key).toBe(actor); expect(onMove).toHaveBeenCalledOnce();
  });

  it('recreates the stage on game identity replacement without retaining held movement', async () => {
    const { renderer, rerender, props, onMove } = await setup();
    fireEvent.keyDown(window, { key: 'd' }); await frames(4);
    const game = structuredClone(props.game); game.id = 'replacement-game'; game.snapshot.gameId = game.id;
    rerender(<CanonicalStage3D {...props} game={game} />); await act(async () => {});
    expect(renderer.dispose).toHaveBeenCalledOnce(); expect(doubles.renderers).toHaveLength(2);
    await frames(30); expect(onMove).not.toHaveBeenCalled();
    expect(doubles.renderers[1].walker.position).toEqual({ x: 0, z: 0 });
    fireEvent.keyDown(window, { key: 'd' }); await frames(15);
    expect(onMove).toHaveBeenCalledExactlyOnceWith('east', expect.objectContaining({ level: 1, cell: expect.objectContaining({ spaceId: 'library', row: 0, column: 0 }) }));
  });

  it('freezes movement after a graphics failure until an explicit restart', async () => {
    const { onMove, renderer } = await setup();
    await act(async () => renderer.fail('Graphics context lost.'));
    expect(screen.getByRole('alert').textContent).toContain('Graphics context lost.');
    fireEvent.keyDown(window, { key: 'd' }); await frames(20);
    expect(onMove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Restart 3D' })); await act(async () => {});
    expect(renderer.dispose).toHaveBeenCalledOnce(); expect(doubles.renderers).toHaveLength(2);
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.keyDown(window, { key: 'd' }); await frames(20);
    expect(onMove).toHaveBeenCalledExactlyOnceWith('east', expect.objectContaining({ level: 1, cell: expect.objectContaining({ spaceId: 'library', row: 0, column: 0 }) }));
  });
});
