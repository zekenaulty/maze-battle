import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MODEL_PACK_URL, validateModelPack } from '../../assets3d/models/contract';
import type { ModelPack, VisualAsset, VisualMaterial } from '../../assets3d/models/contract';
import { nativeLever, nativeMaterials } from '../../assets3d/models/native';
import { VisualInstance, VisualResources } from '../../assets3d/models/VisualInstance';
import { straightStair } from '../../assets3d/stairs/assembly';
import type { Volume } from '../../assets3d/stairs/assembly';
import { StairFixtureWalker } from '../../assets3d/stairs/locomotion';
import { stairFixture } from '../../assets3d/stairs/fixture';
import { ArchitectureExhibit } from './ArchitectureExhibit';
import { ShelvingExhibit } from './ShelvingExhibit';
import { SHELVING, SHELVING_KINDS, type ShelvingKind } from './shelving';
import './modelWorkshop.css';

type Exhibit = 'models' | 'stairs' | 'walk' | 'architecture' | 'shelving';
interface Options { exhibit: Exhibit; shelf: ShelvingKind; active: boolean; wood: boolean; wireframe: boolean; cutaway: boolean; markers: boolean; playing: boolean; dim: boolean }
interface Workshop { update(options: Options): void; view(which: 'front' | 'back' | 'left' | 'right' | 'lower' | 'upper' | 'lantern'): void; faceStairs(): void; step(): void }
export default function ModelWorkshop() {
  const requested = new URLSearchParams(location.search).get('exhibit');
  const initial: Exhibit = requested === 'architecture' || requested === 'stairs' || requested === 'shelving' ? requested : 'models';
  const [options, setOptions] = useState<Options>({ exhibit: initial, shelf: 'low-bookcase', active: false, wood: false, wireframe: false, cutaway: false, markers: false, playing: true, dim: false });
  const [status, setStatus] = useState('Loading model preview…'), [error, setError] = useState('');
  const container = useRef<HTMLDivElement>(null), workshop = useRef<Workshop | undefined>(undefined);
  const optionsRef = useRef(options); optionsRef.current = options;
  useEffect(() => { workshop.current?.update(options); }, [options]);
  useEffect(() => {
    const host = container.current!, controller = new AbortController(); let alive = true, frame = 0;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
    catch { setError('WebGL is unavailable. Return to the game or restart the preview.'); return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.outputColorSpace = THREE.SRGBColorSpace;
    const canvas = renderer.domElement; canvas.tabIndex = 0; canvas.setAttribute('aria-label', 'Model and stair workshop'); host.append(canvas);
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#10151d');
    const camera = new THREE.PerspectiveCamera(52, 1, 0.05, 100), orbit = new OrbitControls(camera, canvas);
    orbit.enableDamping = true; orbit.minDistance = 0.8; orbit.maxDistance = 40;
    const ambient = new THREE.HemisphereLight('#dbe9ff', '#56505a', 2.4); scene.add(ambient);
    const keyLight = new THREE.DirectionalLight('#ffe8cc', 3); keyLight.position.set(4, 10, 8); scene.add(keyLight);
    const fill = new THREE.DirectionalLight('#a2caff', 1.4); fill.position.set(-6, 4, -5); scene.add(fill);
    const resources = new VisualResources(MODEL_PACK_URL), models: VisualInstance[] = [];
    const modelGroup = new THREE.Group(), stairGroup = new THREE.Group(), rooms = new THREE.Group(), ceilings = new THREE.Group();
    scene.add(modelGroup, stairGroup, rooms); rooms.add(ceilings);
    const architecture = new ArchitectureExhibit(canvas); scene.add(architecture.root);
    const shelving = new ShelvingExhibit(canvas); scene.add(shelving.root);
    const ownedGeometry = new Set<THREE.BufferGeometry>(), ownedMaterial = new Set<THREE.Material>(), obstacles: Volume[] = [];
    const fixtureMaterial = (color: string) => { const material = new THREE.MeshStandardMaterial({ color, roughness: 0.9 }); ownedMaterial.add(material); return material; };
    const stone = fixtureMaterial('#596879'), floor = fixtureMaterial('#414d59'), upperFloor = fixtureMaterial('#7f776a');
    const box = (parent: THREE.Group, size: [number, number, number], center: [number, number, number], material: THREE.Material, collision = false) => {
      const geometry = new THREE.BoxGeometry(...size); ownedGeometry.add(geometry);
      const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...center); parent.add(mesh);
      if (collision) obstacles.push({ min: center.map((v, i) => v - size[i] / 2) as [number, number, number], max: center.map((v, i) => v + size[i] / 2) as [number, number, number] });
      return mesh;
    };
    const stair = straightStair(), walker = new StairFixtureWalker(stair, obstacles);
    const stairModel = new VisualInstance(stair.model, resources); models.push(stairModel); stairGroup.add(stairModel.root);
    const stairBindings = () => ({ structure: optionsRef.current.wood ? nativeMaterials.native_wood : nativeMaterials.native_stone,
      treads: optionsRef.current.wood ? nativeMaterials.native_stone : nativeMaterials.native_wood, rails: nativeMaterials.native_bronze });
    stairModel.bindMaterials(stairBindings()); stairModel.setVisualState('neutral');
    for (const part of stairFixture(stair)) box(part.cutaway ? ceilings : rooms, part.size, part.center,
      { wall: stone, lower: floor, upper: upperFloor }[part.material], true);
    box(modelGroup, [11, 0.14, 4], [0, -0.08, 0], floor);
    const reference = box(modelGroup, [0.45, 2.7, 0.45], [4.6, 1.35, 0], fixtureMaterial('#c1b6a4'));
    reference.name = '2.7-unit character reference';
    const levers: VisualInstance[] = []; let door: VisualInstance | undefined;
    const addAsset = (asset: VisualAsset, materials: Record<string, VisualMaterial>, binding: Record<string, string>, position: [number, number, number], scale = 1) => {
      const instance = new VisualInstance(asset, resources); instance.bindMaterials(Object.fromEntries(Object.entries(binding).map(([slot, id]) => [slot, materials[id]])));
      instance.setVisualState(Object.keys(asset.states)[0]); instance.root.position.set(...position); instance.root.scale.setScalar(scale);
      modelGroup.add(instance.root); models.push(instance); return instance;
    };
    const native = addAsset(nativeLever(), nativeMaterials, { mount: 'native_stone', handle: 'native_bronze' }, [-0.8, 1.3, 0], 1.6); levers.push(native);
    let current = optionsRef.current, walkYaw = 0, walkPitch = 0, drag: { x: number; y: number } | undefined;
    let modelStatus = 'Loading model preview…';
    const keys = new Set<string>();
    const inspectView = (which: 'front' | 'back' | 'left' | 'right' | 'lower' | 'upper' | 'lantern') => {
      if (which === 'lower' || which === 'upper') { walker.reset(which === 'upper'); walkYaw = which === 'upper' ? Math.PI : 0; walkPitch = 0; canvas.focus(); return; }
      const stairView = current.exhibit === 'stairs' || current.exhibit === 'walk';
      const bounds = architecture.bounds(which === 'lantern');
      const target = current.exhibit === 'architecture' ? bounds.getCenter(new THREE.Vector3()) : current.exhibit === 'shelving' ? new THREE.Vector3(.7, 1.35, 0) : stairView ? new THREE.Vector3(0, 2.5, stair.run / 2) : new THREE.Vector3(0, 1.6, 0);
      const size = bounds.getSize(new THREE.Vector3());
      const distance = current.exhibit === 'architecture' ? Math.max(size.x, size.y, size.z) * 1.6 : current.exhibit === 'shelving' ? 6.6 : stairView ? 15 : 10;
      const direction = { front: [0, 0.25, 1], back: [0, 0.25, -1], left: [-1, 0.25, 0], right: [1, 0.25, 0], lantern: [0, .1, 1] }[which];
      orbit.target.copy(target); camera.position.copy(target).add(new THREE.Vector3(...direction).multiplyScalar(distance)); camera.lookAt(target); orbit.update();
    };
    const update = (next: Options) => {
      const previous = current; current = next;
      modelGroup.visible = next.exhibit === 'models'; stairGroup.visible = next.exhibit === 'stairs' || next.exhibit === 'walk'; rooms.visible = next.exhibit === 'walk';
      architecture.root.visible = next.exhibit === 'architecture';
      shelving.root.visible = next.exhibit === 'shelving'; shelving.update(next.shelf, next.active, next.wireframe);
      architecture.update({ wireframe: next.wireframe, markers: next.markers, playing: next.playing && next.exhibit === 'architecture' });
      const dim = next.exhibit === 'architecture' && next.dim; ambient.intensity = dim ? .09 : 2.4; keyLight.intensity = dim ? .08 : 3; fill.intensity = dim ? .02 : 1.4;
      if (next.exhibit === 'architecture') {
        setStatus(architecture.status);
        void architecture.ensureLoaded(controller.signal, message => { if (alive && current.exhibit === 'architecture') { setStatus(message); inspectView('front'); } });
      } else if (next.exhibit === 'shelving') {
        setStatus(shelving.status);
        void shelving.ensureLoaded(controller.signal, message => { if (alive && current.exhibit === 'shelving') { setStatus(message); inspectView('front'); } });
      } else setStatus(modelStatus);
      ceilings.visible = !next.cutaway; orbit.enabled = next.exhibit !== 'walk';
      for (const model of models) model.setWireframe(next.wireframe);
      stairModel.bindMaterials(stairBindings());
      native.bindMaterials({ mount: next.wood ? nativeMaterials.native_wood : nativeMaterials.native_stone, handle: nativeMaterials.native_bronze });
      for (const lever of levers) lever.setVisualState(next.active ? 'on' : 'off'); door?.setVisualState(next.active ? 'open' : 'closed');
      if (next.exhibit !== previous.exhibit) { keys.clear(); if (next.exhibit === 'walk') inspectView('lower'); else inspectView('front'); }
      canvas.dataset.exhibit = next.exhibit; canvas.dataset.geometryCount = String(resources.geometryCount);
    };
    workshop.current = { update, view: inspectView, step: () => architecture.step(), faceStairs: () => { walkYaw = walker.pose.z > stair.run / 2 ? Math.PI : 0; walkPitch = -0.22; canvas.focus(); } }; update(current); inspectView('front');
    const resize = new ResizeObserver(() => { const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }); resize.observe(host);
    const keyboard = (event: KeyboardEvent, down: boolean) => {
      if (!down) { keys.delete(event.code); return; }
      if (current.exhibit !== 'walk' || (event.target as HTMLElement)?.matches('input,select,textarea,button')) return;
      if (['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) { event.preventDefault(); if (down) keys.add(event.code); else keys.delete(event.code); }
    };
    const keydown = (e: KeyboardEvent) => keyboard(e, true), keyup = (e: KeyboardEvent) => keyboard(e, false), clear = () => { keys.clear(); drag = undefined; };
    const pointerDown = (e: PointerEvent) => { if (current.exhibit === 'walk') { canvas.focus(); drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); } };
    const pointerMove = (e: PointerEvent) => { if (!drag) return; walkYaw -= (e.clientX - drag.x) * 0.004; walkPitch = Math.max(-1.2, Math.min(1.2, walkPitch - (e.clientY - drag.y) * 0.004)); drag = { x: e.clientX, y: e.clientY }; };
    const pointerUp = () => { drag = undefined; };
    const focus = (event: FocusEvent) => { if ((event.target as HTMLElement)?.matches('input,select,textarea,button')) clear(); };
    const visibility = () => { if (document.hidden) clear(); };
    window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup); window.addEventListener('blur', clear);
    document.addEventListener('focusin', focus); document.addEventListener('visibilitychange', visibility);
    canvas.addEventListener('pointerdown', pointerDown); canvas.addEventListener('pointermove', pointerMove); canvas.addEventListener('pointerup', pointerUp);
    let previousTime = performance.now();
    const render = (now: number) => {
      if (!alive) return; const dt = Math.min(0.05, (now - previousTime) / 1000); previousTime = now;
      if (current.exhibit === 'walk') {
        const forward = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
        const strafe = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
        const divisor = Math.max(1, Math.hypot(forward, strafe));
        walker.advance(dt, (Math.sin(walkYaw) * forward + Math.cos(walkYaw) * strafe) * 3 / divisor,
          (Math.cos(walkYaw) * forward - Math.sin(walkYaw) * strafe) * 3 / divisor);
        camera.position.set(walker.pose.x, walker.cameraY, walker.pose.z);
        camera.lookAt(walker.pose.x + Math.sin(walkYaw) * Math.cos(walkPitch), walker.cameraY + Math.sin(walkPitch), walker.pose.z + Math.cos(walkYaw) * Math.cos(walkPitch));
      } else orbit.update();
      architecture.tick(now);
      canvas.dataset.pose = JSON.stringify(walker.pose); canvas.dataset.cameraY = String(walker.cameraY); canvas.dataset.frame = String(frame);
      renderer.render(scene, camera);
      canvas.dataset.gpuGeometries = String(renderer.info.memory.geometries); canvas.dataset.gpuTextures = String(renderer.info.memory.textures);
      canvas.dataset.gpuPrograms = String(renderer.info.programs?.length ?? 0); frame = requestAnimationFrame(render);
    }; frame = requestAnimationFrame(render);
    void (async () => {
      try {
        const response = await fetch(MODEL_PACK_URL, { signal: controller.signal, cache: 'no-cache' }); if (!response.ok) throw new Error('Model pack unavailable; run the curated model importer.');
        const pack: ModelPack = await response.json(); if (!alive) return;
        validateModelPack(pack);
        const imported = addAsset(pack.assets['lever-wall-source'], pack.materials, pack.bindings['lever-wall-source'], [-3, 1.3, 0], 1.6); levers.push(imported);
        if (pack.assets['stone-button-wall-source']) levers.push(addAsset(pack.assets['stone-button-wall-source'], pack.materials,
          pack.bindings['stone-button-wall-source'], [-4.5, 1.3, 0], 1.6));
        door = addAsset(pack.assets['iron-door-source'], pack.materials, pack.bindings['iron-door-source'], [2.2, 0, 0], 1.65);
        update(optionsRef.current); await resources.surfaces.ready(); if (!alive) return;
        canvas.dataset.ready = resources.surfaces.warnings.size ? 'fallback' : 'ready';
        modelStatus = resources.surfaces.warnings.size ? [...resources.surfaces.warnings].join(' · ') : 'Curated TileLab textures · lever, button and composite door · pinned source geometry';
        if (current.exhibit !== 'architecture' && current.exhibit !== 'shelving') setStatus(modelStatus);
      } catch (e) { if (alive && !controller.signal.aborted) { canvas.dataset.ready = 'native-only'; modelStatus = e instanceof Error ? e.message : 'Model pack unavailable'; if (current.exhibit !== 'architecture' && current.exhibit !== 'shelving') setStatus(modelStatus); } }
    })();
    return () => {
      alive = false; controller.abort(); cancelAnimationFrame(frame); workshop.current = undefined; clear(); resize.disconnect(); orbit.dispose();
      window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', clear);
      document.removeEventListener('focusin', focus); document.removeEventListener('visibilitychange', visibility);
      canvas.removeEventListener('pointerdown', pointerDown); canvas.removeEventListener('pointermove', pointerMove); canvas.removeEventListener('pointerup', pointerUp);
      architecture.dispose(); shelving.dispose(); for (const model of models) model.dispose(); resources.dispose(); for (const g of ownedGeometry) g.dispose(); for (const m of ownedMaterial) m.dispose();
      renderer.dispose(); canvas.remove();
    };
  }, []);
  const change = <K extends keyof Options>(key: K, value: Options[K]) => setOptions(old => ({ ...old, [key]: value }));
  return <main className="model-workshop">
    <header><div><p className="workshop-kicker">MAZE BATTLE · MODEL WORKSHOP</p><h1>Models & stair assemblies</h1><p role="status">{status}</p></div><a href="?view=stage3d">Return to game</a></header>
    <div className="workshop-layout"><aside>
      <label>Exhibit<select aria-label="Exhibit" value={options.exhibit} onChange={e => change('exhibit', e.target.value as Exhibit)}><option value="models">Lever & door proof</option><option value="stairs">Stair assembly · S1</option><option value="walk">Two-level walk fixture · S2</option><option value="architecture">Architecture & lighting</option><option value="shelving">Bookcases & shelving</option></select></label>
      {options.exhibit === 'shelving' && <>
        <label>Shelving<select aria-label="Shelving model" value={options.shelf} onChange={e => change('shelf', e.target.value as ShelvingKind)}>{SHELVING_KINDS.map(kind => <option key={kind} value={kind}>{SHELVING[kind].label}</option>)}</select></label>
        {options.shelf === 'cabinet' && <label><input type="checkbox" checked={options.active} onChange={e => change('active', e.target.checked)} /> Open cabinet doors</label>}
        <p>Compare book size with the 2.7-unit character. Drag to orbit; scroll to zoom.</p>
        <p>Books are decorative. Cabinet doors can be inspected open or closed here.</p>
      </>}
      {options.exhibit !== 'architecture' && options.exhibit !== 'shelving' && <><label><input type="checkbox" checked={options.active} onChange={e => change('active', e.target.checked)} /> Lever on / door open</label>
      <label><input type="checkbox" checked={options.wood} onChange={e => change('wood', e.target.checked)} /> Alternate native materials</label></>}
      <label><input type="checkbox" checked={options.wireframe} onChange={e => change('wireframe', e.target.checked)} /> Wireframe</label>
      {options.exhibit === 'architecture' && <>
        <label><input type="checkbox" checked={options.markers} onChange={e => change('markers', e.target.checked)} /> Bounds, anchors & clearances</label>
        <label><input type="checkbox" checked={options.dim} onChange={e => change('dim', e.target.checked)} /> Low light</label>
        <label><input type="checkbox" checked={options.playing} onChange={e => change('playing', e.target.checked)} /> Animate lantern</label>
        <button onClick={() => { change('playing', false); workshop.current?.step(); }}>Next lantern frame</button>
        <button onClick={() => workshop.current?.view('lantern')}>Lantern close-up</button>
        <p>Preview scale 1.5. Green boxes reserve the opening and headroom; blue boxes show bounds. The column is 2.7 units high.</p>
        <p>Stone and iron are color placeholders. Lantern artwork is the original reference. These candidates are shown for inspection before game placement.</p>
      </>}
      {options.exhibit !== 'architecture' && options.exhibit !== 'shelving' && <label><input type="checkbox" checked={options.cutaway} onChange={e => change('cutaway', e.target.checked)} /> Cutaway upper deck</label>}
      <div className="workshop-buttons">{(['front', 'back', 'left', 'right'] as const).map(view => <button key={view} disabled={options.exhibit === 'walk'} onClick={() => workshop.current?.view(view)}>{view}</button>)}</div>
      {options.exhibit !== 'architecture' && options.exhibit !== 'shelving' && <div className="workshop-buttons"><button onClick={() => workshop.current?.view('lower')}>Lower landing</button><button onClick={() => workshop.current?.view('upper')}>Upper landing</button></div>}
      {options.exhibit === 'walk' && <button onClick={() => workshop.current?.faceStairs()}>Face stairs</button>}
      {options.exhibit !== 'shelving' && <p>{options.exhibit === 'architecture' ? 'Drag to orbit; scroll to zoom. Inspect both sides of the handle and the reserved spaces.' : options.exhibit === 'walk' ? 'WASD / arrows walk. Drag to look. Stop and reverse freely. This is an isolated locomotion fixture; it does not change your game.' : 'Drag to orbit; scroll to zoom. Both levers share off/on controls. The door is one hinged upper/lower assembly.'}</p>}
      {options.exhibit !== 'architecture' && options.exhibit !== 'shelving' && <p>Stair rise 4.68 · run 7.56 · width 1.8 · 18 treads. The reference column is a 2.7-unit character height.</p>}
      {options.exhibit !== 'shelving' && <p>Native models use plain materials. Source model geometry and UVs remain pinned independently of material revisions.</p>}
      {options.exhibit === 'models' && <p>Left: imported lever. Center: native lever. Right: composite door and height reference.</p>}
    </aside><section className="workshop-stage" ref={container}>{error && <p role="alert">{error}</p>}</section></div>
  </main>;
}
