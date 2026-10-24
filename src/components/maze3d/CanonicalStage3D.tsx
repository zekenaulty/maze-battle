import { useEffect, useRef, useState } from 'react';
import type { Direction } from '../../domain/types';
import type { GameView } from '../../services/game/GameView';
import type { WorldPosition } from '../../persistence/canonical/world/types';
import { AssetRegistry, loadAssetRegistry } from '../../assets3d/registry';
import { loadSkinCatalog } from '../../assets3d/humanoid/contract';
import type { SkinCatalog } from '../../assets3d/humanoid/contract';
import { StageRenderer } from './StageRenderer';
import './stage.css';

interface Props {
  game: GameView; disabled: boolean;
  onMove: (direction: Direction, expectedPosition: WorldPosition) => Promise<GameView | undefined>;
  onReturn: () => void;
}
const movementKeys = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
export default function CanonicalStage3D(props: Props) {
  const host = useRef<HTMLDivElement>(null), view = useRef<StageRenderer>(undefined);
  const latest = useRef(props); latest.current = props;
  const dragging = useRef<{ id: number; x: number; y: number } | null>(null);
  const held = useRef(new Set<string>()), epoch = useRef(0), clear = () => { held.current.clear(); dragging.current = null; epoch.current++; };
  const [message, setMessage] = useState('Loading local dungeon materials…'), [failure, setFailure] = useState('');
  const [assetWarning, setAssetWarning] = useState('');
  const [restart, setRestart] = useState(0), [skins, setSkins] = useState<SkinCatalog>(), [skinId, setSkinId] = useState('');
  const [thirdPerson, setThirdPerson] = useState(false), [locked, setLocked] = useState(false);
  const settings = useRef({ thirdPerson, skinId }); settings.current = { thirdPerson, skinId };
  useEffect(() => {
    let alive = true, graphicsFailed = false, frame = 0, previous = 0, elapsed = 0, inFlight = false;
    const abort = new AbortController(); setFailure(''); setAssetWarning('');
    void (async () => {
      let registry: AssetRegistry;
      try { registry = await loadAssetRegistry(abort.signal); }
      catch { registry = new AssetRegistry(); }
      if (!alive || !host.current) return;
      try {
        const renderer = new StageRenderer(host.current, registry, latest.current.game, error => { graphicsFailed = true; clear(); setFailure(error); }, warning => {
          if (alive) setAssetWarning(warning);
        });
        renderer.setThirdPerson(settings.current.thirdPerson);
        view.current = renderer; setMessage('WASD to walk · drag to look · E opens a chest on your tile · M opens the map');
        void loadSkinCatalog(abort.signal).then(async catalog => {
          if (!alive) return;
          const selected = catalog.skins.find(skin => skin.id === settings.current.skinId) ?? catalog.skins[0];
          setSkins(catalog); setSkinId(selected?.id ?? ''); await renderer.setPlayer(catalog, selected?.id);
        }).catch(() => {});
        const move = async (direction: Direction) => {
          const crossing = renderer.walker.pending;
          if (!crossing || inFlight || latest.current.disabled || graphicsFailed) return;
          inFlight = true; const inputEpoch = epoch.current;
          try {
            const game = await latest.current.onMove(direction, renderer.walker.scene.actor.source.at);
            if (!alive) return;
            if (renderer.walker.pending !== crossing) return;
            if (game) renderer.update(game);
            if (!renderer.walker.settle(crossing)) { clear(); setMessage('Movement refused. Your position follows the committed game state.'); }
          } catch (error) { if (alive && renderer.walker.pending === crossing) { renderer.walker.reject(crossing); clear(); setMessage(error instanceof Error ? error.message : String(error)); } }
          finally { inFlight = false; if (inputEpoch !== epoch.current) held.current.clear(); }
        };
        const tick = (time: number) => {
          if (!alive || graphicsFailed) return;
          const dt = previous ? Math.min(0.05, (time - previous) / 1000) : 0; previous = time; elapsed += dt;
          const keys = held.current, blocked = latest.current.disabled || !!document.querySelector('dialog[open]') || document.hidden;
          const forward = blocked ? 0 : Number(keys.has('w') || keys.has('arrowup')) - Number(keys.has('s') || keys.has('arrowdown'));
          const strafe = blocked ? 0 : Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
          if (!blocked) { const crossing = renderer.walker.advance(dt, forward, strafe, renderer.yaw); if (crossing) void move(crossing.direction); }
          renderer.render(elapsed, !blocked && !!(forward || strafe)); frame = requestAnimationFrame(tick);
        }; frame = requestAnimationFrame(tick);
      } catch (error) { if (alive) { graphicsFailed = true; clear(); setFailure(error instanceof Error ? error.message : String(error)); } }
    })();
    const keydown = (event: KeyboardEvent) => {
      const target = event.target, key = event.key.toLowerCase();
      if (key === 'escape') { clear(); return; }
      if (!movementKeys.includes(key) || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.isComposing
        || target instanceof HTMLElement && (target.isContentEditable || !!target.closest('input,select,textarea'))) return;
      event.preventDefault(); // Captured before the existing 2D movement listener; never dispatch both.
      if (!event.repeat && !graphicsFailed && !latest.current.disabled && !document.querySelector('dialog[open]') && !document.hidden) held.current.add(key);
    };
    const keyup = (event: KeyboardEvent) => held.current.delete(event.key.toLowerCase());
    const visibility = () => { if (document.hidden) clear(); };
    const lock = () => { const active = document.pointerLockElement === view.current?.canvas; setLocked(active); if (!active) clear(); };
    const mouse = (event: MouseEvent) => { if (document.pointerLockElement === view.current?.canvas && !latest.current.disabled) view.current?.look(event.movementX, event.movementY); };
    const dialogs = new MutationObserver(() => { if (document.querySelector('dialog[open]')) { clear(); if (document.pointerLockElement === view.current?.canvas) document.exitPointerLock(); } });
    dialogs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
    window.addEventListener('keydown', keydown, true); window.addEventListener('keyup', keyup); window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', visibility); document.addEventListener('pointerlockchange', lock); document.addEventListener('mousemove', mouse);
    return () => {
      alive = false; clear(); abort.abort(); cancelAnimationFrame(frame); dialogs.disconnect();
      if (document.pointerLockElement === view.current?.canvas) document.exitPointerLock();
      view.current?.dispose(); view.current = undefined;
      window.removeEventListener('keydown', keydown, true); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', visibility); document.removeEventListener('pointerlockchange', lock); document.removeEventListener('mousemove', mouse);
    };
    // Ownership/commands are read through latest; recreate only for game/floor identity or explicit graphics recovery.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.game.id, props.game.snapshot.generation, props.game.checkpoint.position.level, restart]);
  useEffect(() => { view.current?.update(props.game); }, [props.game]);
  useEffect(() => { if (props.disabled) { clear(); if (document.pointerLockElement === view.current?.canvas) document.exitPointerLock(); } }, [props.disabled]);
  return <div className="canonical-3d" data-disabled={props.disabled}>
    <div className="canonical-3d-host" ref={host}
      onPointerDown={event => { if (props.disabled || event.button !== 0) return; dragging.current = { id: event.pointerId, x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); view.current?.canvas.focus(); }}
      onPointerMove={event => { const previous = dragging.current; if (!previous || previous.id !== event.pointerId || props.disabled || locked) return;
        view.current?.look(event.clientX - previous.x, event.clientY - previous.y); dragging.current = { id: event.pointerId, x: event.clientX, y: event.clientY }; }}
      onPointerUp={() => { dragging.current = null; }} onPointerCancel={() => { dragging.current = null; }} />
    <div className="stage-3d-toolbar">
      <button onClick={() => { clear(); props.onReturn(); }}>Return to 2D</button>
      {assetWarning && <><span className="stage-3d-asset-warning" role="status">{assetWarning}</span><button onClick={() => { clear(); setRestart(n => n + 1); }}>Retry materials</button></>}
      <button disabled={props.disabled || !!failure} onClick={() => { void view.current?.canvas.requestPointerLock()?.catch(() => setMessage('Mouse capture unavailable; drag the view to look around.')); }}>{locked ? 'Mouse captured · Esc releases' : 'Capture mouse'}</button>
      {skins?.skins.length ? <><label>Camera<select aria-label="3D camera" value={thirdPerson ? 'third' : 'first'} onChange={event => {
        const value = event.target.value === 'third'; clear(); setThirdPerson(value); view.current?.setThirdPerson(value);
      }}><option value="first">First person</option><option value="third">Follow player</option></select></label>
      <label>Appearance<select aria-label="Player appearance" value={skinId} onChange={event => { clear(); setSkinId(event.target.value); void view.current?.chooseSkin(event.target.value); }}>
        {skins.skins.filter(s => s.provenance.kind === 'generated').map(s => <option value={s.id} key={s.id}>{s.label}</option>)}
      </select></label></> : null}
    </div>
    <div className="stage-3d-reticle" aria-hidden="true">·</div>
    <p className="stage-3d-help" role="status">{message}</p>
    <div className="stage-3d-touch" aria-label="3D movement controls">{[['w', 'Forward'], ['a', 'Strafe left'], ['s', 'Backward'], ['d', 'Strafe right']].map(([key, name]) =>
      <button key={key} aria-label={name} disabled={props.disabled || !!failure}
        onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); held.current.add(key); }}
        onPointerUp={() => held.current.delete(key)} onPointerCancel={() => held.current.delete(key)} onLostPointerCapture={() => held.current.delete(key)}>{name}</button>)}</div>
    {failure && <div className="stage-3d-error" role="alert">{failure}<button onClick={() => { clear(); setRestart(n => n + 1); }}>Restart 3D</button><button onClick={props.onReturn}>Use 2D view</button></div>}
  </div>;
}
