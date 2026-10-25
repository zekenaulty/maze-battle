# Canonical 3D exploration — rolling implementation plan

## Objective and boundary

Implement the owner's approved three bounded slices, with first-person traversal at least matching the core MazeQuest `basic_room` experiment: connected textured rooms/passages, mouse look, collision-aware movement, navigation/map continuity and game-owned interactions. Retain the canonical 2D generator and GameSession as authority. All procedural results must replay from a seeded RNG and stable versioned inputs; rendering must not consume gameplay randomness.

Long-horizon attachment context informs separation of scene data, geometry, clearance and interaction references. It does not authorize an editor, voxel mutation system, settlement simulation, new NPC cognition, multiplayer, BookForge/Agentica changes, or a new world persistence format. The completed initial slice is planar and uses canonical stair transitions. The owner has now requested planning for real stacked-floor stairs; the proposed follow-on below does not yet authorize its implementation. Jumping and new mechanism rules remain later work.

## Checkout and integration custody

- Isolated worktree: `C:\Users\Zythis\.codex\worktrees\canonical-3d-exploration\maze-battle`.
- Initial canonical base: `46ff005cd0dd8c0871482b5e7eb6a803db82afc1`, containing the owner's `1d00fff` checkpoint.
- Integrated canonical base: `eb9975395d0ffbf25ea6d08ed3855b3cb248c8a9`. Rebase completed cleanly; final fetch still points to this pushed base. Other worktrees and the in-flight local canonical branch were not changed.
- Qualified source/test candidate: `98cb7cc7423698a72a272224c7ebbaad049aa5e9`; implementation commits `ae5c212` (asset components) and `73fa8b7` (canonical stage). The closeout commit adds documentation and fixes the reporter output path only.
- Visual reference: asset-lab commit `69a63b4`; port graphics/import components selectively, never the retired App, hooks or save writers.
- The canonical branch is in flight. Fetch and compare at meaningful integration boundaries, record the resulting frozen base, and rebase our isolated lane when necessary. Do not change another worktree or move its branch.
- Keep the old showroom/server available as reference. Use separate development/test ports and disposable browser state for qualification. No paid image or model calls, merge or owner-data reset. The owner authorized branch publication on 2026-10-24; push reviewable follow-up commits to `codex/canonical-3d-exploration`.

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

## Movement, fog continuity and issue 10 — 2026-10-24

The owner reported a 2D flash on each step and a stop during continuous 3D movement, and authorized issue #10's player-centered follow camera. Work remains in `codex/canonical-3d-exploration`; the original checkout and both other development worktrees are preserved. Initially rebased the isolated lane onto `2752d7b`; upstream then advanced to `9004acb` with provider qualification tests/docs only. Rebased cleanly onto that frozen base before final qualification; the final fetch still points to `9004acba51b70b2a884787373e115d1cd4dbfa5b`. The canonical owner's task remains active; this does not claim its closeout or authorize its live-provider work.

### Findings and changes

- The perception hook hid all map cells whenever the canonical snapshot changed, then restored them after an asynchronous region query. Project current **already-published** sight immediately instead. Retain old facts as remembered only across an explicit prior-observation link or an identical anchor/witness/knowledge root; scope, generation, game and floor still fence the display. A fork drops retention; an actual evidence read failure still clears the map. No hidden map read or alternate writer is introduced.
- Issue #10: the normal camera follows every step and centers the player at edges, corners and in maps smaller than the viewport. Signed origins allow the surrounding fog/void. Pan/zoom remain local; actual actor movement restores follow on its first rendered frame and retains zoom. A blocked same-position command leaves inspection intact. Explicit overview retains its bounded paged policy. Viewport/hit-test geometry remains in CSS pixels, independent of DPR.
- A 20-cell browser profile initially showed 125 motionless pending frames, with a longest 133.4 ms stop, while RAF remained near 60 FPS (p95 17 ms). Duplicate reads were a small contributor: reusing the observation already validated within the same query/transaction reduced stopped frames to 115. All original observation/witness validation remains; no cross-transaction evidence cache was added. The unused 2D region reader is disabled during ordinary 3D play. Identical renderer snapshots no longer compile twice.
- The main cause was physical motion waiting at each canonical cell boundary. A single admitted step now permits bounded **presentation-only prediction** into its already-disclosed open neighbour, at most 0.8 units beyond the entry plane (about 210 ms at current speed). The captured source bounds cannot drift when React publishes acceptance first. Tangential bounds prohibit diagonal second-cell entry; the final swept pose must cross the plane before a command is admitted. Colliders remain active. No second command, new sight, checkpoint mutation or interaction is predicted. Acceptance preserves the pose without the old fixed nudge; refusal/error restores its last accepted source pose. Reversal cannot cross back through the pending entry plane; explicit held reverse input takes effect after settlement. Long delays stop at the fixed cap without replaying accumulated time. Late responses cannot rewind an unrelated relocation.
- The first same-route profile with prediction recorded zero stopped pending frames, p95 17 ms and 16.62 seconds elapsed versus 18.70 seconds before; distance differed slightly because sampling ends after the accepted twentieth step. This is a measured local browser result, not a universal hardware or storage latency guarantee.

### Qualification record and completion

- Focused camera policy/integration tests cover edge/corner/small-map centering, first-render follow, return to a previously inspected cell, signed pan, zoom retention, blocked moves and scope resets. Pure/hook perception tests cover immediate sight, exact source attribution, linked memory, fork/root/witness isolation, aborts, disabled queries and fail-closed errors.
- Browser camera/fog cohort: four PASS at desktop/mobile widths and DPR 1/2. Six keyboard steps per case retained visible pixels in every sampled presented frame; clicked movement after pan/zoom recentered with retained zoom, resize stayed centered, and inspection made no game writes. This detects the reported blank frame, not every possible form of visual change at the moving sight boundary.
- Movement tests cover 25/100/250 ms delays, multi-second caps, no extra requests, no pose nudge, delayed props/settlement, reverse input, diagonal prop collision, refusal, exception, stale relocation and cancellation after prediction has already advanced. Independent source review exposed constrained-corner admission before the final sweep; corrected and retained a regression. No remaining source-review blocker was reported.
- Broad focused set: initially 645 PASS across 52 files (canvas/camera/view models, knowledge integrity/query tests, GameSession and command hooks). Rebased qualification: 671 PASS across 53 files, including the additional interaction hook tests. First build exposed one mock still returning the old void result of `validateKnowledge`; updated that fixture to the new nullable return contract. A final component review found a new crossing could become stranded after unrelated relocation while the old command was still in flight. Hold new admission until that command settles, while continuing only its existing prediction. Final affected component set: 16 PASS, including the new relocation regression.
- Integrated browser attempt: nine PASS / one FAIL. The wall test expected exact text equality but observed 0.0001 unit of tangential slide, valid within the turn helper's 0.012-radian tolerance. Changed only the assertion to allow at most 0.02 unit of sliding over 250 ms, retaining the unchanged canonical revision check. The final six-case 3D rerun PASS, alongside the four passing 2D cases. Final motion profile: 994 frames, 16.58 seconds, p95 17 ms, maximum frame 18.9 ms, **zero pending stopped frames**. Production types/build and dedicated browser-fixture types PASS after the final implementation fix. The existing chunk-size and intentional context-loss warnings remain.
- Retained evidence: `canonical-3d/motion-20261024` contains baseline, read-only optimization, first prediction, camera and failed integrated-attempt artifacts, the final 3D screenshots/report/profile, and live 2D/3D screenshots. Parent logs are `motion-final-unit.log`, `motion-final-build.log`, `motion-final-browser.log` (the retained mixed result), and `motion-final-3d.log` (the final passing rerun). The browser camera cases sample the actor's rendered area on every RAF; pure/integration tests separately prove observation-chain retention and no empty render. These checks qualify the reported blank-map defect, rather than every possible change in fog shading. Live preview stays on 5196; qualification used disposable origin 5206. No original browser database was reset.

This follow-up is complete locally. Code commits are `bb226ad` (main fix), `c99ea41` (relocation admission), and `7f18e21` (collision assertion); the final documentation commit records this qualification. Nothing is pushed or merged, and GitHub issue #10 remains open for integration into the owning branch.

Scope expansion is limited to the owner-authorized 2D issue, draw continuity and same-query observation reuse needed to diagnose/fix stutter. No provider run, NPC behavior, save schema, topology, collision rules, production publication or merge is part of this follow-up. Interactions still target committed actor/object IDs. Prediction hides bounded commit latency; storage delays beyond that bound intentionally remain visible. Further work should consider renderer profiling on physical mobile hardware and a measured latency budget before enlarging prediction or adopting additional gameplay systems.

## Closer dungeon fog — 2026-10-24

The owner requested fog to soften the square disclosure edges. Existing Three.js fog began at 12 units and completed at 26, beyond much of the currently disclosed floor. Brought the fade to one tile (3.2 units) through 3.5 tiles (11.2 units), retaining the matching dark background color. Nearby details stay clear while distant floor and ceiling blend into the background. This is a renderer setting only.

Production build/types and the browser material/view-switch/recovery check PASS. Inspected the refreshed live stage at 5196; screenshot and browser artifacts are retained under `canonical-3d/fog-20261024`. No new renderer or gameplay change.

## Directional bookcases — 2026-10-24

The owner requested planks on all bookcase faces except the front. The stage now uses the existing `bookshelf:oak_planks` surface on the back, top, bottom and both sides, with the bounded book artwork only on local +Z. Seeded wall placements include an inward-facing direction; the renderer rotates the complete mesh on all four walls. East/west placements exchange local width/depth before rotation, so rendered bounds still exactly match the existing world-space collision boxes. Placement RNG, doorway clearance and collision dimensions are unchanged. Source artwork and the TileLab authoring manifest remain intact; this is the stage's bookcase appearance.

Verification: 40 focused 3D tests PASS, including all four front normals, full unmirrored front UVs, world-space rendered/collision bounds and inward wall placement. Production build/types and browser-fixture types PASS. Three browser checks PASS: material/view switching/recovery, wall/dialog/context recovery, and a disclosed-route bookcase front/side inspection. Side inspection stayed inside the committed tile without a game write. Inspected the captured images; plank grain replaces the squeezed side books. Artifacts are under `canonical-3d/bookshelf-20261024`; live preview at 5196 was refreshed without moving its actor.

The canonical branch advanced to `9bb5ec2` with documentation and provider-test/monitor fixtures only, without runtime/package changes. Rebased this isolated lane onto that base; the other development checkouts remain untouched. No live-provider test was run, and nothing was pushed or merged.

## Complete bookshelf frame from the original atlas — 2026-10-24

The owner identified that generation crossed the nominal atlas tile boundary. The original atlas contains the complete shelf at `[0, 0, 354, 336]`, while TileLab extracted a nominal 341px square and upscaled it. That clipped the right post/corner fittings and retained blank pixels below the bottom rail. Recovered the actual full frame directly at its native 354×336 resolution. All 118,944 output pixels were compared against the atlas and match exactly. No mirroring, repainting or resampling was necessary.

The repair is pinned in `scripts/asset-selections/bookshelf-full-frame.json`. Windows preparation copies only the needed block into ignored `local-asset-repairs`, preserving the original `D:\maze-quest` run. The derived material receipt records the source atlas hash and exact crop. It uses the existing `repaired_seam.png` alternate-image slot for compatibility with the importer; the receipt explicitly records a native crop rather than a generated seam repair. The existing guarded importer replaced only the bookshelf front material; every other material definition, including oak planks, was compared before/after and remains identical. Repeating the import reports no changes. Local pack revision is `6ac216864128277daf0856cd2f65afcb641b3d77804735ed8706affbc0e423a3`.

After the ordinary pack import, reproduce the fix with:

```powershell
./scripts/asset-repairs/prepare-bookshelf-full-frame.ps1 -TileLabRun 'D:\maze-quest\MazeQuestTileLab\output\run-20261023-132932-8b1964e4'
$packRevision = (Get-Content -Raw public/assets/material-packs/dungeon-occult-01/manifest.json | ConvertFrom-Json).revision
npm run assets:import -- --source local-asset-repairs/bookshelf-full-frame/run-20261023-132932-8b1964e4 --selection scripts/asset-selections/bookshelf-full-frame.json --only bookshelf --replace-block bookshelf --expected-revision $packRevision --write
```

Two browser cases PASS: front/side inspection and material/view-switch/recovery. Improved the inspection camera framing so all four corners are visible below the toolbar. The final front/side rerun PASS and images were visually inspected. The live stage was refreshed; original artwork files were not overwritten. Evidence is under `canonical-3d/bookshelf-crop-20261024`, including the native repaired texture, source boundary preview, before-manifest, browser report and full-frame in-stage screenshots. Runtime code, bookcase geometry and gameplay are unchanged by this asset repair.

## Model geometry and TileLab discovery — 2026-10-24

**PROPOSED. Discovery and planning only; implementation awaits the owner's choice.** The owner's immediate instruction takes precedence over the supplied handoff's broader implementation deliverables. The objective is working interchangeable models quickly, without making Minecraft JSON, glTF or a universal mesh schema the game's model architecture. No demonstration, importer change, generation request or new gameplay behavior was performed in this pass.

### Repository alignment and existing capabilities

Research used the clean isolated `codex/canonical-3d-exploration` lane at `0b27db1`, based on canonical `9bb5ec2`. The observed upstream `origin/codex/agentic-game-a1` subsequently reached `67e4b91` (bounded live qualification closeout documentation). Its intervening `src` changes affect Agentica capability descriptions/action refusals and tests, with no renderer or package changes. Re-fetch, inspect and align this lane before implementing the next slice; this planning pass does not rebase or qualify those upstream changes.

| Existing component | Useful capability | Limitation relevant to the next models |
| --- | --- | --- |
| `src/assets3d/manifest.ts`, `registry.ts`, `threeAssets.ts` | Cube/UV-box definitions, per-face UVs, parent joints, pivots, omitted faces, explicit rotation poses, cached resources | Materials are bound to six global directions, not each part's surface slot. UV rectangles reject descending coordinates. No explicit bind rotation/rescale or opaque/mask/blend material policy. |
| `src/assets3d/chestModel.ts` | Independently authored body, interior, rim, lid hinge and latch; UV layout separate from pose | A useful native adapter precedent, rather than a general source-model resolver. |
| `src/assets3d/humanoid/` | Standard skin layout, classic/slim bodies, layered alpha, named joints, elapsed-time animation, shared resources, attachment points | Rigid-part articulation and atlas skinning; not weighted vertex deformation. Preserve it rather than replace it for this task. |
| `scripts/import-tilelab-pack.ts` | Reviewed selections, source/report hashes, incremental block replacement, frame timing, chest atlas intake | Does not consume the new `model_textures` evidence or resolve a source model dependency graph. |
| `src/components/maze3d/StageRenderer.ts`, `scene.ts` | Existing Three.js stage and observation-bounded projection | Visual meshes must not become independent navigation, visibility or interaction authority. |

The full `MaterialShowroom.tsx`, `showroom.css` and `characterReferences.ts` remain in the older `feature/maze-3d-projection-asset-lab` worktree. They are not on this active canonical lane. Bring over/adapt only the inspection surface needed for the proof; do not switch the feature back to the old gameplay base. A route-scoped showroom may mount one canvas while active and dispose it on exit, using the same asset factories as the stage. No additional persistent rendering loop is needed.

Current presentation dimensions are a 3.2-unit cell, 4.5-unit walls, 1.8 × 3.3 door opening and 2.7-unit humanoid. Local model front is +Z and up is +Y; the world uses +X east and +Z south. Convert source units/orientation once at the adapter boundary. A Minecraft block's 16 authoring units do not establish Maze Battle cell occupancy.

Historical MazeQuest findings: `wwwroot/assets/blockBuilder.js` supplies texture/instancing experience but no complete model inheritance resolver. `experiments/basic_room` is a useful interaction/scale reference. `experiments/chest/script.js` manually offsets/rotates textures and advances its lid by frame count; the present chest and animation code are a better starting point. Do not port those historical mechanisms wholesale.

### Actual local source requirements

Inspected `D:\maze-quest\wwwroot\assets\minecraft` read-only. These are facts about this extracted pack, not generic assumptions about all Minecraft packs.

| Target | Observed source | Consequence |
| --- | --- | --- |
| Wall lever | `models/block/_bdc/lever_wall.json` and `_on.json`: 14 elements each, including four rotated elements | Resolve the nested model path and element transforms. Separate state geometries are available; an animation rig is not supplied. |
| Iron door | Four upper/lower, left/right models; lower halves have ten elements and upper halves eight; descending UVs and omitted faces occur | Support mirrored UVs and per-part materials. Compose upper/lower as one visual door, with an explicit hinge. |
| Iron bars | Multipart blockstate with conditional post/cap/side models | Start with explicitly selected fixture compositions; do not implement a world neighbour/state engine. |
| Stone button | Released/pressed models share `minecraft:block/_bdc/switches` with the lever | Identify materials by resolved texture resource, not block name. One upgraded canvas can serve several models. |

All four inspected source texture resources are 64 × 64 with fully transparent texels and no partial alpha. They need cutout masking, not globally opaque materials or blanket alpha blending. `textures/64` and `textures` contain different door/bar images at identical dimensions; only the switches image matched in both locations. Pin the selected file/layer and hash. The currently inspected TileLab code selects `textures/block/...` first, falling back to `textures/64/block/...`; our intake must follow its recorded source, not independently choose another layer.

The extracted pack lacks `models/block/block.json`, referenced by these models. Missing concrete parents or textures must produce an import diagnostic. For the known abstract `minecraft:block/block` root, either supply a pinned base file or approve an explicit geometry-only root profile. TileLab already emits a warning for this case and does not certify missing display metadata. Do not silently invent that metadata. Other missing parents are not covered by that exception.

World and inventory appearances also differ: `models/item/iron_door.json` contains a complete door and inherits display metadata from `models/item/_bdc/door.json`; it is not the same as a world door half. Preserve the possibility of separate presentation contexts. Source comments identify BDcraft/Cubik and pack contributors; retain those credits/provenance. A loader's MIT license does not determine the source artwork's redistribution status.

### Loader evaluation

| Candidate | Evidence inspected | Recommendation for the first proof |
| --- | --- | --- |
| Existing cuboid builder plus a bounded import adapter | Current local code already handles most target geometry and shared resources | Preferred baseline: add only the missing face-slot, UV mirror and bind-transform features, and convert a curated source dependency closure during import. This is one adapter payload, not a universal representation all sources must adopt. |
| MineRender V2 | [Official usage](https://v2.minerender.org/), pinned source `18f354530a029aac5718d90d6f54ba3ed7371589` | Strong comparison fixture. Its source package is `2.1.0-alpha.147` with Three.js peer `^0.186.1`, matching our installed Three.js version. It has a broad asset/world subsystem; qualify only a model-building path if local conversion becomes larger than the bounded targets. |
| `@xmcl/resourcepack` / `@xmcl/model` | Resolver, geometry factory and manifests at upstream `154e2719b1ac962631d80ae4a280382f4f1ac09d` | Useful references, not a drop-in choice. Parsing/resolution and Three.js construction are separate packages. The model manifest declares Three.js 0.156.1; our app uses 0.186.1. Source review also found parent texture assignment can overwrite child overrides and no active-parent/texture cycle guard in the inspected resolver. |
| Three.js `GLTFLoader` / `SkeletonUtils` | Official docs and installed addons | Future conventional-mesh/weighted-rig adapter. No mandatory GLB conversion step for these cuboid assets. |

MineRender's inspected `ModelObject` constructs source elements, packs textures into its own atlas, and still marks texture replacement as TODO. Its asset loader defaults to a hosted Minecraft source registry. Adopting it would need explicit local-source isolation, material rebinding, rig preservation and disposal proof; a successful stock preview would not establish those properties. The site calls V2 beta while the inspected source package is alpha; pin an actual tested release before adopting it. No package was installed or benchmarked during discovery.

Primary source links: [MineRender package](https://github.com/InventivetalentDev/MineRender/blob/18f354530a029aac5718d90d6f54ba3ed7371589/packages/minerender/package.json), [model construction](https://github.com/InventivetalentDev/MineRender/blob/18f354530a029aac5718d90d6f54ba3ed7371589/packages/minerender/src/model/scene/ModelObject.ts), [asset registry](https://github.com/InventivetalentDev/MineRender/blob/18f354530a029aac5718d90d6f54ba3ed7371589/packages/minerender/src/assets/AssetLoader.ts), [XMCL resolver](https://github.com/Voxelum/minecraft-launcher-core-node/blob/154e2719b1ac962631d80ae4a280382f4f1ac09d/packages/resourcepack/modelLoader.ts), [model package](https://github.com/Voxelum/minecraft-launcher-core-node/blob/154e2719b1ac962631d80ae4a280382f4f1ac09d/packages/model/package.json), [GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html), [SkeletonUtils](https://threejs.org/docs/pages/module-SkeletonUtils.html). Both investigated external projects use MIT licenses; preserve their notices if adapting source. No external source was copied into runtime code.

### Proposed boundary: definitions, bindings and live instances

Use a small source-independent **visual instance interface**, with adapter-specific definition payloads. Keep geometry revision separate from material revision and UV-layout compatibility. Do not put Three.js objects, Minecraft states or source filenames into canonical actor/item records.

```text
curated Minecraft elements ─┐
native cuboids/procedural ──┼─ adapter/factory ─ visual instance ─ existing Three.js host
future glTF scene/rig ──────┘                        ↑
                               approved materials + visual state + presentation context
```

The minimum shared instance behavior is: expose a renderer-owned root, advertise supported visual controls, apply a visual state, bind compatible materials, advance elapsed time, expose named local anchors and release owned resources. Unsupported states or incompatible bindings produce useful errors. The factory owns async loading/cancellation; a disposed instance cannot receive a stale load. Shared immutable geometry/textures remain library-owned; instance pose, state and private materials remain instance-owned.

For the proof, both lever assets advertise the same `off`/`on` control. The imported lever can select approved baked source states; the native lever can rotate a named handle pivot. Do not infer a rig from an element's array index or require smooth interpolation between unrelated geometry. An eventual smooth imported lever needs an explicitly curated handle grouping/pivot. Visual control values do not imply redstone, puzzle completion or a new game interaction.

Bind transforms describe authored geometry; state transforms are applied relative to them. Face mapping must retain omitted faces, descending UV coordinates, quarter-turn face rotations and resolved per-face material slots. Keep source UV coordinates proportional to the full canvas when resolution changes. Do not use generic seam repair, atlas repacking or independent island resizing on these textures. Render policy includes alpha mode/cutoff, culling, color space, wrap/filter choice and emissive settings; caches must include every render-affecting policy and revision.

Material alternatives for one model must match its declared layout. Alternative models need only satisfy the same presentation controls: an imported lever's `switch_atlas` slot need not match a native lever's `mount` and `handle` UV layouts. One source texture resource may bind many surfaces and instances. Many source variables may resolve to that single resource.

The iron door is one visual assembly: upper/lower parts, one root, one explicit hinge and `closed`/`open` visual state. Fit it uniformly into the existing opening and inspect clearance. Source half/hinge/facing selectors are import recipes, not two-cell game occupancy rules. Preserve logical cell/world transforms from the current stage. Geometry bounds support framing and diagnostics; changes to navigation/collision require their own gameplay decision.

Keep humanoid atlas mapping/articulation intact. Existing hand/head/back attachment points can be exposed by an adapter without implementing equipment. A future weighted rig will need independent bones and animation mixers per instance; `SkeletonUtils.clone` preserves bone associations while sharing geometry/material references. Define world/held/dropped/inventory display transforms when an actual asset needs them, rather than constructing an item system now.

### Provisional TileLab handoff contract

**Consumer binding remains Maze Battle-owned.** The in-flight local files `src/ModelTextureSources.cs.source`, `ModelTextureTools.cs.source` and `ModelTextureTests.cs.source` already implement model-driven material discovery, shared texture units and source snapshots. Their `model-source-references.json` uses `tilelab-model-source-evidence-v1` and explicitly says it is authoring evidence, not a runtime model contract. This was a source read, not an executed or delivered-export qualification; the README still describes the older review-only boundary.

Retain that evidence format. Add/verify the following data through its existing reports or a small export descriptor; there is no need for TileLab to adopt Maze Battle's runtime geometry schema.

| Field or evidence | Required meaning |
| --- | --- |
| Schema/export revision and completion status | Versioned export; incomplete or changed in-flight output is not silently imported. Import a pinned completed selection. |
| Texture resource identity | Canonical namespace/path, e.g. `minecraft:block/_bdc/switches`, plus existing `materialId`/shared `unit`. Human label is separate from identity. |
| Source JSON references | Pack/version or local source identity, relative snapshot paths and SHA-256 for the selected blockstate/models/parents, plus all unresolved/abstract-root warnings. No absolute path required at runtime. |
| Original material | Source resource, selected source-file/layer, SHA-256, native dimensions and original relative path. Do not reselect a same-named image on the consumer side. |
| Upgraded material | Relative path, SHA-256, actual dimensions, output variant, per-material report/receipt references and review status. Existing `upgraded` path alone is not a content pin. |
| Layout compatibility | Full-canvas identity, UV coordinate domain and layout ID/revision or deterministic layout fingerprint supplied/verified by Maze Battle. Resolution can change proportionally; crop/repack/rotation requires a new explicit layout/remap, not a compatible replacement. |
| Alpha/color/animation | Existing `exact_source_alpha_at_nearest_source_texel` and `full_canvas_no_packing_no_seam_repair` policies; preserve source mask topology. Declare color space. Static now; any later animation retains frame order/timing and each frame's layout/hash. |
| Provenance and review | Source pack credits/rights status, authoring run, generation/edit receipt, selected variant and reviewer. Generation completion is not visual approval. |

Maze Battle's curated selection then supplies stable `modelAssetId`, geometry revision, adapter/profile, source-state/composition recipe, local frame/scale, semantic visual controls, and a **slot → texture-resource → selected output** binding. For example:

```text
lever-wall-source / geometry revision <hash>
  off -> approved lever_wall recipe; on -> approved lever_wall_on recipe
  switch_atlas -> minecraft:block/_bdc/switches -> <pinned material output>

lever-wall-native / geometry revision <hash>
  off/on -> authored handle poses
  mount/handle -> their own compatible material bindings
```

Both satisfy the same lever controls; neither requires TileLab to guess a pivot, authoritative state or game cell. Preserve the original source JSON and face-use evidence even when a bounded importer produces cached cuboid data. Source resolution happens at curated intake, not separately on every runtime instance. Do not auto-import the whole output tree or add network fallback for missing dependencies.

### First implementation slice, after the owner's choice

1. Align the isolated branch to the canonical owner's final head. Bring over only the existing showroom inspection UI needed for models. Keep the current live stage available for comparison.
2. Add the narrow geometry/material capabilities demonstrated above, with diagnostics for unsupported source features. Resolve only an explicitly selected source closure; document the abstract-root policy. Implement an imported wall lever and a separately authored lever behind the same interface.
3. Show both levers side by side, with orbit, `off`/`on`, original/upgraded material selection, wireframe/UV inspection and scale reference. Use original local materials until a completed TileLab result is available; do not trigger generation. Swap materials while retaining the same geometry revision and scene instance.
4. Compose one iron door with upper/lower texture slots and a hinge if the lever proof passes without expanding the adapter. Bars/buttons follow through the proven intake, rather than broadening the first proof into a block-state engine.

Planned verification: transformed element bounds and pivots; all six face orientations; descending UVs plus face rotations; per-part slot resolution; parent/alias cycles and missing dependencies; explicit source layer/hashes; alpha topology and cutout holes; no significant coplanar overlap; independent instances; material changes without geometry rebuild; stale async loads and stable resource counts after repeated swap/dispose. Browser inspection should capture front/back/sides, both lever states and open/closed composite door, and exercise view switching/context recovery. Re-run focused asset/render tests, types/build and the relevant 2D/3D regression cohort. These are acceptance requirements, **not tests performed during this planning pass**.

Decisions still open: adopt the bounded native-builder adapter (recommended) or first qualify a MineRender extraction path; approve an explicit geometry-only abstract-root profile versus supplying the missing base source; decide whether the first imported lever uses baked states or merits a curated moving handle immediately. Neither glTF intake nor weighted-character migration is required to settle those choices.

Planning references read through Google Drive: [Logical Cell to 3D Block Mapping](https://docs.google.com/document/d/12uc8XclQTMrsuRUgCI-eP8N6ckPKfIGuzxI_0TKjHMs/edit) and [Deferred World Systems Roadmap](https://docs.google.com/document/d/1-SrvzJiuTs2j39RqGql1k4LcngI8dGGqrL7F_jP9X_8/edit). These provide design direction, not implementation proof or authority to add deferred gameplay. This slice excludes NPC behavior, inventory/equipment workflows, schema/navigation changes, full resource-pack import, Minecraft world simulation, paid generation, publication and merge.

## Real stairs and stacked-floor traversal — planning follow-on, 2026-10-24

**Owner-requested planning addition; not implemented.** The current three-strip marker is not an acceptable final staircase. The target is an actual stairwell connecting real upper/lower floor geometry, with continuous ascent/descent, usable landings, floor/ceiling openings and correct clearance. A detailed mesh followed by the existing teleport does not meet that target. Room/structure schematics are imminent context, but a schematic system/editor/importer is not part of this slice.

### What the present code actually guarantees

- `StageRenderer.syncScene` creates three boxes, each only 0.025 units tall, as a flat stair symbol. It creates no steps, shaft or opening.
- `compileStageScene` filters observations to the actor's level, builds every floor at Y=0 and adds an unbroken ceiling to every disclosed cell. `StageWalker` stores only X/Z and projects all solid boxes into 2D collision bounds. Simply adding elevated meshes would leave invisible walls below upper floors and would not support climbing.
- `WorldStairs` already stores reciprocal `upper`/`lower` canonical positions. `resolveFloorTravel` validates them and commits a discrete level change; the first floor's upward link returns to town, which is a separate presentation case.
- `createWorldFloor` links the upper exit to the new entry room's center. Each floor has its own generated 2D coordinates. The link does **not** certify aligned X/Z positions, facing, vertical spacing, a reserved stairwell or a hole in either deck.
- Current knowledge observation follows same-level links; it does not disclose a second floor through the stairs. `GameSession.execute` may prepare a new floor and then immediately execute descent, publishing its final view. That is not a published two-floor landing preview.
- `WorldSpace.schematic = 'stone-room-v1'` selects the existing deterministic room materializer. It is not yet a general 3D structure/prefab contract.

These are separate geometry, placement, movement and disclosure gaps. Solving them does not require replacing the seeded 2D topology, but it does require an explicit follow-on to the current planar projection.

### Assembly data to allow now

Keep the proposed model/material/instance interface. Permit **optional authored assembly metadata**, rather than requiring every prop to carry traversal behavior:

| Data | Stair use | Near-term reuse |
| --- | --- | --- |
| Stable asset ID and geometry/layout revision | A reproducible stair variant, independent of surface textures | Model prefabs and room assemblies |
| Local frame, dimensions, root placement transform | Fit the flight and its landings into a known volume | Rotation/placement of multi-part objects |
| Named connection anchors with position and orientation | Physical `upperLanding` / `lowerLanding` ports and approach directions | Doors, room sockets and later structure joins |
| Occupied and reserved clearance volumes | Flight, landings, headroom, shaft and protected approaches | Placement validation without guessing from a mesh bounding box |
| Explicit floor/ceiling opening descriptors | Remove only the approved deck area through which the flight passes | Future atria, shafts and multi-level structures |
| Optional walk surfaces and support-height profile | A walkable sloped proxy or height profile under the visible treads | Ramps and bridges when separately introduced |
| Material slots and child model references | Treads, risers, sidewalls and rails share the ordinary material pipeline | Composition of existing model definitions |

An asset declares geometric requirements; an **approved placement** binds it to a canonical stair connection and owns its reserved volume/openings. A downloaded model or a `walkable` label must not create a game passage. Keep visual extent, physical support/clearance and logical connectivity distinct, then validate that the approved assembly makes them agree.

This is the small data boundary worth allowing during the lever/door work. It does not require choosing an external schematic file format or building general assembly expansion, placement tooling or an editor now.

### Proposed geometry and placement policy

Start with a procedural straight flight in a generous authored fixture; compare a dogleg/two-flight variant if the straight footprint is awkward. Use ordinary cuboids and existing materials. The difficult part is the connected volume, not the triangle count. A full floor rise plus useful landings will generally occupy more space than the current single 3.2-unit stair cell; do not compress it into that cell just to retain the marker's footprint.

Parameterize deck-to-deck rise, width, tread count/run, landing dimensions and structural thickness. Validate the configured actor envelope/headroom and doorway approaches. The present 4.5-unit wall height is clear room height, not a complete deck-spacing contract. With +Y up, increasing dungeon level descends in Y. These are game-scale choices, not a claim of building-code dimensions.

Choose a stable local frame for each level and a versioned level-to-world transform. For today's single stair link between adjacent floors, a target floor can be translated/quarter-turned so its landing anchor matches the approved stair assembly's endpoint, without changing its local 2D cells or seed. This is a proposed placement strategy, **not something `WorldStairs` currently provides**. Derive/retain those transforms through a bounded game-owned layout process; the renderer must not load hidden floor ancestry to invent them. Future multiple links between the same levels introduce alignment/loop constraints that require placement validation rather than averaging transforms or teleporting between mismatched ports.

Use the same forward/inverse transform for rendered geometry, collider placement, landing positions and world-to-cell resolution. A rotated level must also transform movement directions back into its canonical grid and carry the camera's heading across the connector. Test every quarter-turn and negative coordinates; never change a logical cell address to make a visual alignment work.

Generation must reserve the stairwell and its approaches before decorations or conflicting structure placement. Both deck openings and both landing spaces belong to that same placement. Existing saves without these reservations cannot be assumed physically compatible: retain their legacy transition presentation until an explicit compatible layout recipe or migration is chosen. Do not change old seeded topology silently.

A multi-cell stair footprint must also agree with the 2D walkability/interaction projection. Do not place a physically impassable flight or shaft across cells the canonical map still treats as a flat open route. Reserving or subdividing that space is a generator/layout decision with parity tests, rather than a decorative model side effect.

### Continuous traversal and visibility

Use a constrained walking surface for the first implementation, with visible treads over a continuous collision/support profile. Track foot height and a separate actor collision height; smooth camera elevation with elapsed time so treads do not cause frame-by-frame head bumps. Add height intervals to colliders, or a swept 3D capsule equivalent, so an upper-floor wall does not block movement underneath it. Test ceilings, sides and railings as well as the walking surface. General gravity, jumping, falling and arbitrary rigid-body physics are not prerequisites.

Walking onto an approved connector should initiate traversal through the existing serialized command authority, rather than a separate "next floor" button or a second world writer. Define one logical crossing boundary and validate its source/target connection. Retain the local continuous pose across acceptance; transform the camera and actor into the target level's frame without a visible snap. Until a required preparation/commit is accepted, movement remains inside a bounded safe part of the connector. Handle rejection, reversal, cancellation and stale relocation explicitly. Do not reuse the horizontal 0.8-unit prediction rule blindly for a vertical connector.

The initial implementation may retain canonical `(level, cell)` endpoints and presentation-local progress along the stair link. It must define the committed endpoint used on reload/recovery and block chest/other interactions that would otherwise act from an endpoint while the visible actor is halfway along the stairs. If durable mid-flight position or authoritative encounters on the stairway become requirements, promote connector residency to an explicit game-state design; do not hide that expansion in a camera animation. The 2D view can continue to represent the same accepted reciprocal link and stair symbols.

For genuinely continuous two-floor viewing, the game must publish a **bounded cross-floor observation** near the stair opening. Generating/residing a floor is not permission to render it. Define sight/occlusion through the stairwell and disclose the target landing/nearby cells under that policy, with existing provenance and limits. Preparation must be separable from automatic relocation if the destination needs to be ready before entry. New disclosures belong in the game/knowledge boundary; no direct renderer read of `loadWorldRoom` or the full floor plan.

Keep the current landing, connector and the authorized destination fragment resident through the crossing; stream the rest as it becomes visible. Two real levels can coexist without rendering every retained floor. Existing fog may conceal the edge of the bounded observation, but must not conceal a positional discontinuity or substitute for the second floor.

### Sequenced delivery and acceptance

| Gate | Deliverable | Evidence required before proceeding |
| --- | --- | --- |
| S1 — assembly proof | One reusable stair assembly with ports, landings, openings, support surface and clearance metadata in the model inspection surface | Front/side/cutaway views; measured bounds and material replacement; distinguish this model proof from traversable gameplay |
| S2 — two-level movement fixture | Authored upper/lower rooms in one scene, real deck openings and bidirectional walking between them | No teleport/fade, floor or ceiling clipping, camera stair jitter, tunnelling or cross-level collision; independent camera/actor pose checks |
| S3 — canonical connector | Bind the assembly to one reciprocal `WorldStairs` link, including preparation and bounded multi-level disclosure | Exactly one accepted floor change per crossing; source guard, refusal, reversal, reload, control loss and 2D parity; no hidden-floor reads |
| S4 — seeded generated placement | Versioned stairwell reservation and level transforms for a bounded generated-floor corpus | Same seed/recipe produces identical geometry, ports, openings and placements; incremental/eager agreement; no prop/doorway overlap or inaccessible landing |

Success is a character walking from an actual lower room up the staircase into an actual upper room and back, while canonical position, visibility and 2D traversal remain coherent. Test all supported orientations, both directions, high/low frame rates, delayed preparation/commands, save/reload at the chosen recovery boundary and repeated level crossings/resource reuse. Include the town link as an explicit fallback case rather than inventing an unimplemented town floor.

This adds **planning scope** for stairs and their future assembly boundary. It does not enlarge the currently proposed lever/door implementation into a multi-level engine. Decide the stair assembly/placement metadata before hardening that model contract; execute S1–S4 as a separately approved traversal slice. Unresolved choices are the initial straight/dogleg footprint, persisted versus version-derived placement metadata, cross-floor observation policy, crossing/recovery boundary and treatment of legacy worlds. No runtime changes or traversal tests were performed for this planning addition.

## Approved execution — models and stair slices S1–S4, 2026-10-24

The owner approved implementation and requested a goal covering all four slices. One active goal now tracks the narrow model/TileLab foundation plus S1–S4; the earlier planning-only notes above are historical. Keep optional assembly annotations extensible without making the lever/door proof wait for a complete schematic schema. RPG restoration remains owned by the separate canonical audit/workstream.

Initially aligned this isolated lane to canonical `67e4b9190953825e9a0e2e311b046bb0d021b41d`. No other checkout was changed. The rebased foundation checkpoint was published as `2a06eba`, using an exact lease against the previous `64c12a980e70c7f057fe49c02bebdf6841224022` remote tip. During final closeout, canonical adopted that same foundation and added its R0/restoration planning documents, advancing to `1a5e98f234f0a0130123b9521142b47214f4a821`. This lane was cleanly rebased onto that tip. Its qualified runtime/scripts/tests/manifests are byte-identical across that metadata-only rebase; the republish uses an exact lease against our observed `1b705c53888e3dd1c6194697763ac9b092890a58` tip. The canonical restoration plan remains a separate owner's goal.

| Acceptance slice | Current status | Remaining boundary |
| --- | --- | --- |
| Model foundation | Imported/native wall levers expose the same off/on interface; iron-door upper/lower parts form one hinged object. Portable TileLab export consumed, all 39 file pins verified, relocation/corruption cases qualified. | Original-material proof only; upgraded artwork has not been generated/qualified. |
| S1 assembly | Reusable native straight flight: 18 treads, two landings, rails, named ports, material slots, opening and clearance descriptors. Locally tested and visually inspected. | Dimensions are the first versioned fixture, not a universal stair specification. |
| S2 physical fixture | One scene contains both decks and a real opening; bidirectional elapsed-time walking uses a support profile and height-aware collision. Locally tested. | Isolated rendering/locomotion evidence only; no canonical floor change occurs here. |
| S3 canonical connector | Implemented and locally qualified: separate preparation, bounded landing sight, continuous pose through guarded canonical changes, cancellation/reversal/reload and interaction gating. | Endpoint checkpoints remain authoritative; progress on the flight is presentation-local. |
| S4 seeded placement | Implemented and locally qualified: pinned spatial recipe, canonical shaft reservations/bypasses, stored floor frames, deterministic replay, capacity accounting, legacy fallback. | First profile is one straight north/south flight between adjacent floors, with translation-only frames. |

The model implementation is under `src/assets3d/models/`; the narrow Minecraft adapter preserves signed UV spans, omitted faces, explicit per-face texture slots, authored pivots/rotations and element rescale. It resolves only curated local snapshots during import and explicitly allows the known missing abstract `minecraft:block/block` as a geometry-only root. Missing concrete parents, cycles, changed bytes and incompatible layout bindings reject. Layout identity is pinned to the source resource **and original canvas hash**, not its name alone. `VisualInstance` is the small renderer-facing interface; its `cuboids-v1` payload does not require a future glTF or weighted rig to use that representation.

`ThreeAssetLibrary` remains the shared surface cache; new optional alpha/culling policy is included in its material key. These binary source masks use depth-writing alpha test 0.5 and front-face culling. Existing material packs, chest and humanoid APIs retain their behavior. Native models use plain materials and no generated artwork. Instances share geometry/surfaces while owning transforms and debug clones; disposal of one instance does not dispose another's resources.

The live inspection route is `http://127.0.0.1:5196/?view=models`, with selectable model, S1 and S2 exhibits. It mounts one route-scoped renderer and never opens the game database. S2 uses a continuous support proxy under the treads; foot IK, gravity and falling are not implemented. The shared fixture data splits decks around the landing/shaft footprints, avoiding duplicate coplanar surfaces. Initial review found and corrected landing/tread overlap and a held-key focus bug; browser coverage retains the input regression.

Reproduce the current original-material preview:

```powershell
npm run assets:import-models -- --source D:\maze-quest\MazeQuestTileLab\output\run-20261024-171802-fca671cc --selection scripts/asset-selections/model-proof.json --write
```

The local model pack is ignored like the other source artwork. No whole-pack import, new provider call or artwork redistribution was added. Both intake commands explicitly select originals for this proof and refuse upgraded intake; they never fall back to `raw_edit.png`.

Qualification so far: 77 focused tests across ten files PASS (assets, humanoid/chest compatibility, stage movement and component guards); production types/build PASS with the existing large-chunk warning. Four workshop browser cases PASS: imported/native controls and front/back/both-side images; repeated state/material changes without new geometry; S1 inspection; S2 up/down motion without a height jump, stopping, sidebar focus release and no IndexedDB writes; mobile inspection. These results do not qualify canonical multi-floor traversal. An initial test expected an approximate rail bound too narrowly; replaced it with the actual clearance invariant. Test-only Three.js generic types were corrected after the first type check.

TileLab coordination was authorized in the owner's original message in **Fix animated block frame generation** and verified through its chat readback. Its source preparation is now implemented/offline-qualified, superseding the earlier README/source-only snapshot. The worker delivered `exports/interactables-originals-v1/material-export.json`, `tilelab-material-export-v1`, descriptor SHA-256 `d352c0a6fb395a6be01059273c241081d2ad5d84eb1f94462c9606516ccaa43f`. Four original resources serve five block bindings; upgrades remain pending. Maze Battle owns geometry/layout identities, source-state recipes and runtime cutout policy; TileLab owns portable, hash-pinned material/source evidence. Consumer verification below follows that exact descriptor without depending on historical absolute paths embedded in its audit records; the result was relayed to the authorized TileLab chat.

Source review identified additional S3/S4 obligations: primary `linked-vision-v1` is same-floor by contract; private floor preparation cannot also write knowledge in the same scoped transaction; renderer lifetime/scope previously reset on level change; and a real shaft reservation must alter canonical room walkability. The implementation below addresses these seams without changing the primary observation policy or treating camera motion as travel authority.

### S3/S4 implementation and closeout

`domain/expedition/vertical.ts` owns the small versioned layout contract. New games explicitly pin `straight-stair-layout-v1` into their existing `modules-v3` recipe; the ordinary recipe factory still defaults to legacy generation. Spatial rooms use odd sides 9–15. Lower entry rooms reserve the shaft at bootstrap; terminal expansion reserves the upper exit room **before** quality witnesses, roles or content. The three central shaft cells are omitted from canonical walkability and have a one-cell bypass on each side. The center and boundary ports remain connected. This is a game-owned schematic variant, not a general external schematic importer.

Floor frames are translation-only, millimetre-rounded and bounded to ±1e9 world units. Increasing dungeon level descends by 4.68 units. Stored reciprocal placement aligns the upper exit and lower entry using both rooms' global grid origins, a 9.36-unit port separation, and the same 3.2-unit cell scale as the stage. Travel and sight publication validate those frames, reserved room roles and reciprocal anchors. Unsupported or corrupted established placement fails; it is not silently regenerated.

Existing recipes/saves without the spatial pin retain `stone-room-v1`, their old allocation identity and explicit stair transitions, including the town link. Loading an old save does not opt it into the new initializer's policy. No save-schema migration or automatic reset was added. A new spatial lower floor inherits its established upper floor's profile. Seed increment now wraps explicitly at the unsigned 32-bit boundary rather than rejecting a valid next-floor request at seed `0xffffffff`.

`GameSession.prepareStairs` serializes preparation at the descending landing without moving the actor or writing navigation knowledge. The App may show preparation/recovery while this bounded work runs; entry is blocked until it is complete. A partially prepared lower floor survives reload and continues through the same allocation. Missing reciprocal records for an already established floor fail clearly rather than displaying a perpetual Prepare button.

`projectSpatialView` supplies transient `connector-sight-v1` UI data bound to the exact snapshot, roots, checkpoint and current primary knowledge publication. A visible endpoint can retain its placed assembly without disclosing target cells. Only an actor at the admitted endpoint of a ready connector receives the adjacent radius-one linked landing fragment: at most five cells in one room, no chest/inventory/quest content, seeds, full room specs or navigation-memory writes. The primary `linked-vision-v1` contract and its same-floor integrity validators are unchanged. The renderer has no world reader.

The stage uses approved placement to cut the endpoint deck/ceiling, suppress only the connector departure wall, and place the reusable native flight. It protects the shaft against planar side entry. `StairTraversal` follows a continuous support profile, confines the actor to the reserved flight and has one pending canonical stair command at its midpoint. Delayed prediction is bounded; accepted travel retains pose, camera heading, elevation, renderer and shared resources. Reversing through the midpoint requests the reciprocal command. Rejection, stale publication, relocation, Escape, control loss, return to 2D and reload recover at the defined committed endpoint. Portal, inventory, saves, chest, Auto and Agentic controls are gated while traversing or reconciling a pending stair command.

Capacity accounting explicitly adds the possible retained rewrite of an **older** farthest room, including both its record and secondary-index paths. The public spatial profile selects that added budget and the full pinned recipe remains in the allocation identity. Tests cover the enlarged worst-case floor/space/stair record shapes, complete birth, populated-root preparation through floor 16 and actual terminal older-room rewrites. Existing legacy capacity selection is unchanged.

Portable original-material intake now uses:

```powershell
npm run assets:import-model-export -- --source D:\maze-quest\MazeQuestTileLab\exports\interactables-originals-v1 --selection scripts/asset-selections/model-export.json --write
```

The exact descriptor above and all 39 portable files were verified. Only the requested lever and iron door are built; the native lever uses the same interface. The resulting local pack revision is `7d033f6a87ec96aace0a46da8f08802ef3a30889c9f1db93f44ad5aa402fe241`. Import follows descriptor-relative source snapshots, retains credits, reproduces after relocation, and rejects changed bytes, unsafe paths or an implicit upgraded selection. `selectionStatus: complete` describes packaging; producer `upgradeStatus: pending_or_not_selected` is retained. Original bytes preserve original alpha. A later upgraded selection still needs explicit receipt/alpha verification and visual acceptance.

Qualification commands and retained evidence:

```powershell
node node_modules/vitest/vitest.mjs run src/assets3d src/domain/expedition/vertical.test.ts src/persistence/canonical/world src/persistence/canonical/game src/services/game/GameSession.agentic.test.ts src/components/maze3d --maxWorkers=2
npm run build
node node_modules/typescript/bin/tsc -p tests/e2e/canonical-stairs.tsconfig.json --noEmit
node node_modules/@playwright/test/cli.js test --config tests/e2e/model-workshop.config.ts
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-stairs.config.ts
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-3d.config.ts
```

- Pure reservation qualification covers 8,192 supported room-size/seed-pattern/end combinations, including connectivity and retained ports. Seeds 42 and 781 reproduce two generated floors' geometry, ports and placements independently of retained record identities.
- Workshop: four browser cases pass, including material substitution/resource reuse, S1/S2 continuous walking, focus cancellation and mobile inspection.
- Canonical stairs: five browser cases cover bidirectional continuous traversal, exact one-change custody and retained canvas; same-floor primary knowledge and 2D parity; reload and manual-save restore; retained legacy behavior; interrupted preparation; and atomic injected quota failure followed by retry.
- Existing canonical 2D/3D: eleven browser cases pass, including DPR/mobile camera alignment, fog continuity, repeated texture recovery, chest/room playability and input cancellation. The 20-cell motion measurement recorded 994 frames, 17 ms RAF p95, zero pending stopped frames and zero pending stop duration on this machine. This is local browser evidence, not a general performance guarantee.
- Screenshots, motion samples and result summaries are retained outside Git in the task visualization directory `canonical-3d/models-stairs-20261024/qualified-s3-s4`. Source artwork remains local/ignored.

Final qualification: **372 focused tests across 31 files PASS; all 20 browser cases PASS (4 workshop + 5 canonical stairs + 11 existing 2D/3D); production types/build PASS; stair browser-fixture type check PASS.** The build retains the existing large-chunk warning. These are local/offline qualifications. No merge, external deployment, upgraded image-generation call or general whole-game acceptance was performed.

Review/test findings corrected during execution: approach snapping; cancelling/re-entering while a stair command was pending; losing interaction gating after Escape; lateral entry missing the landing activation region; planar movement sidestepping into the opening; missing-established-stair records; assemblies disappearing while their endpoint remained visible; and the extra secondary-index rewrite budget. A save-test locator initially used the wrong close-button name and was corrected before qualification. These were bounded implementation/verification corrections; no NPC behavior, RPG restoration, general physics, arbitrary prefab expansion or provider work was added.

Remaining limits and next slice: one straight orientation and translation-only floor frames; one visible connector at a time; endpoint recovery rather than durable mid-flight residency; continuous support without foot IK/gravity/falling; plain native stair materials; no automatic migration of old layouts. A later approved slice can add orientation/dogleg variants and richer surface bindings, then apply the same assembly/placement seams to room or structure schematics. General schematic authoring remains outside this delivery.

A producer handoff arrived during closeout for `exports/interactables-unified-v1/material-export.json`. Read-only descriptor verification confirmed SHA-256 `16163098542828c1b6dae1ae1d30c54e1cd7b0ad7b96c51803275ea73452116f`, revision `cbd81bf1b1220148e8bab117c13a18595f150ada6ada382897f25499c87f5817`, with four explicitly upgraded resources marked `generated_unreviewed`. Producer reports one unified iron-door composite split into the original two canvases with restored alpha, plus reused lever/button and bars outputs; that claim is not consumer crop/alpha or visual qualification. The candidate was **not imported or admitted** into this delivery. The next material-review slice should verify the portable composite/group receipts, exact crops and alpha before adding an explicit upgraded selection. Producer also reports accepted-only skin export using the existing gallery-selection shape; no automatic catalog replacement is authorized by that handoff.

Live inspection remains `?view=models` on port 5196. The separate seeded canonical qualification stage is `http://127.0.0.1:5208/tests/e2e/canonical-stairs.html?view=stage3d`; it starts a fresh isolated browser-origin game at an established exit **before first observation**, then uses the normal App/session for preparation and all travel. It does not overwrite the user's existing 5196 save.
