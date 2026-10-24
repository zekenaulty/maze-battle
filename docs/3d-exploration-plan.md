# Canonical 3D exploration — rolling implementation plan

## Objective and boundary

Implement the owner's approved three bounded slices, with first-person traversal at least matching the core MazeQuest `basic_room` experiment: connected textured rooms/passages, mouse look, collision-aware movement, navigation/map continuity and game-owned interactions. Retain the canonical 2D generator and GameSession as authority. All procedural results must replay from a seeded RNG and stable versioned inputs; rendering must not consume gameplay randomness.

Long-horizon attachment context informs separation of scene data, geometry, clearance and interaction references. It does not authorize an editor, voxel mutation system, settlement simulation, new NPC cognition, multiplayer, BookForge/Agentica changes, or a new world persistence format. Actual stacked floors, jumping, and new mechanism rules are later work; existing stairs remain canonical transitions.

## Checkout and integration custody

- Isolated worktree: `C:\Users\Zythis\.codex\worktrees\canonical-3d-exploration\maze-battle`.
- Initial canonical base: `46ff005cd0dd8c0871482b5e7eb6a803db82afc1`, containing the owner's `1d00fff` checkpoint.
- Visual reference: asset-lab commit `69a63b4`; port graphics/import components selectively, never the retired App, hooks or save writers.
- The canonical branch is in flight. Fetch and compare at meaningful integration boundaries, record the resulting frozen base, and rebase our isolated lane when necessary. Do not change another worktree or move its branch.
- Keep the old showroom/server available as reference. Use separate development/test ports and disposable browser state for qualification. No paid image or model calls, push, merge or owner-data reset.

## Acceptance and current work

| Slice | Completion condition | Status |
| --- | --- | --- |
| 1. Canonical 3D exploration | Existing App exposes a 3D view using disclosed observation data; smooth movement and mouse look; exact canonical position/map agreement; current ownership/recovery controls; return to 2D. | IMPLEMENTED; final integrated qualification pending |
| 2. Walkable procedural rooms | Continuous planar movement with shared scene/collision descriptions, safe cell/opening crossings, deterministic room/passage detailing, existing chest and stairs bindings; replay and reload checks. | IMPLEMENTED; final integrated qualification pending |
| 3. Populated visual environment | Reuse admitted player appearances and coherent room props within existing state contracts. No invented NPC authority or new mechanism gameplay. Bound resource use and qualify the connected stage. | IMPLEMENTED; final integrated qualification pending |

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

### Edge cases and scope findings

- `GameSession.execute` can return the original stairs receipt after extra floor preparation/transition commands. Reconcile from its final published GameView, not that receipt's revision alone.
- The geometry recipe is seeded/versioned (`modules-v3`); ordinary chest loot uses separate runtime randomness. Geometry replay is in scope; full game-event replay is not claimed or silently rewritten here.
- Follow-player camera and selecting a local appearance implement the bounded visual part of slice 3. Adding authoritative NPC entities/mechanisms would expand scope and is deferred.
- Authoritative observation metadata has a source index into observed cells, not a space ordinal. Test fixtures must preserve that evidence contract.
- Two serialized queues exist: manual UI intents and GameSession writers. A source-cell check before `controller.execute` is insufficient; check again after prior writers finish. An expected stale input must cancel without entering storage recovery.
- Confirmed-wall decorations are generated independently of shared wall ownership, so revealing a neighbouring cell cannot remove an existing shelf. Openings and unknown edges receive no decorative blockers.

## Next

Checkpoint the implementation, rebase onto the latest pushed canonical base, and qualify that integrated candidate. Capture readable stage/chest/mobile evidence, retain failed attempts, verify bounded resources and document local asset setup and the recommended next slice.
