import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type SetStateAction } from 'react';
import { Activity, Bot as Robot, Crosshair, Map, Save, Settings, Square, Users, ZoomIn, ZoomOut } from 'lucide-react';
import type { Direction, GridPosition } from '../domain/types';
import type { GameView } from '../services/game/GameView';
import { AutoThrottleControl } from './AutoThrottleControl';
import { Controls } from './Controls';
import type { MazeRenderMode } from './maze/drawMaze';
import { DEFAULT_MAZE_CAMERA, zoomMazeCamera, type MazeCameraState } from './maze/mazeCamera';
import { MazeCanvas } from './MazeCanvas';
import { canonicalPerceptionScope, createCanonicalMazeView, currentVisibleCell, emptyCanonicalMazeView } from '../viewModels/canonicalPerceivedMaze';
import { useMazePerception } from '../hooks/useMazePerception';
import { Dialog } from './Dialog';
import { ConfirmActionDialog } from './screens/ConfirmActionDialog';
import './screens/screens.css';
import { useExploreKeys } from '../hooks/useExploreKeys';
import { ignoresGameKey } from '../hooks/gameKeys';
import { KnownRooms } from './maze/KnownRooms';
import type { KnownAnchor } from '../persistence/canonical/knowledge/graph';
const CanonicalStage3D = lazy(() => import('./maze3d/CanonicalStage3D'));

interface ExploreScreenProps {
  game: GameView;
  status: string;
  onMove: (direction: Direction) => void;
  observationHead?: string;
  chests?: GridPosition[];
  autoActive: boolean;
  autoAvailable?: boolean;
  wavesActive: boolean;
  autoThrottleMs: number;
  onAutoToggle: () => void;
  onWavesToggle: () => void;
  onAutoThrottleChange: (value: number) => void;
  onTown: () => void;
  onCharacters: () => void;
  onSaves: () => void;
  onNewGame: () => void | Promise<void>;
  onRandomBattlesChange: (enabled: boolean) => void;
  portalScrollCount?: number;
  onDiagnostics?: () => void;
  onAgenticPlay?: () => void;
  onStopAgenticPlay?: () => void;
  agenticActive?: boolean;
  onTileClick?: (position: GridPosition) => void;
  onStopWalking?: () => void;
  onOpenChest?: (id: string) => void;
  navigationMessage?: string;
  controlsDisabled?: boolean;
  onStageMove?: (direction: Direction, expectedPosition: GameView['checkpoint']['position']) => Promise<GameView | undefined>;
  onStageStairs?: (direction: 'up' | 'down', expectedPosition: GameView['checkpoint']['position']) => void;
  view3D?: boolean;
  onView3DChange?: (enabled: boolean) => void;
  onPrepareStairs?: (expected: GameView['checkpoint']['position'], binding: string) => Promise<GameView | undefined>;
  onWalkStairs?: (direction: 'up' | 'down', expected: GameView['checkpoint']['position'], binding: string) => Promise<GameView | undefined>;
}

export function ExploreScreen({
  game,
  status,
  onMove,
  autoActive,
  autoAvailable = true,
  wavesActive,
  autoThrottleMs,
  onAutoToggle,
  onWavesToggle,
  onAutoThrottleChange,
  onTown,
  onCharacters,
  onSaves,
  onNewGame,
  onRandomBattlesChange,
  portalScrollCount,
  onDiagnostics,
  onAgenticPlay, onStopAgenticPlay, agenticActive = false,
  onTileClick, onStopWalking, onOpenChest, navigationMessage, controlsDisabled = false, onStageMove, onStageStairs, onPrepareStairs, onWalkStairs,
  view3D: selectedView3D, onView3DChange,
}: ExploreScreenProps) {
  const [localView3D, setLocalView3D] = useState(() => new URLSearchParams(location.search).get('view') === 'stage3d');
  const view3D = selectedView3D ?? localView3D;
  const setView3D = (enabled: boolean) => { setLocalView3D(enabled); onView3DChange?.(enabled); };
  const changeView3D = (enabled: boolean) => { if (!autoActive && !agenticActive) onStopWalking?.(); setView3D(enabled); };
  const [onFlight, setOnFlight] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapTab, setMapTab] = useState<'rooms' | 'nearby'>('rooms');
  const [recall, setRecall] = useState<{ root: string; anchor: KnownAnchor; centered: boolean } | null>(null);
  const nearbyTab = useRef<HTMLButtonElement>(null);
  const [camera, setCamera] = useState<MazeCameraState>(DEFAULT_MAZE_CAMERA);
  const [inspectedFrom, setInspectedFrom] = useState<string>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 });
  const portalCount = portalScrollCount ?? game.inventory.items.reduce((count, item) =>
    item.consumableEffect === 'townPortal' ? count + Math.max(0, Math.floor(item.quantity ?? 1)) : count, 0);
  const manualMap = !controlsDisabled && !autoActive && !agenticActive && game.mode === 'manual';
  const mapVisible = mapOpen && manualMap;
  const showRooms = mapVisible && mapTab === 'rooms';
  const root = JSON.stringify(game.snapshot);
  const activeRecall = recall?.root === root ? recall : null;
  const readOnlyMap = showRooms || mapVisible && !!activeRecall;
  const floor = game.checkpoint.position.level, facing = game.checkpoint.facing;
  const actorFrame = JSON.stringify([game.id, game.snapshot.generation, game.checkpoint.position]);
  useLayoutEffect(() => {
    if (camera.mode === 'manual' && inspectedFrom !== actorFrame)
      setCamera(current => ({ ...current, mode: 'follow', origin: undefined }));
  }, [actorFrame, inspectedFrom, camera.mode]);
  let activeCamera: MazeCameraState = recall && !activeRecall || camera.mode === 'manual' && inspectedFrom !== actorFrame
    ? { ...camera, mode: 'follow', origin: undefined } : camera;
  if (activeRecall?.centered) {
    const area = canonicalPerceptionScope(floor, activeRecall.anchor.world, canvasSize, camera, 'camera');
    activeCamera = { ...camera, mode: 'manual', origin: {
      row: activeRecall.anchor.world.row - Math.floor(area.rows / 2), column: activeRecall.anchor.world.column - Math.floor(area.columns / 2),
    } };
  }
  const mazeMode: MazeRenderMode = mapVisible && mapTab === 'nearby' && !activeRecall ? 'overview' : 'camera';
  const isOverview = mazeMode === 'overview';
  const currentCell = currentVisibleCell(game);
  const actor = currentCell?.world;
  const scope = canonicalPerceptionScope(floor, actor ?? { row: 0, column: 0 }, canvasSize, activeCamera, mazeMode);
  const scopeKey = JSON.stringify(scope);
  const perception = useMazePerception(game.snapshot, scope, game, (!view3D || mapVisible) && !showRooms);
  const mazeView = useMemo(() => perception.region ? createCanonicalMazeView(perception.region, facing)
    : emptyCanonicalMazeView(scope, facing), [perception.region, facing, scopeKey]);
  const zoomLabel = `${Math.round(camera.zoom * 100)}%`;
  const chest = currentCell?.chests.find(cell => !cell.opened);
  const stageBlocked = controlsDisabled || settingsOpen || confirmNew;
  const blocked = stageBlocked || onFlight;
  const toggleMap = () => {
    if (blocked || !manualMap) return;
    onStopWalking?.(); setMapOpen(!mapVisible); setMapTab('rooms'); setRecall(null);
    if (activeRecall) setCamera(current => ({ ...current, mode: 'follow', origin: undefined }));
  };
  const inspectRoom = (anchor: KnownAnchor) => {
    setRecall({ root, anchor, centered: true }); setMapTab('nearby'); nearbyTab.current?.focus();
  };
  const changeCamera = (next: SetStateAction<MazeCameraState>) => {
    setCamera(typeof next === 'function' ? next(activeCamera) : next);
    setInspectedFrom(actorFrame);
    setRecall(current => current ? { ...current, centered: false } : null);
  };
  const interact = () => { onStopWalking?.(); if (!blocked && !readOnlyMap && chest) onOpenChest?.(chest.id); };
  useExploreKeys(blocked, { interact, map: toggleMap, inventory: onCharacters,
    portal: () => { if (!readOnlyMap && portalCount > 0) onTown(); }, stop: () => onStopWalking?.() });

  useEffect(() => {
    if (!manualMap) { setMapOpen(false); setRecall(null); setCamera(current => ({ ...current, mode: 'follow', origin: undefined })); }
    else if (recall && !activeRecall) { setRecall(null); setCamera(current => ({ ...current, mode: 'follow', origin: undefined })); }
  }, [manualMap, recall, activeRecall]);

  useEffect(() => {
    if (!readOnlyMap || blocked) return;
    // The parent owns movement keys; recall consumes them without issuing a command.
    const guard = (event: KeyboardEvent) => {
      if (!ignoresGameKey(event) && ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(event.key.toLowerCase())) event.preventDefault();
    };
    window.addEventListener('keydown', guard, true);
    return () => window.removeEventListener('keydown', guard, true);
  }, [readOnlyMap, blocked]);

  useEffect(() => {
    setCamera((current) => ({ ...current, mode: 'follow', origin: undefined }));
  }, [game.id, floor]);

  return (
    <main className={`game-screen explore-screen refined-screen ${onDiagnostics ? 'has-diagnostics' : ''} ${onAgenticPlay ? 'has-agentic' : ''}`}>
      <div className="screen-bar">
        <div>
          <h1>Maze Battle</h1>
          <span className="screen-status">
            Dungeon {floor} - {status}{actor ? ` - ${actor.row}, ${actor.column}` : ''}
          </span>
        </div>
        <nav aria-label="Explore actions" onClickCapture={event => {
          if (!(event.target instanceof Element && event.target.closest('[data-agentic-control],[data-view-control]'))) onStopWalking?.();
        }}>
          {onStageMove && <button type="button" data-view-control aria-pressed={view3D} disabled={blocked || !currentCell} onClick={() => {
            changeView3D(!view3D); setMapOpen(false); setRecall(null);
          }}>{view3D ? '2D view' : '3D view'}</button>}
          <button className={autoActive ? 'is-active' : ''} type="button" aria-pressed={autoActive} onClick={onAutoToggle}
            disabled={!autoAvailable || onFlight} title={autoAvailable ? undefined : 'Take control of this game to use Auto'}>
            {autoActive ? 'Stop Auto' : 'Auto'}
          </button>
          <button className={wavesActive ? 'is-active' : ''} type="button" aria-pressed={wavesActive} onClick={onWavesToggle} disabled={!autoAvailable || onFlight}>
            {wavesActive ? 'Stop Waves' : 'Waves'}
          </button>
          {onAgenticPlay && <button className="screen-icon" data-agentic-control type="button" disabled={onFlight} title="Agentic play" aria-label="Agentic play" onClick={onAgenticPlay}>
            <Robot size={18} aria-hidden="true" />
          </button>}
          {onStopAgenticPlay && <button className="agentic-stop" data-agentic-control type="button" title="Stop Agentic play" aria-label="Stop Agentic play" onClick={onStopAgenticPlay}>
            <Square size={14} aria-hidden="true" />Stop
          </button>}
          <button type="button" onClick={onTown} disabled={agenticActive || onFlight || portalCount < 1} aria-keyshortcuts="T" title={portalCount > 0 ? 'Use one town portal scroll (T)' : 'No portal scrolls. Floor-one entrance stairs are free.'}>
            Portal ({portalCount})
          </button>
          <button className={`screen-icon ${mapVisible ? 'is-active' : ''}`} type="button" title="Map (M)" aria-label="Map" aria-keyshortcuts="M" aria-pressed={mapVisible} onClick={toggleMap} disabled={blocked || !manualMap}>
            <Map size={18} aria-hidden="true" />
          </button>
          <button className="screen-icon" type="button" disabled={agenticActive || onFlight} title="Party and inventory (I)" aria-label="Party" aria-keyshortcuts="I" onClick={onCharacters}>
            <Users size={18} aria-hidden="true" />
          </button>
          <button className="screen-icon" type="button" disabled={agenticActive || onFlight} title="Saves" aria-label="Saves" onClick={onSaves}>
            <Save size={18} aria-hidden="true" />
          </button>
          {onDiagnostics && <button className="screen-icon" type="button" title="Diagnostics" aria-label="Diagnostics" onClick={onDiagnostics}><Activity size={18} aria-hidden="true" /></button>}
          <button className="screen-icon" type="button" disabled={agenticActive || onFlight} title="Expedition settings" aria-label="Expedition settings" onClick={() => setSettingsOpen(true)}>
            <Settings size={18} aria-hidden="true" />
          </button>
        </nav>
      </div>
      {autoActive && <div className="screen-auto-status" role="status"><strong>Auto</strong><span>{status}</span></div>}
      <section className={`maze-stage ${isOverview ? 'is-overview' : ''} ${mapVisible ? 'has-room-map' : ''}`}>
        {view3D && onStageMove && <div style={{ position: 'absolute', inset: 0, display: mapVisible ? 'none' : undefined }} aria-hidden={mapVisible}>
          <Suspense fallback={<p role="status">Loading 3D stage…</p>}><CanonicalStage3D game={game}
            automated={(autoActive || agenticActive) && !stageBlocked && !mapVisible}
            disabled={stageBlocked || mapVisible || autoActive || agenticActive} onMove={onStageMove} onPrepareStairs={onPrepareStairs} onWalkStairs={onWalkStairs} onFlightChange={setOnFlight}
            onReturn={() => changeView3D(false)} /></Suspense>
        </div>}
        {(!view3D || mapVisible) && <>
        {mapVisible && <div className="known-rooms-tabs" role="tablist" aria-label="Map views" onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const tab = event.key === 'Home' ? 'rooms' : event.key === 'End' ? 'nearby' : mapTab === 'rooms' ? 'nearby' : 'rooms';
          setMapTab(tab);
          event.currentTarget.querySelector<HTMLButtonElement>(`#map-tab-${tab}`)?.focus();
        }}>
          <button id="map-tab-rooms" type="button" role="tab" aria-selected={mapTab === 'rooms'} aria-controls="map-panel" tabIndex={mapTab === 'rooms' ? 0 : -1} onClick={() => setMapTab('rooms')}>Rooms</button>
          <button id="map-tab-nearby" ref={nearbyTab} type="button" role="tab" aria-selected={mapTab === 'nearby'} aria-controls="map-panel" tabIndex={mapTab === 'nearby' ? 0 : -1} onClick={() => setMapTab('nearby')}>Nearby</button>
        </div>}
        <div className="known-rooms-panel" id="map-panel" role={mapVisible ? 'tabpanel' : undefined} aria-labelledby={mapVisible ? `map-tab-${mapTab}` : undefined}>
        {showRooms ? <KnownRooms snapshot={game.snapshot} disabled={blocked} currentSpace={game.checkpoint.position.cell.spaceId} onInspect={inspectRoom} /> : <>
        <MazeCanvas
          maze={mazeView.maze}
          chests={mazeView.chests}
          facing={mazeView.facing}
          visibility={mazeView.visibility}
          viewport={mazeView.viewport} origin={mazeView.origin}
          frameKey={`${game.snapshot.generation}:${game.snapshot.gameId}:${game.snapshot.revision}:${game.snapshot.roots.knowledge}:${scopeKey}`}
          pending={perception.pending} onSizeChange={setCanvasSize}
          camera={activeCamera}
          mode={mazeMode}
          onCameraChange={changeCamera}
          onTileClick={blocked || readOnlyMap || !perception.region ? undefined : onTileClick}
        />
        {mapVisible && activeRecall && activeCamera.mode === 'manual' && <p className="known-room-recall" role="status">Room anchor {activeRecall.anchor.world.row}, {activeRecall.anchor.world.column}</p>}
        {mazeMode === 'camera' && (
          <div className="camera-controls" aria-label="Camera controls">
            <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => changeCamera((current) => zoomMazeCamera(current, -0.15))}>
              <ZoomOut aria-hidden="true" size={16} />
            </button>
            <span aria-label={`Camera zoom ${zoomLabel}`}>{zoomLabel}</span>
            <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => changeCamera((current) => zoomMazeCamera(current, 0.15))}>
              <ZoomIn aria-hidden="true" size={16} />
            </button>
            <button type="button" aria-label="Recenter camera" title="Recenter camera" onClick={() => changeCamera((current) => ({ ...current, mode: 'follow', origin: undefined }))}>
              <Crosshair aria-hidden="true" size={16} />
            </button>
          </div>
        )}
        </>}
        </div>
        </>}
      </section>
      <div className="explore-interaction">
        <button type="button" onClick={interact} disabled={blocked || readOnlyMap || !chest || !onOpenChest} title="Open chest (E)" aria-keyshortcuts="E">Open chest</button>
        {view3D && onStageStairs && currentCell?.stairs.filter(stair => stair === 'town' || !game.spatial?.ports?.some(({ at }) => at.level === currentCell.at.level && at.cell.spaceId === currentCell.at.cell.spaceId
          && at.cell.row === currentCell.at.cell.row && at.cell.column === currentCell.at.cell.column)).map(stair => <button key={stair} type="button" disabled={blocked || readOnlyMap || autoActive || agenticActive}
          onClick={() => { onStopWalking?.(); onStageStairs(stair === 'down' ? 'down' : 'up', currentCell.at); }}>{stair === 'town' ? 'Return to town' : `Use ${stair} stairs`}</button>)}
        <span aria-live="polite">{navigationMessage}</span>
        {perception.error && <span role="alert">{perception.error}</span>}
      </div>
      {!view3D && <Controls onMove={onMove} disabled={blocked || readOnlyMap} />}
      {settingsOpen && <Dialog title="Expedition settings" onClose={() => setSettingsOpen(false)}>
        <div className="screen-settings">
          <label className="compact-toggle">
            <input type="checkbox" checked={game.randomBattles} disabled={controlsDisabled || agenticActive} onChange={(event) => onRandomBattlesChange(event.currentTarget.checked)} />
            <span>Encounters</span>
          </label>
          <AutoThrottleControl value={autoThrottleMs} onChange={onAutoThrottleChange} />
          <button type="button" onClick={() => { setSettingsOpen(false); setConfirmNew(true); }}>New game</button>
        </div>
      </Dialog>}
      {confirmNew && <ConfirmActionDialog title="Start a new game?" message="This discards this game's current state, manual saves and observation history. This cannot be undone." confirmLabel="Start new game" onConfirm={onNewGame} onClose={() => setConfirmNew(false)} />}
    </main>
  );
}
