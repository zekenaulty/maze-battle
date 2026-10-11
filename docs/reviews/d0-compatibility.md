# D0: Dungeon Architecture and Compatibility

Source: `c62ed05a43bfad713a36a94d2017efa5ea796adc`, branch
`codex/d0-compatibility`, 2026-10-11. Source references below are repository-relative
`path:line` at that commit. Scope: read-only architecture/compatibility audit;
only this report is changed. **Halt for owner review before D1.** No D1, service,
provider, push, or save migration was performed.

Read both `docs/agentic-play-next-slices.md` and
`docs/two-dungeon-qualification.md`. This report supplies the compatibility lane
of D0, not the separate seeded quality/scale measurements or approval of D1.

## Findings

### 1. Removing the ordinary eight-cap is not a repair

- `src/domain/maze/structuredRooms.ts:15` caps the target at eight; the lattice
  search also cannot exceed that target. `randomSize` at line 91 already bounds
  each room side to at most seven cells. More floor area therefore does not
  require bigger rooms: it spreads bounded rooms across larger bands and joins.
  Coverage/route-quality consequences require measurements, not inference from
  connectivity alone.
- `nameRooms` at `src/domain/maze/structuredRooms.ts:58` has five specialty entries
  plus start/hub/exit. A direct nine-footprint call with interior hub index 4
  reproduces room `undefined-7`: undefined kind, name, and tags. This is a latent
  cap-removal failure, not a claim that current capped generation emits it.
  Simply cycling roles would still need a quest/chest/encounter policy review.
- `src/domain/maze/structuredGraph.ts:11` builds a neighboring-slot spanning tree
  with an optional explicit loop; `routeRoomConnections` at line 42 routes every
  edge through a reserved strip. `src/domain/maze/structuredGenerate.ts:19`
  allocates the entire rectangular cell grid, then carves rooms and connections.
  D1 needs module growth and legal direct socket joins, not just a bigger grid.
- Tests intentionally enshrine the old rules:
  `src/domain/maze/structuredTopology.test.ts:80` requires <=8 rooms; line 90
  requires `ROOM_BUFFER`; line 117 requires connection paths of at least three
  cells. Lines 105 and 143 enforce the tree and exact carved-link contract.
  `src/domain/maze/structuredGenerate.test.ts:21` and
  `src/domain/automation/autopilot.v2.test.ts:92` require `structured-v2`.
  Keep these as explicit legacy cohorts; add new-version expectations instead
  of weakening reciprocal-link, non-overlap, or reachability assertions.

### 2. Ordinary RPG consumers require a concrete, stable floor projection

| Owner / exact source | Compatibility consequence |
| --- | --- |
| `src/domain/types.ts:43`, `:49`, `:90`, `:107` | Layout versions currently mean v1/v2; rooms are rectangles with roles/tags; connections have concrete door cells/path; `MazeState` has global nonnegative coordinates, cells, start/end, active and discovery. Each floor archives that maze. A stream checkpoint is not this type. |
| `src/domain/gameFactory.ts:117`, `:166`, `:587`, `:612` | Creation and normalization generate only when cells are absent/empty; otherwise they copy saved cells/layout. Missing layout version defaults to v1. The layout normalizer explicitly selects fields, so new recipe/identity metadata will be lost unless deliberately preserved. Empty/corrupt persisted floors must not be silently reinterpreted as new-version worlds. |
| `src/domain/gameFactory.ts:521`, `:567`, `:573`, `:634` | Entry archives the current floor, reuses an existing target before generating, preserves target chest sets, and resets floor-specific autopilot state. `mazeMaxRooms` is a historical progression scalar: down multiplies by 1.3; `floorRows` at line 647 derives dimensions from its square root. It is not the actual room count. Do not reinterpret this saved scalar as the new module budget. |
| `src/domain/gameFactory.ts:226`, `:264` | Manual movement checks grid bounds/cells and uses start/end as stairs; floor-one start returns to town. Explicit `descendFloor` also gates on quests/chests. Preserve both existing paths and `triggerStairs:false`; geometry must not accidentally move the stairs or create an implicit reward/descent. |
| `src/domain/quests/questTargets.ts:3`; `src/domain/guild/contracts.ts:85`, `:103`; `src/domain/quests/quests.ts:80`, `:94` | Room membership is rectangular, with a legacy overlap preference for boss attribution. Guild IDs embed floor/origin/target room IDs; fetch requires an opened chest in the target room; kill progress can consult archived geometry. Role/tag allocation changes contracts and rewards, not just labels. Extra treasure rooms without reachable chests do not receive fetch contracts. |
| `src/domain/items/chests.ts:8`, `:44`, `:64`, `:90` | Chest placement prefers treasure centers, caps ordinary chest count at three, and falls back to linked cells. IDs embed floor and coordinates; saved opened/loot state is retained. Opening calls ordinary loot/inventory/fetch services. Preserve IDs, placements and reward state; do not import stream chest counters as RPG loot. |
| `src/components/maze/mazeFloor.ts:5`; `src/components/maze/drawMaze.ts:287`, `:544` | Both floor clipping and wall projection depend on the movement graph, but void handling is enabled only for the exact `structured-v2` tag. Merely adding a new version would paint void as floor unless these discriminators are updated. Classic/v1 isolated cells intentionally remain visible (`src/components/maze/drawMaze.test.ts:32`). |
| `src/domain/maze/solver.ts:24`, `:28`; `src/domain/maze/visibility.ts:44`; `src/domain/automation/autopilotState.ts:6` | BFS caches by cells-array identity plus dimensions/source, and visibility follows cell links. Never mutate cached topology in place. Persisted autopilot routes are fenced by floor, not generator version, reinforcing the no-regeneration rule. This whole-maze solver is privileged physics/diagnostic machinery, not automatically lawful Agentica navigation. |
| `src/persistence/saveRepository.ts:7`, `:53`, `:75`; `src/persistence/gameCustody.ts:39` | RPG saves use database `maze-battle` version 2, with normalization on read/write and an owned reducer inside the saves/meta transaction. `GameState.schemaVersion` is separately 1 (`gameFactory.ts:131`). Generation, record schema and IndexedDB schema versions are different contracts. |

Existing preservation proof points: `src/domain/gameFactory.preservation.test.ts:88`
round-trips active/inactive v2 plus v1 floors three times and restores a missing
active-maze field from its archive; `src/domain/gameFactory.test.ts:48`, `:202`,
`:229`, `:255` cover stairs, persisted state, explicit descent and claimed-quest
replay. `src/persistence/originalMaze.ts:10` validates original geometry rather
than regenerating it; `src/persistence/originalSave.test.ts:59` rejects corruption.
These do not yet prove compatibility with a new layout version.

### 3. Streaming machinery is reusable, but spaces-v2 is not an RPG save

- **Ownership and geometry:** `src/domain/expedition/topology/types.ts:4`, `:18`,
  `:56` separate recipe, reservations and atomic deltas. `generation.ts:22` in
  that directory derives scope from version/world/floor/level/seed; its room
  budget is `6 + 2 * level`. `expandTopology` at line 38 uses canonical FIFO
  sockets and socket-owned room IDs, but always adds one room, one passage and
  two connections. Contracting passages yields a tree, not loops. This is a
  source property, not measured branching quality or proof of reaching budget.
- **Bounded spatial work:** `src/domain/expedition/topology/placement.ts:15`, `:31`
  tries eight keyed candidates, then uses a previously reserved fallback; new
  reservations account for pending quota. `occupancy.ts:8`, `:43` bounds queries
  and rejects overlap. `src/persistence/topology/reader.ts:71` prefetches only a
  canonical frontier neighborhood and checks the exact 5x5/gap-one fallback.
  A reservation is never a walkable doorway. Keep these ownership/termination
  invariants; direct joins need a deliberate reservation/connection policy.
  They must bypass `src/domain/expedition/topology/geometry.ts:44`'s nonempty
  passage rectangle, not merely set the gap to zero.
- **Readers pin semantics, not just data shape:**
  `src/domain/expedition/topology/seed.ts:12` accepts only `spaces-v2`;
  `src/persistence/topology/validation.ts:31`, `:49`, `:81` pin the budget formula,
  revision/room arithmetic, entry cell, room dimensions, passage size, one chest
  per non-entry room and sockets. `src/persistence/streamRecords.ts:36`, `:59`
  additionally pins indexed sockets, fallback geometry and `stone-room-v1`.
  Changing only generation leaves saved-world readers inconsistent.
- **Materialization and movement differ:**
  `src/domain/expedition/topology/projection.ts:6`, `:12` derives local geometry
  and openings separately. `src/domain/expedition/schematic.ts:15` omits solid
  cells; `src/domain/expedition/streaming/movement.ts:11` crosses reciprocal
  `spaceId`-qualified ports. World origins may be negative
  (`topology/geometry.ts:38`). RPG consumers require a stable global-coordinate
  projection and explicit cross-module links, not concatenated local cells.
- **Durability differs:** `src/persistence/topology/types.ts:28` names the separate
  `maze-battle-topology-v2` database; `topology/database.ts:35` currently uses DB
  version 5. `topologyRepository.ts:32`, `:105` and `topology/commit.ts:10` keep
  recipes, occupancy, endpoints, revisions and replay receipts together.
  `streamRepository.ts:31` explicitly refuses adopting topology-only slots;
  `streamActions.ts:43` reconciles original results before epoch/revision fencing
  and commits checkpoint, knowledge, expansion and action receipt together.
  An RPG-save write plus a separate stream write would not be one transaction.
- **Gameplay semantics differ:** `src/domain/expedition/streaming/types.ts:18`
  contains exploration state, not party/inventory/quests/stairs.
  `streaming/transition.ts:39` marks a remembered chest and increments a counter;
  it does not run RPG loot/quest services. Its finish condition at line 58 and
  `src/persistence/streamValidation.ts:37` assume `2 * rooms - 1` visited/cleared
  spaces, `rooms - 1` chests, and even cap chest count by half the visited spaces.
  Direct room joins invalidate that arithmetic before completion, not just at
  finish. Do not weaken v2 validation globally to admit new worlds.
- **Keep public reads separate:** `src/persistence/streamMapRead.ts:12` reads
  saved knowledge with public-scope/revision fences, not generated topology;
  `streamMapCursor.ts:12` invalidates stale views. Host room snapshots are not
  actor knowledge. Preserve this distinction in any later RPG adapter.

Legacy stream tests also encode mandatory passages:
`src/domain/expedition/topology/generation.test.ts:20` expects two added spaces;
`adversarial.test.ts:110` expects `2 * rooms - 1`;
`transactions.test.ts:199` expects four directed endpoints per added room.
Replay/order/ownership tests at `generation.test.ts:80`, `:94`, `:108` are reusable
invariants, not permission to change historical recipes or receipt meanings.

## Smallest D1 Integration Path (Proposed, Not Authorized)

1. Freeze classic, structured-v1/v2, spaces-v2 and stone-room-v1 behavior. Add an
   explicit new assembly recipe and RPG layout discriminator (tentative names
   `spaces-v3` and `structured-v3`). Persist the chosen recipe/seed/policy and
   stable floor/module/connection identity for new floors only. Retain old
   dispatch/readers for both materialization and unfinished stream expansion;
   never relabel old receipts or regenerate saved floors from a new seed policy.
2. Evolve the existing topology assembly boundary, reusing keyed seeds, bounded
   occupancy, canonical expansion and atomic socket consumption. Add compatible
   direct door joins with optional passages and a total role allocator. Do not
   fork a Lab-only generator, adopt the reference `MemoryTopology` world maps as
   production storage, or add a third authoritative world store. Select growth,
   branching, role/tag and placement bounds from the other D0 evidence before
   coding; loops are not required merely to avoid a chain.
3. First wire a **bounded finite-floor projection** into ordinary creation and
   first entry to an unvisited floor. Translate module-local cells to a stable
   nonnegative floor origin, add reciprocal cross-module links, and produce the
   existing `MazeState` room rectangles/centers, stairs, connections and main
   route. A direct join can project to two adjacent door cells without a passage
   module. Persist the resulting floor in `GameState`; no live stream checkpoint
   or duplicate stream save is needed for this geometric repair. Cap the output
   bounding area/work explicitly: eager RPG projection is not proof of streamed
   or unbounded-world scalability.
4. Keep existing RPG movement, archives, chests, quests, inventory and save
   custody as the effect owners. Preserve the historical progression scalar;
   introduce an explicit new-version module budget policy instead of silently
   changing its meaning. Add targeted version-aware normalizer/render support.
   Stable generated IDs and role tags must survive normalization. More rooms
   must not accidentally mean a chest in every room or unbounded auto-accepted
   contracts; specify content policy separately without changing combat balance.
5. Exercise the same assembly through bounded expansion/replay tests and RPG
   projection tests. Before any new-version streamed execution, dispatch its
   readers/validators/completion accounting by recipe and count actual spaces
   and objectives, rather than v2 passage arithmetic. Leave old stream slots
   unchanged. New geometry usable in the actual RPG is the D1 gate; replacing
   its persistence or integrating Agentica is not required to reach that gate.

## Invalidation and Compatibility Acceptance

All are **required future checks**, not results of this D0 audit.

| Gate | Acceptance / invalidation rule |
| --- | --- |
| Geometry and roles | Multi-seed early/deep floors including >8 rooms; zero undefined kinds/names/tags, duplicate IDs, overlapping footprints, dangling/nonreciprocal links or unintended openings. Every stair, room center, chest and quest target is legal/reachable. Cover tiny/impossible input, direct joins, optional passages and honest bounded failure. |
| Quality and work | Before D1, commit numeric ranges from D0 measurements for module coverage/growth, degrees/forks/branch depth/endpoints, passage dependence and route distances, plus candidate/read/materialization/serialized-size budgets. A connected chain or enlarged sparse grid is insufficient. This lane supplies no measured quality ranges or performance claims; without their review D1 is not ready. |
| Projection identity | Same recipe/seed gives the same assembly and RPG links independent of demand/prefetch order; bounded incremental expansion and eager projection agree. Establish global origin once; never rebase persisted cells, chests or stairs when adding modules. No independently mutable module graph and cell graph. |
| Old saves | Classic/original, v1 and v2 active/inactive floors survive load-save-load, ascent/descent, town return and switching saves with geometry/IDs, discovery, chest opened/loot, quest claimed/reward, battle origin and routes unchanged except normal gameplay/established normalization. New policy applies only to new floors. Unknown/corrupt versioned records are rejected or reported, never silently regenerated as the latest version. |
| New saves | New recipe/identity fields survive every normalizer and browser save path; mixed old/new floor archives work. Fresh game and first descent actually use the approved new generator. Old-generation tests explicitly select old generation; new default tests do not inherit v2-only assertions. |
| Cache and route fences | Geometry replacement means a new cells array, invalidating `solver.ts:25` cache; movement-only updates retain topology. New recipe/world/schematic means a new residency instance (`src/domain/expedition/residency.ts:16`, `:25`). Do not reuse a saved route against changed floor identity. Stream scope/checkpoint/topology revisions fence map cursors, plans and new actions; original receipts still reconcile without repeat effects. |
| Stream compatibility | Resume partially expanded v2 with identical next delta, reservations and schematic cells; duplicate/raced/interrupted expansion preserves atomic endpoints and original receipts. Test old readers and new-policy readers separately, including direct-join traversal, occupancy prefetch bounds, storage quota failure and restart. In-memory tests alone do not qualify IndexedDB. |
| Player consumers | Ordinary renderer walls/floor/overlays agree with actual movement; old isolated-cell behavior stays intact. Manual desktop/mobile traversal, stairs round-trip, solver/Auto, ordinary chest/quest effects and reload must pass on representative new layouts. Use explicit no-encounter test policy, not balance edits. |

## Boundary With A0-A3 and Paired Qualification

D1 fixes geometry/versioning and proves ordinary-game usability. Per
`docs/agentic-play-next-slices.md:67`, A0 later pins exact host capabilities and
authority; A1 binds directed travel/recovery to RPG save commands; A2 implements
earned discovery and knowledge-safe targeting; A3 binds explicit ordinary
chest/quest effects and durable receipts. This audit does not qualify any of them.

In particular, `src/domain/guild/contracts.ts:93` and the ordinary solver inspect world
truth; sharing them is not an actor-knowledge boundary. The existing fetch rule
and stream collected flag also do not implement the survey-seal item plus return
objective. `docs/two-dungeon-qualification.md:66`, `:82`, `:108` require explicit
effects, fixed-action hidden-world equivalence and same-game authority, with live
model competence separately authorized. Static obstacles suffice; no remote
causal mechanism, protocol rewrite or provider run belongs in this D0/D1 repair.

## Evidence

**PASS:** existing focused offline tests, 15 files / 233 tests, unchanged source.
Dependencies were junctioned from the owner-authorized existing `node_modules`;
no install, service or provider was used. Command from this worktree:

```powershell
node node_modules/vitest/vitest.mjs run --maxWorkers=2 --no-file-parallelism `
  src/domain/maze/structuredGenerate.test.ts src/domain/maze/structuredTopology.test.ts `
  src/domain/gameFactory.test.ts src/domain/gameFactory.preservation.test.ts `
  src/domain/maze/solver.test.ts src/components/maze/drawMaze.test.ts `
  src/domain/guild/contracts.test.ts src/domain/quests/quests.test.ts `
  src/persistence/originalSave.test.ts src/domain/expedition/topology/generation.test.ts `
  src/domain/expedition/topology/transactions.test.ts src/domain/expedition/topology/adversarial.test.ts `
  src/domain/expedition/residency.test.ts src/domain/expedition/streaming/transition.test.ts `
  src/persistence/streamValidation.test.ts
```

**REPRODUCED:** nine-room role failure (no source edit):

```powershell
node --experimental-strip-types --input-type=module -e "import { nameRooms } from './src/domain/maze/structuredRooms.ts'; const rooms = nameRooms(Array.from({length:9},(_,i)=>({row:0,column:i*4,rows:3,columns:3,center:{row:1,column:i*4+1}})),4); console.log(JSON.stringify(rooms.map(r=>({id:r.id,kind:String(r.kind),name:String(r.name),tags:r.tags??null})),null,2));"
```

**NOT RUN:** new-generation repair/acceptance, independent D0 quality sweep,
Chromium/IndexedDB qualification, desktop/mobile traversal, Agentica/provider
trials. Test runner duration is not generator latency or memory evidence.
**Disposition: report committed for owner review; D1 remains halted.**
