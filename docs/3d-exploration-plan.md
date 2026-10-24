# Canonical 3D exploration — rolling implementation plan

## Objective and boundary

Implement the owner's approved three bounded slices, with first-person traversal at least matching the core MazeQuest `basic_room` experiment: connected textured rooms/passages, mouse look, collision-aware movement, navigation/map continuity and game-owned interactions. Retain the canonical 2D generator and GameSession as authority. All procedural results must replay from a seeded RNG and stable versioned inputs; rendering must not consume gameplay randomness.

Long-horizon attachment context informs separation of scene data, geometry, clearance and interaction references. It does not authorize an editor, voxel mutation system, settlement simulation, new NPC cognition, multiplayer, BookForge/Agentica changes, or a new world persistence format. Actual stacked floors, jumping, and new mechanism rules are later work; existing stairs remain canonical transitions.

## Checkout and integration custody

- Isolated worktree: `C:\Users\Zythis\.codex\worktrees\canonical-3d-exploration\maze-battle`.
- Initial canonical base: `46ff005cd0dd8c0871482b5e7eb6a803db82afc1`, containing the owner's `1d00fff` checkpoint.
- Integrated canonical base: `eb9975395d0ffbf25ea6d08ed3855b3cb248c8a9`. Rebase completed cleanly; final fetch still points to this pushed base. Other worktrees and the in-flight local canonical branch were not changed.
- Qualified source/test candidate: `98cb7cc7423698a72a272224c7ebbaad049aa5e9`; implementation commits `ae5c212` (asset components) and `73fa8b7` (canonical stage). The closeout commit adds documentation and fixes the reporter output path only.
- Visual reference: asset-lab commit `69a63b4`; port graphics/import components selectively, never the retired App, hooks or save writers.
- The canonical branch is in flight. Fetch and compare at meaningful integration boundaries, record the resulting frozen base, and rebase our isolated lane when necessary. Do not change another worktree or move its branch.
- Keep the old showroom/server available as reference. Use separate development/test ports and disposable browser state for qualification. No paid image or model calls, push, merge or owner-data reset.

## Acceptance and current work

| Slice | Completion condition | Status |
| --- | --- | --- |
| 1. Canonical 3D exploration | Existing App exposes a 3D view using disclosed observation data; smooth movement and mouse look; exact canonical position/map agreement; current ownership/recovery controls; return to 2D. | COMPLETE for the bounded slice |
| 2. Walkable procedural rooms | Continuous planar movement with shared scene/collision descriptions, safe cell/opening crossings, deterministic room/passage detailing, existing chest and stairs bindings; replay and reload checks. | COMPLETE for the bounded slice |
| 3. Populated visual environment | Reuse admitted player appearances and coherent room props within existing state contracts. No invented NPC authority or new mechanism gameplay. Bound resource use and qualify the connected stage. | COMPLETE for the bounded slice |

Selected verification: pure compiler/RNG/collision tests; canonical UI/command integration and denied/stale movement checks; real browser traversal, collision, mouse/keyboard/touch input, map/2D parity, chest state, reload, context recovery and resource lifetime. Check the affected canonical tests, production/fixture types and build. Qualify one frozen integrated candidate; retain failed attempts and exact limits. Existing canonical closeout sprints remain separate from this 3D feature.

## Decisions and findings

- The old asset-lab projection consumes retired `MazeState`. The canonical App consumes bounded `GameView.observation` and current/remembered perception. The new view needs an observation-native adapter, not a cast to the old full maze.
- Disclosed edge states are three-way: absent means unknown, null means wall, a target means an observed connection. Unknown edges must not become physical permission to walk.
- Continuous sub-cell pose can be presentation-local while gameplay remains cell-based. Every cell crossing must be accepted by the existing serialized command path; reject or recover to the committed cell. Crossing must not generate per-frame commands, duplicate collections or hidden observations.
- Rendering, collision, clearance and prop references should derive from a small plain scene description suitable for a later schematic consumer. This task does not implement the future authoring format/editor.
- The native 32×2048² glowstone experiment needs about 512 MiB decoded and was reported to lag. Exclude it from the playable stage and load only assets used there.

## Execution record

- Goal created; attachment and current canonical interfaces inspected.
- New managed worktree created at the canonical base; old worktree and original checkout preserved.
- Selectively ported materials, importers, chest and humanoid components with MIT notice; native artwork copied locally and ignored. The stage requests only used static materials and one selected player skin; glowstone is not loaded.
- Implemented observation-native plain scene data, seeded wall-side detail, shared visual/collision boxes, swept planar traversal, one awaited canonical crossing, drag/pointer-lock look, touch movement, explicit stairs, map/2D toggle and a follow-player appearance preview. No new NPC authority or editor was introduced.
- First production build PASS. Initial focused set: 76 PASS / six new fixture failures; those failures were invalid observation graph metadata/indexes, now corrected and the seven scene/collision tests PASS.
- Independent input regression lane exposed movement after graphics failure and OS key-repeat rearming after cancellation. Both implementation defects were fixed; all ten input tests now PASS. This is mock-GPU input qualification, not a browser claim.
- First browser cohort: desktop movement/map/reload and walls/dialog/context recovery PASS; mobile camera test failed because its bounded drag helper could not turn far enough, and the random-world chest search did not reach a chest within 36 moves. These remain FAIL pending fixture/helper reconciliation, not discarded evidence.
- Actual canonical preview at `http://127.0.0.1:5196/?view=stage3d` renders textured disclosed rooms. A real UI-held W advanced the canonical actor from world (4,4) to (5,4). Owned Vite session 79257; separate browser-test port 5206. Old asset preview remains on 5186.
- Upstream advanced four commits to `eb99753` during implementation; align this isolated lane before final qualification.
- Second browser cohort: all four tests PASS (1.1 minutes), covering actual generated-world desktop/mobile movement and persistence, the authored canonical corpus through two passages and a normally prepared treasure chest, explicit next-floor stairs, walls/dialog cancellation and graphics recovery. The corpus is test-only genesis in a fresh browser origin, not an alternate production world reader/writer.
- Focused set reached 93 PASS. Independent final review found a second-queue stale-cell gap, stale stairs recovery and retained camera settings not applied after recreation. Added a source-cell precondition at the serialized GameSession dispatch point; stale intents reject without poisoning custody. The precondition is local admission data, never a game/save schema field. Explicit stairs use the same guard, and graphics recreation restores camera/appearance settings.
- Expanded regression set initially had 152 PASS / two new fixture FAIL: the test mutated the source captured by its own delayed commit. Captured the destination independently; the affected 48 tests now PASS. Production types/build PASS after these fixes; final integrated rerun remains pending.
- Removed unused copies of the showroom UI from this lane. The existing showroom remains available in the preserved asset-lab checkout; only its reusable asset contracts, importers, chest and humanoid implementation are ported.
- Final rebased qualification PASS: 154 tests across 12 focused files, four browser tests (1440×960 and 390×844 generated-world movement/map/reload/return-to-2D controls, authored connected chest/stairs journey, and wall/dialog/context recovery), production types/build, and dedicated browser-fixture types. Additional existing seeded-module checks PASS: 114 tests across four files, including deterministic incremental/eager agreement and retained baseline hashes.
- Independent final source review found no remaining blockers in the source-cell guard, stale-stairs cancellation or graphics recreation fixes. This is source review alongside the parent-owned tests, not separate live-runtime proof.
- Visually inspected live stage and the captured chest/mobile/next-floor images. The inspected live scene disclosed 89 cells, with 94 submitted draw calls, 94 uploaded geometries and seven GPU textures. These are one local scene's counters, not a cross-device FPS guarantee. Browser requests confirm no glowstone frames loaded.

### Edge cases and scope findings

- `GameSession.execute` can return the original stairs receipt after extra floor preparation/transition commands. Reconcile from its final published GameView, not that receipt's revision alone.
- The geometry recipe is seeded/versioned (`modules-v3`); ordinary chest loot uses separate runtime randomness. Geometry replay is in scope; full game-event replay is not claimed or silently rewritten here.
- Follow-player camera and selecting a local appearance implement the bounded visual part of slice 3. Adding authoritative NPC entities/mechanisms would expand scope and is deferred.
- Authoritative observation metadata has a source index into observed cells, not a space ordinal. Test fixtures must preserve that evidence contract.
- Two serialized queues exist: manual UI intents and GameSession writers. A source-cell check before `controller.execute` is insufficient; check again after prior writers finish. An expected stale input must cancel without entering storage recovery.
- Confirmed-wall decorations are generated independently of shared wall ownership, so revealing a neighbouring cell cannot remove an existing shelf. Openings and unknown edges receive no decorative blockers.

## Components and replay contract

- `src/components/maze3d/scene.ts`: versioned plain `StageScene`/`SceneBox` description compiled exclusively from current disclosed cells. Unknown boundaries are opaque/solid. Visuals and planar collision share these dimensions. The compiler sorts cell inputs and seeds its own RNG from stable disclosed identities; it never consumes gameplay `Math.random` or a hidden world map.
- `movement.ts`: swept circle movement, wall sliding, bounded frame delta, one pending canonical crossing and final-state reconciliation. Sub-cell pose stays local; only accepted cell crossings write through the existing command path.
- `StageRenderer.ts` and `CanonicalStage3D.tsx`: one lazy renderer with drag/pointer-lock look, keyboard and touch buttons, context restart, static TileLab materials, animated chest state, optional follow-player camera and five generated appearance choices. Geometry outside current disclosure is disposed; asset caches belong to the renderer and are disposed with it.
- `ExploreScreen`, `App`, `useGameCommands` and `GameSession`: view toggle, earned-map continuity, explicit stairs, custody/dialog cancellation, and source-cell admission guards. No alternate game writer, navigation/collision rule change, save schema change or NPC actor authority was added.
- Preserve the stored `modules-v3` recipe (seed, policy/version and world inputs) to replay topology. Preserve `canonical-stage-v1` and the pinned asset revisions to replay this visual compiler. Changing the visual algorithm should change its version. A seed picker/export UI and full event/loot replay are not implemented here.

## Running and local artwork

From this worktree, run `npm ci`, then `npm run dev -- --host 127.0.0.1 --port 5196 --strictPort` and open `http://127.0.0.1:5196/?view=stage3d`. The current server is left running. The normal canonical App also exposes the **3D view** toggle. WASD/arrows walk, dragging looks, optional mouse capture uses Escape to release, E opens the chest on the committed tile, M opens the earned map, and stair buttons deliberately transition floors.

Native artwork is local and ignored by Git. Existing local copies are already installed. For a fresh worktree, create `public/assets/material-packs` and `public/assets/character-skins`, then use these pinned imports (omit `--write` for a dry run):

```powershell
npm run assets:import -- --source "D:\maze-quest\MazeQuestTileLab\output\run-20261023-132932-8b1964e4" --only stone_bricks,cobblestone,basalt,bookshelf --write
npm run assets:import -- --source "D:\maze-quest\MazeQuestTileLab\output\run-20261023-145244-d29c8880" --selection scripts/asset-selections/dungeon-occult-01-chest.json --write
npm run assets:import-skin -- --source "D:\maze-quest\MazeQuestTileLab\output" --selection scripts/asset-selections/humanoid-gallery.json --write
```

Imports pin reports/image hashes and reject changed source bytes; do not repin silently if a TileLab run changes. No entire catalog import or new artwork generation occurs. Additional assets from the old pack remain local, but this playable scene never requests the 32-frame glowstone experiment. Without local artwork the stage uses material fallbacks and the optional appearance controls may be absent. Required adapted-source MIT attribution is in `THIRD_PARTY_NOTICES/skinview3d-LICENSE.txt`.

## Verification and retained evidence

```powershell
npm test -- src/components/maze3d src/assets3d src/components/ExploreScreen.test.tsx src/hooks/useGameCommands.test.tsx src/hooks/useCanonicalMovement.test.tsx src/services/game/GameSession.agentic.test.ts src/services/game/GameSession.recovery.test.ts --maxWorkers=2
npm test -- src/domain/expedition/topology/modules --maxWorkers=2
npx playwright test --config tests/e2e/canonical-3d.config.ts
npx tsc --project tests/e2e/canonical-3d.tsconfig.json
npm run build
```

The browser fixture binds port 5206 and creates authored topology only in a fresh disposable database before importing the actual App. The two production-route browser cases use the actual generator. The fixed corpus journey is explicitly authored evidence, not a claim that every random floor was exhaustively traversed.

Evidence directory: `C:\Users\Zythis\.codex\visualizations\2026\10\23\01a16a2c-da7b-7042-9108-3dbbc26da0f6\canonical-3d`. `attempt-1` retains failing traces/screenshots; `attempt-2` retains the first all-pass cohort; `qualified` contains final screenshots and the JSON report. Logs include `final-unit.log`, `final-browser.log`, `final-build.log`, and `seeded-modules.log`; `live-stage.png` captures the user-facing preview. Browser screenshots include first-person, follow-player, earned map, closed/open chest, stairs, next floor, mobile layout and recovered stage. Subsequent Playwright runs overwrite `test-results`, so these copies are separate.

Remaining limits: planar movement only; stairs are explicit transitions rather than physical vertical geometry; camera/appearance and sub-cell pose are presentation-local; a single follow-player appearance represents no new NPC identity/state. Touch buttons are implemented, but the mobile browser cohort qualifies responsive layout and keyboard/drag input, not physical phone hardware. Full cross-device FPS/memory profiling and the entire canonical regression suite were not run. The lazy Three.js chunk is about 574 kB minified; Vite retains its size warning. The context-loss test emits a benign disposal warning after intentionally losing WebGL; recovery and old-canvas removal pass.

## Next

The approved goal is complete locally; nothing was pushed or merged. The next recommended slice is a small versioned prefab/schematic placement contract using the shared scene dimensions, explicit door clearance, collision bounds and canonical interaction references. Add one authored library room and seeded replay fixture before an editor. Keep NPC identity/authority and behavior separate. Re-fetch the in-flight canonical branch before the next implementation slice.

## Follow-up fixes — 2026-10-24

The owner reported missing textures after 3D → 2D → 3D and misaligned masonry above doorways. The live preview server was no longer listening on 5196: the loaded page still worked, but remounting could not fetch its manifests. Restarted Vite as a hidden background process independent of the earlier terminal session. Material loading now distinguishes `ready` from `fallback`; unavailable textures show a visible warning and **Retry materials** instead of silently passing the ready check.

Doorway jambs and lintels previously repeated the masonry image relative to each box, restarting the brick rows at the lintel's raised bottom. Tileable box faces now share a 1.6-unit spatial UV grid across full walls, partial walls and floor cells. Chest/skin atlases and bounded bookshelf faces retain their own UVs. This changes rendering only; canonical geometry, collision dimensions and interaction state remain unchanged.

Verification: 51 focused component/asset tests PASS; five browser tests PASS, including four repeated round trips with identical rendered canvas images, an intentionally refused manifest request, visible fallback status, and successful texture recovery. Dedicated UV seam tests cover both sides of X/Z walls and adjacent floors. Production build and browser-fixture types PASS. The first build exposed a test-only Three.js attribute type mismatch, corrected by reading the UV components directly. The existing build-size warning and intentional context-loss disposal warning remain.

Live visual inspection confirms restored textures and aligned door headers. Follow-up evidence is under `canonical-3d/fixes-20261024` in the evidence directory above, including `aligned-doorway.png`, the five-test JSON report and browser screenshots. No assets were regenerated, and no other checkout was modified.
