import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { RoomConstructionBrief } from '../../domain/construction/types';
import { ConstructionResources, constructionBounds } from './constructionVisual';
import { buildAuthoringAssembly, type AuthoringAssemblyKind, type AuthoringVisual } from './authoringAssemblies';
import { bakePortableConstruction, disposePortableConstruction, reimportPortableConstruction, type PortableConstruction } from './portableConstruction';
import './modelWorkshop.css';

type Options = { assembly: AuthoringAssemblyKind; purpose: 'empty' | 'library'; rows: 3 | 5; columns: 3 | 5; cutaway: boolean; bearings: boolean; lowerStorey: boolean };
interface Controls { update(options: Options): void; view(kind: 'orbit' | 'overhead' | 'eye'): void;
  bake(): Promise<PortableConstruction>; preview(): Promise<void> }
/** Complete authoring workspace: it never reads or writes the player's canonical save. */
export default function ConstructionWorkshop() {
  const [options, setOptions] = useState<Options>({ assembly: 'room', purpose: 'empty', rows: 3, columns: 3, cutaway: true, bearings: false, lowerStorey: false });
  const [status, setStatus] = useState('Loading selected materials…'), [error, setError] = useState('');
  const [busy, setBusy] = useState(false), [ready, setReady] = useState(false);
  const host = useRef<HTMLDivElement>(null), controls = useRef<Controls | undefined>(undefined);
  const current = useRef(options); current.current = options;
  useEffect(() => { controls.current?.update(options); }, [options]);
  useEffect(() => {
    let alive = true, frame = 0, resources: ConstructionResources | undefined, visual: AuthoringVisual | undefined;
    let imported: THREE.Group | undefined, extent = 9.6, depthCenter = 0;
    const abort = new AbortController(), container = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const canvas = renderer.domElement; canvas.setAttribute('aria-label', 'Construction assembly workshop'); container.append(canvas);
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#151b23');
    const camera = new THREE.PerspectiveCamera(50, 1, .05, 200), orbit = new OrbitControls(camera, canvas);
    orbit.enableDamping = true; orbit.minDistance = .5; orbit.maxDistance = 80;
    scene.add(new THREE.HemisphereLight('#e5efff', '#5f5141', 2.8));
    const sun = new THREE.DirectionalLight('#ffe9ce', 3); sun.position.set(8, 15, 12); scene.add(sun);
    const fill = new THREE.DirectionalLight('#b8d6ff', 1.5); fill.position.set(-10, 8, -8); scene.add(fill);
    const reference = new THREE.Mesh(new THREE.BoxGeometry(.4, 2.7, .4), new THREE.MeshStandardMaterial({ color: '#abc4b0' }));
    reference.position.set(1.2, 1.35, .8); scene.add(reference);
    const markers = new THREE.Group(); scene.add(markers);
    const markerGeometry = new THREE.SphereGeometry(.06, 6, 4), markerMaterial = new THREE.MeshBasicMaterial({ color: '#f1bd66' });
    const clearMarkers = () => markers.clear();
    const view = (kind: 'orbit' | 'overhead' | 'eye') => {
      const size = extent;
      if (kind === 'eye' && current.current.assembly === 'stairwell') { orbit.target.set(0, 3.4, 8); camera.position.set(0, 2.25, -2); }
      else if (kind === 'eye' && current.current.assembly === 'building') { orbit.target.set(0, 2.25, -6); camera.position.set(0, 2.25, 6.8); }
      else if (kind === 'eye' && current.current.assembly === 'street') { orbit.target.set(0, 3.8, 0); camera.position.set(0, 2.25, 25); }
      else if (kind === 'eye') { orbit.target.set(0, 2.25, -size / 2); camera.position.set(0, 2.25, size / 2 - 1); }
      else if (kind === 'overhead') { orbit.target.set(0, 0, depthCenter); camera.position.set(0, size * 1.8, depthCenter + .001); }
      else { orbit.target.set(0, current.current.assembly === 'cabinet' ? .9 : 2, depthCenter); camera.position.set(size, size * .8, depthCenter + size * 1.25); }
      camera.lookAt(orbit.target); orbit.update();
    };
    let lastSize = '', revision = 0;
    const update = (next: Options) => {
      if (!resources || !alive) return;
      const key = JSON.stringify([next.assembly, next.rows, next.columns, next.purpose]);
      if (canvas.dataset.planKey !== key) {
        visual?.dispose(); if (imported) { disposePortableConstruction(imported); imported = undefined; }
        canvas.dataset.reimported = 'false'; clearMarkers(); canvas.dataset.ready = 'loading'; setError(''); setReady(false);
        const brief: RoomConstructionBrief = { id: 'room-proof', seed: 42, rows: next.rows, columns: next.columns, purpose: next.purpose };
        const built = buildAuthoringAssembly(next.assembly, brief, resources), plan = built.plan;
        visual = built.visual; scene.add(visual.root);
        for (const anchor of plan?.anchors.filter(a => a.supportedBy) ?? []) {
          const dot = new THREE.Mesh(markerGeometry, markerMaterial); dot.position.set(...anchor.position); markers.add(dot);
        }
        canvas.dataset.planKey = key; canvas.dataset.members = String(plan?.members.length ?? 0);
        canvas.dataset.furnishings = String(plan?.furnishings.length ?? 0);
        canvas.dataset.memberIds = JSON.stringify(plan?.members.map(m => m.id) ?? []);
        canvas.dataset.bearings = String(plan?.anchors.filter(a => a.supportedBy).length ?? 0);
        reference.visible = next.assembly === 'room';
        const bounds = constructionBounds(visual.root);
        extent = Math.max(...bounds.max.map((v, i) => v - bounds.min[i])); depthCenter = (bounds.max[2] + bounds.min[2]) / 2;
        const sizeKey = JSON.stringify([next.assembly, next.rows, next.columns]); if (sizeKey !== lastSize) { lastSize = sizeKey; view('orbit'); }
        const version = ++revision;
        void resources.ready().then(() => {
          if (!alive || revision !== version) return; canvas.dataset.ready = 'ready';
          setReady(true); setStatus(plan ? `${plan.members.length} construction members · ${plan.furnishings.length} bookcases · selected textures ready` : next.assembly === 'street' ? 'Two buildings · shared street · selected textures ready' : 'Closed cabinet · selected textures ready');
        }).catch(e => { if (alive && revision === version) { canvas.dataset.ready = 'unavailable'; setError(String(e)); } });
      }
      const lower = ['building', 'street'].includes(next.assembly) && next.lowerStorey;
      visual?.cutaway(next.cutaway, lower); markers.visible = next.bearings;
      if (imported) imported.traverse(n => { n.visible = (!next.cutaway || !n.userData.inspectionHidden) && (!lower || !n.userData.inspectionUpper); });
      canvas.dataset.cutaway = String(next.cutaway);
    };
    const bake = async () => {
      if (!resources) throw Error('Construction resources are not ready');
      const next = { ...current.current }, brief: RoomConstructionBrief = { id: 'room-proof', seed: 42, rows: next.rows, columns: next.columns, purpose: next.purpose };
      const source = buildAuthoringAssembly(next.assembly, brief, resources);
      try { return await bakePortableConstruction(source.visual.root, resources); } finally { source.visual.dispose(); }
    };
    const preview = async () => {
      const result = await bake(), loaded = await reimportPortableConstruction(result.bytes);
      if (!alive) { disposePortableConstruction(loaded); return; }
      if (imported) disposePortableConstruction(imported); imported = loaded; scene.add(loaded);
      if (visual) visual.root.visible = false;
      const lower = ['building', 'street'].includes(current.current.assembly) && current.current.lowerStorey;
      loaded.traverse(n => { n.visible = (!current.current.cutaway || !n.userData.inspectionHidden) && (!lower || !n.userData.inspectionUpper); });
      canvas.dataset.reimported = 'true'; canvas.dataset.exportSha256 = result.sha256;
      setStatus('Portable GLB reimported with the standard loader');
    };
    controls.current = { update, view, bake, preview };
    void ConstructionResources.load(abort.signal).then(value => {
      if (!alive) { value.dispose(); return; } resources = value; update(current.current);
    }).catch(e => { if (alive) { canvas.dataset.ready = 'unavailable'; setError(String(e)); } });
    const resize = new ResizeObserver(() => {
      const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    }); resize.observe(container);
    const render = () => {
      if (!alive) return; orbit.update(); renderer.render(scene, camera);
      canvas.dataset.geometries = String(renderer.info.memory.geometries); canvas.dataset.textures = String(renderer.info.memory.textures);
      frame = requestAnimationFrame(render);
    }; frame = requestAnimationFrame(render);
    return () => {
      alive = false; abort.abort(); cancelAnimationFrame(frame); controls.current = undefined; resize.disconnect(); orbit.dispose();
      visual?.dispose(); if (imported) disposePortableConstruction(imported); resources?.dispose(); clearMarkers(); markerGeometry.dispose(); markerMaterial.dispose();
      reference.geometry.dispose(); reference.material.dispose(); renderer.dispose(); canvas.remove();
    };
  }, []);
  const change = <K extends keyof Options>(key: K, value: Options[K]) => setOptions(o => ({ ...o, [key]: value }));
  const portable = async (preview: boolean) => {
    if (!controls.current) return; setBusy(true); setError('');
    try {
      if (preview) await controls.current.preview();
      else {
        const result = await controls.current.bake(), url = URL.createObjectURL(new Blob([result.bytes], { type: 'model/gltf-binary' }));
        const a = document.createElement('a'); a.href = url; a.download = `${options.assembly}-${result.cacheKey.slice(0, 12)}.glb`; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setStatus(`Portable GLB ready · ${result.meshes} meshes · ${result.textures} embedded textures`);
      }
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  };
  return <main className="model-workshop">
    <header><div><p className="workshop-kicker">MAZE BATTLE · CONSTRUCTION WORKSHOP</p><h1>Purposeful assemblies</h1><p role="status">{status}</p></div><a href="?view=stage3d">Return to game</a></header>
    <div className="workshop-layout"><aside><fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <label>Assembly<select aria-label="Construction assembly" value={options.assembly} onChange={e => change('assembly', e.target.value as AuthoringAssemblyKind)}>
        <option value="room">Framed room</option><option value="stairwell">Two-level stairwell</option><option value="cabinet">Closed cabinet</option><option value="building">Two-storey building</option><option value="street">Building pair and street</option>
      </select></label>
      {['room', 'building', 'street'].includes(options.assembly) && <>
      <label>Room program<select aria-label="Room program" value={options.purpose} onChange={e => change('purpose', e.target.value as Options['purpose'])}>
        <option value="empty">Empty chamber</option><option value="library">Library</option>
      </select></label>
      </>}
      {options.assembly === 'room' && <>
      <label>Width<select aria-label="Assembly width" value={options.columns} onChange={e => change('columns', Number(e.target.value) as 3 | 5)}>
        <option value="3">9.6 world units</option><option value="5">16 world units</option>
      </select></label>
      <label>Depth<select aria-label="Assembly depth" value={options.rows} onChange={e => change('rows', Number(e.target.value) as 3 | 5)}>
        <option value="3">9.6 world units</option><option value="5">16 world units</option>
      </select></label>
      </>}
      <label><input type="checkbox" checked={options.cutaway} onChange={e => change('cutaway', e.target.checked)} /> Cutaway roof and front wall</label>
      {['building', 'street'].includes(options.assembly) && <label><input type="checkbox" checked={options.lowerStorey} onChange={e => change('lowerStorey', e.target.checked)} /> Inspect lower storey</label>}
      <label><input type="checkbox" checked={options.bearings} onChange={e => change('bearings', e.target.checked)} /> Show support bearings</label>
      <div className="workshop-buttons">{(['orbit', 'overhead', 'eye'] as const).map(view => <button key={view} onClick={() => controls.current?.view(view)}>{view === 'eye' ? 'Eye level' : view === 'overhead' ? 'Overhead' : 'Orbit view'}</button>)}</div>
      <div className="workshop-buttons"><button disabled={!ready || busy} onClick={() => void portable(false)}>Download GLB</button><button disabled={!ready || busy} onClick={() => void portable(true)}>Preview GLB</button></div>
      </fieldset>
      <p>Drag to orbit; scroll to zoom.{options.assembly === 'room' && ' The green column is 2.7 units high.'}</p>
      {options.purpose === 'library' && ['room', 'building', 'street'].includes(options.assembly) && <p>Library bays reserve storage and access before framing. The bookcases use the selected procedural shelving delivery.</p>}
      {options.assembly === 'cabinet' && <p>The export keeps the cabinet closed. Its source recipe retains the moving doors.</p>}
      <p>Complete authoring preview. This workspace does not change your game or reveal undiscovered rooms. Construction rules and style are provisional.</p>
    </aside><section className="workshop-stage" ref={host}>{error && <p role="alert">{error}</p>}</section></div>
  </main>;
}
