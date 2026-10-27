import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { planRoomConstruction } from '../../domain/construction/roomPlan';
import type { RoomConstructionBrief } from '../../domain/construction/types';
import { ConstructionResources, ConstructionVisual } from './constructionVisual';
import './modelWorkshop.css';

type Options = { purpose: 'empty' | 'library'; rows: 3 | 5; columns: 3 | 5; cutaway: boolean; bearings: boolean };
interface Controls { update(options: Options): void; view(kind: 'orbit' | 'overhead' | 'eye'): void }
/** Complete authoring workspace: it never reads or writes the player's canonical save. */
export default function ConstructionWorkshop() {
  const [options, setOptions] = useState<Options>({ purpose: 'empty', rows: 3, columns: 3, cutaway: true, bearings: false });
  const [status, setStatus] = useState('Loading selected materials…'), [error, setError] = useState('');
  const host = useRef<HTMLDivElement>(null), controls = useRef<Controls | undefined>(undefined);
  const current = useRef(options); current.current = options;
  useEffect(() => { controls.current?.update(options); }, [options]);
  useEffect(() => {
    let alive = true, frame = 0, resources: ConstructionResources | undefined, visual: ConstructionVisual | undefined;
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
      const size = Math.max(current.current.columns, current.current.rows) * 3.2;
      if (kind === 'eye') { orbit.target.set(0, 2.25, -size / 2); camera.position.set(0, 2.25, size / 2 - 1); }
      else if (kind === 'overhead') { orbit.target.set(0, 0, 0); camera.position.set(0, size * 1.8, .001); }
      else { orbit.target.set(0, 2, 0); camera.position.set(size, size * .8, size * 1.25); }
      camera.lookAt(orbit.target); orbit.update();
    };
    let lastSize = '', revision = 0;
    const update = (next: Options) => {
      if (!resources || !alive) return;
      const key = JSON.stringify([next.rows, next.columns, next.purpose]);
      if (canvas.dataset.planKey !== key) {
        visual?.dispose(); clearMarkers(); canvas.dataset.ready = 'loading'; setError('');
        const brief: RoomConstructionBrief = { id: 'room-proof', seed: 42, rows: next.rows, columns: next.columns, purpose: next.purpose };
        const plan = planRoomConstruction(brief);
        visual = new ConstructionVisual(plan, resources); scene.add(visual.root);
        for (const anchor of plan.anchors.filter(a => a.supportedBy)) {
          const dot = new THREE.Mesh(markerGeometry, markerMaterial); dot.position.set(...anchor.position); markers.add(dot);
        }
        canvas.dataset.planKey = key; canvas.dataset.members = String(plan.members.length);
        canvas.dataset.furnishings = String(plan.furnishings.length);
        canvas.dataset.memberIds = JSON.stringify(plan.members.map(m => m.id));
        canvas.dataset.bearings = String(plan.anchors.filter(a => a.supportedBy).length);
        const sizeKey = JSON.stringify([next.rows, next.columns]); if (sizeKey !== lastSize) { lastSize = sizeKey; view('orbit'); }
        const version = ++revision;
        void resources.ready().then(() => {
          if (!alive || revision !== version) return; canvas.dataset.ready = 'ready';
          setStatus(`${plan.members.length} construction members · ${plan.furnishings.length} bookcases · selected textures ready`);
        }).catch(e => { if (alive && revision === version) { canvas.dataset.ready = 'unavailable'; setError(String(e)); } });
      }
      visual?.cutaway(next.cutaway); markers.visible = next.bearings;
      canvas.dataset.cutaway = String(next.cutaway);
    };
    controls.current = { update, view };
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
      visual?.dispose(); resources?.dispose(); clearMarkers(); markerGeometry.dispose(); markerMaterial.dispose();
      reference.geometry.dispose(); reference.material.dispose(); renderer.dispose(); canvas.remove();
    };
  }, []);
  const change = <K extends keyof Options>(key: K, value: Options[K]) => setOptions(o => ({ ...o, [key]: value }));
  return <main className="model-workshop">
    <header><div><p className="workshop-kicker">MAZE BATTLE · CONSTRUCTION WORKSHOP</p><h1>Purposeful assemblies</h1><p role="status">{status}</p></div><a href="?view=stage3d">Return to game</a></header>
    <div className="workshop-layout"><aside>
      <label>Room program<select aria-label="Room program" value={options.purpose} onChange={e => change('purpose', e.target.value as Options['purpose'])}>
        <option value="empty">Empty chamber</option><option value="library">Library</option>
      </select></label>
      <label>Width<select aria-label="Assembly width" value={options.columns} onChange={e => change('columns', Number(e.target.value) as 3 | 5)}>
        <option value="3">9.6 world units</option><option value="5">16 world units</option>
      </select></label>
      <label>Depth<select aria-label="Assembly depth" value={options.rows} onChange={e => change('rows', Number(e.target.value) as 3 | 5)}>
        <option value="3">9.6 world units</option><option value="5">16 world units</option>
      </select></label>
      <label><input type="checkbox" checked={options.cutaway} onChange={e => change('cutaway', e.target.checked)} /> Cutaway roof and front wall</label>
      <label><input type="checkbox" checked={options.bearings} onChange={e => change('bearings', e.target.checked)} /> Show support bearings</label>
      <div className="workshop-buttons">{(['orbit', 'overhead', 'eye'] as const).map(view => <button key={view} onClick={() => controls.current?.view(view)}>{view === 'eye' ? 'Eye level' : view === 'overhead' ? 'Overhead' : 'Orbit view'}</button>)}</div>
      <p>Drag to orbit; scroll to zoom. The green column is 2.7 units high.</p>
      <p>Library bays reserve storage and access before framing. The bookcases use the selected procedural shelving delivery.</p>
      <p>Complete authoring preview. This workspace does not change your game or reveal undiscovered rooms. Construction rules and style are provisional.</p>
    </aside><section className="workshop-stage" ref={host}>{error && <p role="alert">{error}</p>}</section></div>
  </main>;
}
