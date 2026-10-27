# Architecture and bounded implementation slices

Design proposal • 26 October 2026 • No runtime changes made

Read the [executive memo](README.md), [measured evidence](evidence-and-reproduction.md), and [source/preservation register](sources-and-preservation.md) together. Field names below are sketches, not implemented APIs or an adopted interchange standard.

## 1. The durable product: construction capabilities

The project is a building and system-design playground exercised through a game. Dungeons are the present proving ground. They should test reusable capabilities for circulation, enclosure, openings, stairs, supports, furnishing, materials, and composition. Later, those capabilities can assemble houses, public buildings, streets, villages, towns, and cities, and compile their geometry into static assets.

Retain three useful artifacts from a successful generator: the recipe/program and its tests; the resolved construction description with dimensions, parts and relationships; and the generated meshes/materials. The mesh alone loses much of the ability to adapt an object to a new space. Conversely, retaining only a recipe without a reproducible resolved output makes inspection and external consumption difficult.

The shelving system is a concrete existing example. `shelvingBrief` accepts bounded dimensions, a profile, palette, mounting, row/column counts, reference height, seed and optional contents. Boards reuse the beam operator. It derives carcass members, partitions, supported storage bays, openings, optional doors and independently generated books. The model-pack adapter retains meshes, material slots, articulation, anchors, clearances and conversion metadata. This is the pattern to extend to more construction families.

A future `generateBuilding` should compose these capabilities through real spatial relationships. It should not duplicate their geometry code or become a giant switch statement that knows how to manufacture every prop, room and roof. Keep individual recipes and adapters small. Extract shared code when two real construction families need it; avoid introducing a universal procedural language before those needs exist.

### Distinct layers

| Layer | Question it answers | Current seam to extend |
| --- | --- | --- |
| Regional/dungeon program | What circulation and destination types belong here? | Module recipe/policy and bounded preparation |
| Space intent | Is this a passage, junction, chamber, stairwell, gallery, or another bounded form? | Target selection before `reserveCandidate` chooses bounds |
| Canonical spatial plan | Which spaces, solids, voids and connections actually exist? | `SpaceSpec`, schematics, sockets, occupancy and canonical world records |
| Construction recipe | How is a stair, opening, beam frame or shelf constructed? | Existing native stair and TileLab workshop recipes |
| Appearance | Which admitted materials, styles and condition fields apply? | Model packs, material bindings, masonry/timber UV policies |
| Gameplay and instance state | Is a door usable, a room safe, a cabinet storage, or a book collectible? | Existing game-owned role/content/interaction systems |
| Observation | What can this actor currently perceive and act upon? | Canonical observations and the bounded spatial projection |
| Output adapter | Live scene, bake, export, preview or diagnostic? | Existing visual instances, surface parts, batching and future exporters |

These are responsibilities, not a request for eight services or databases. The first implementation needs only the fields and functions required by its fixture.

## 2. Current generation trace and gaps

All paths below are relative to the pinned canonical-3d checkout recorded in the source register. Current source takes precedence over historical README text and older design documents.

| Stage | Observed behavior | Design implication |
| --- | --- | --- |
| `persistence/canonical/game/initialize.ts` | Fresh games call `createModuleRecipe(..., { spatial: true })`; bootstrap an entry room | The ordinary nonspatial profile is a comparison, not the current fresh-game default |
| `game/preparation.ts` | Next-floor seed is parent seed + 1 modulo 2^32; generation, quality, roles and content advance in bounded phases | New intent and counts must fit these phases; keep private preparation private |
| `topology/modules/policy.ts` | Room budget `6 + 2*level`; sides 5–15; spatial minimum 9; passage length up to 7 | Separate local requirements from global size; growth should count meaningful places/work rather than inflate each room |
| `modules/step.ts` bootstrap | Entry is a square chosen by clamping 9 to policy bounds | Entry/foyer size also needs intent; lowering only random candidate dimensions leaves this assumption |
| `modules/placement.ts` | Candidate dimensions/gap come from keyed seeds; each socket stores a room plus optional passage and combined reservation | Purpose/form must precede reservation; a passage cannot yet be an independent target |
| `modules/step.ts` validation | Checks room kind/dimensions, `socket-N:room` IDs, midpoint boundaries, exact reserved bounds, FIFO sequence, and counters | A new target kind requires actual contract work, not relabeling an existing room |
| `modules/assembly.ts` | Reproposes commits, checks scope/revision/request identity, consumes reservation and adds children | Preserve this useful deterministic proposal/commit kernel |
| `world/generation.ts` | Persists bounded steps; entry/exit anchors are centers; farthest room becomes exit at completion | Dedicated stair selection must be planned explicitly; current completion-time conversion explains the global clearance pressure |
| `expedition/schematic.ts` | Room seed selects symmetric solids/central solids/stripes, preserving cross/perimeter; passages open | Introduce explicit interior strategies; retain old patterns only as named experiments or selected profiles |
| `expedition/vertical.ts` | Stair-room schematic reserves three shaft cells and restores side bypasses; requires odd dimensions at least 9 | Keep working algorithm as the initial stairwell profile; do not merely remove its size guard |
| `world/records.ts` | Loads accepted schematic discriminators and regenerates the geometry | Changing only the renderer or only `materializeSpace` would leave an incomplete interpretation |
| `world/quality*.ts`, `world/roles.ts`, `canonical/content/` | Graph reductions, role/content cursors and IDs assume room ordinals | Separate spatial nodes from eligible chambers and reward budgets |
| `knowledge/observe.ts`, `world/residency.ts` | Read actual admitted geometry and connections for actor-local sight and movement | New shapes/openings must flow through this path; never give the player the full construction recipe |
| `viewModels/canonicalPerceivedMaze.ts` | Builds 2D view from knowledge; current actor must match observation sequence/address | Maintain exact 2D/3D agreement and stale-view rejection |
| `game/spatialProjection.ts` / `SpatialView.ts` | Transient disclosed stair geometry, bounded room/cell counts, snapshot binding | Construction metadata should be projected narrowly without leaking hidden targets or contents |
| `maze3d/scene.ts` | Builds exposed geometry, shared deck cuts, stair enclosures, doors, props and local colliders; random shelves attempted per eligible wall edge | Give the scene an explicit admitted furnishing decision rather than assigning purpose by wall RNG |
| `maze3d/timber.ts` | Groups roof coverage by height/datum, merges spans, clips obstacles and makes lattice members | Keep geometry math; add a construction plan when member identity/support matters |
| `StageTimbers`, `StageShelving`, `StageRenderer` | Material batches, placed visual instances, resource lifetimes, camera and collision presentation | Retain these backends and reconcile their active edits rather than rebuilding them |

`domain/maze/moduleGenerate.ts` is an eager floor-projection adapter and useful comparison path. It is not the canonical writer used by fresh-game initialization. The classic backtracker and structured-v2 routes are historical/alternate paths; repairing only those would not address the observed current dungeon.

## 3. Three realistic options

| Option | What changes | Benefit | Limitation and decision |
| --- | --- | --- | --- |
| A. Tune existing chamber graph | Smaller chamber bounds, more passage joins, empty interior strategy, explicit decoration opt-in | Smallest experiment; keeps most contracts intact | Still emits a chamber behind every passage. Measured passage-only experiment reaches roughly 9% passage area. Use as a control and early cleanup, not the long-term grammar |
| B. Extend the modules kernel with early space intent | Allow circulation/junction/chamber targets, selected profiles, local stair envelopes, separate place/content budgets | Reuses strongest existing systems; directly addresses purpose-before-form; supports later building composition | Requires coordinated changes to IDs/counters/quality/capacity/roles. Recommended in small verticals |
| C. Regional circulation network first | Lay out routes/zones and then attach rooms/buildings/plots to the network | Strong long-term fit for streets, mines, campuses and districts | Larger planner change, different spatial search and loop questions; do after B exposes concrete requirements |

B can later feed C. No need to choose between preserving today's assembler and ever supporting regional planning. Its occupancy, connector and construction capabilities can remain the realization layer under a different high-level program.

## 4. Minimal architectural intent

The first experimental family can be named `constructed-dungeon-v1`. Its purpose is a corridor-oriented constructed dungeon with empty ordinary chambers, meaningful junctions, and dedicated vertical transitions. The name is a proposal, not an existing registry entry.

Choose a target's form before sampling its bounds. Retain its resolved selection in the proposal/recipe binding so retries, replay and load cannot reinterpret it through a changed global default. A compact conceptual record is sufficient:

```ts
// Illustrative only; adapt to actual closed validators and capacity bounds.
type SpaceIntent = {
  profile: { id: string; revision: string };
  function: 'circulation' | 'chamber' | 'vertical-transition';
  form: 'run' | 'junction' | 'open-chamber' | 'straight-stairwell';
  purpose?: string; // absent is legitimate; not a gameplay reward role
  interior: 'empty' | 'profile-structure';
  furnishing: 'none' | 'purpose-plan';
};
```

Profile-specific bounds, lawful port directions, headroom and void requirements belong to the corresponding profile implementation. Do not store unlimited arbitrary fields or executable code in world records. Selected dimensions and reservations are concrete bounded data. Later, library/crypt/workshop purposes can supply actual constraints and optional named furnishing plans without becoming one combined enum with safe/treasure/boss.

Keep `SpaceSpec.kind` as room/passage initially if it remains useful to observation/rendering. A junction can be a passage with a selected junction form. Architectural purpose is an independent facet. Do not label every corridor segment as a chamber simply to satisfy current role code.

The new interpretation should have an explicit profile/schematic/recipe discriminator. Reuse modules-v3 implementation algorithms; do not silently change the meaning of an accepted recipe. A new recipe union member is reasonable if generalized socket targets and counters no longer fit the v3 shape. Disposable worlds can reset on that boundary; there is no requirement to maintain two full live runtimes or build a save migration.

### Budgets and quality

Count spatial nodes, eligible chambers, optional furnishing, and special gameplay content separately. A new junction must not create a chest, quest, boss, or safe-room assignment. Initial total growth can reuse the existing scale of work while its meaning becomes explicit. Keep bounded attempts and spatial/capacity failure; do not fill a failed circulation target with a large generic room as an invisible fallback.

Two different quality graphs are needed for diagnosis: the traversable graph containing circulation and transition nodes, and a reduced destination graph for route structure. Count meaningful branches after collapsing ordinary degree-2 corridor segments. Otherwise, a good long corridor can violate the old anti-chain threshold, while splitting it into artificial junction IDs can make a poor layout appear better. Preserve the old predicate for old recipes. For the new family, test connectivity, legal ports, route depth, branch distribution, and per-floor circulation/room measures with explicit definitions. Loops can remain deferred; the existing quality contract assumes a tree with joins = rooms - 1.

### Scale is an architectural input

At current 3.2-unit cell pitch, even 5×5 is a 16×16-unit footprint; 9×9 is 28.8×28.8 before wall allowances. The current avatar is 2.7 units high. Merely calling a five-cell chamber “small” is insufficient.

Do not change global cell pitch, door size, or avatar scale as a hidden fix. Compare several deliberately bounded chamber profiles at the current pitch, including a new three-cell-side candidate where lawful ports and headroom permit it. Allowing such a candidate requires a new policy validator and gameplay/clearance checks. Select provisional size bins from the same-scale views; do not canonize numerical proportions now. Narrow passage width and a broad chamber's circulation/support needs are different constraints.

## 5. Dedicated stairwells without throwing away the staircase

The current source already has real physical stair assembly and traversal. Older documents describing three flat stair markers are superseded. Keep the parametric `straightStair` model, floor/landing anchors, clearance volumes, shaft reservation, enclosure, deck opening, canonical WorldStairs relationship, crossing custody and both manual/Auto presentation paths.

The required improvement is primarily allocation and composition: give the flight, landings and approach/departure their own deliberate bounded space. The initial dedicated profile can retain the current nine-cell minimum and working straight flight. It need not solve compact switchbacks, spiral stairs, arbitrary orientations or variable-height floors in the same slice.

### Resolve the exit-selection dependency honestly

Today the farthest completed room becomes the upper stair room. Its geometry was reserved earlier without knowing that purpose. Keeping all rooms stair-capable works technically but imposes the global minimum.

For the new family, the floor program carries an explicit exit-stairwell obligation. Reserve a terminal stairwell envelope at a lawful seeded frontier before ordinary neighboring reservations can consume it. Its placement can be selected by bounded route-depth/context scoring; it need not be literally the farthest chamber. Keep the reservation until realized and account for its work in the floor budget. If no legal reserved endpoint exists within bounded alternatives, reject the candidate floor preparation cleanly.

Do not finish an arbitrary floor and append stairs opportunistically into whichever space is left. Do not simply remove `minSide=9` while retaining “farthest arbitrary room becomes stairwell.” Both approaches undermine the stated purpose and reliable placement.

Changing selected exit from farthest room affects `generation.ts`, floor validation in `records.ts`, quality/role/content binding, preparation completion, and tests. Record the designated exit identity explicitly. The farthest metric can remain a diagnostic. A cheaper allocation experiment may retain farthest selection only among previously reserved stairwell-eligible targets, provided it does not reimpose clearance on every chamber; compare this in a fixture before choosing the implementation.

### Stairwell contents and interface

Describe entry threshold, optional vestibule/turn, lower landing, flight, upper landing, exit threshold and the protected volumes between them. Door/port directions must avoid the reserved shaft and approach. Both ends must connect through actual canonical ports; the renderer must not choose a neighboring destination. Keep lower-floor alignment tied to the approved endpoint relation.

Current canonical recipe values (4.68 rise, 9.36 separation) differ from the current rendered construction projection (4.98 spacing, 9.6 separation). `constructionOffset` intentionally applies that mapping once. Preserve the distinction during the first stairwell proof. A later cleanup can unify a new recipe's geometry basis if it has a concrete benefit, but must update `StairTraversal`, Auto ramp replay, floor registration, deck cuts, enclosure, doorway planes and recovery fixtures together.

The active uncommitted `stairFinish.ts`, support strategies and material controls are valuable development work. Carry them forward as explicit appearance/construction options; they do not justify putting posts or braces into every empty chamber. Their present player-position-dependent placement filtering is a presentation safeguard, not a deterministic architectural plan suitable for baking. Construction reservations should decide admissible supports upstream; transient player avoidance must not decide a static asset's geometry.

A multi-storey hall with a balcony and stairs remains a legitimate future profile. Dedicated stairwells are the default for this dungeon family, not a prohibition on internal stairs elsewhere.

## 6. Purposeful framing and furnishing

### Framing

Keep interval union/subtraction, roof coverage, aperture clipping, UV phase and material batches. They solve useful geometric problems. Introduce stable member identity above fragments when a profile needs real framing: member role, span axis, intended endpoints/bearings, cross-section, join/termination policy and UV datum. A rendered fragment references its member and retained interval. A batching or visibility split should not imply a new timber cut face.

Current `TimberMember` has bounds, role, axis and origin, but no stable member ID, bearing references, or reason for a termination. The sampled diagnostic also produces joists up to about 47.456 world units long. That is a span requiring deliberate construction policy, not proof of a structural-engineering failure. Do not invent universal real-world load limits. Use bounded profile rules such as shorter rooms, bays, beams/piers or a deliberately unsupported fantasy assembly, and label their intent.

Compare cleaned-up rooms before replacing the timber planner. Then isolate long passage, turning passage, junction, wall opening, chamber, stair opening and multi-bay hall fixtures. Distinguish a physical joint, a mesh subdivision, a material transition and an observation clip. A physically continuous member may be rendered in several visible pieces without fake end grain at the cuts.

### Furnishing

An ordinary empty room has `furnishing: none`. A library can ask for bookcases through wall-bay/alcove anchors after its circulation and usable floor are reserved. A storage room can ask for cabinets or open shelves; their existence does not automatically create inventory storage mechanics. Reuse the same shelf recipe with different bounds rather than authoring a new hardcoded mesh for each room.

Preserve consumer scale 1 for the selected shelving packs: authoring-to-local scale 1.6 and V conversion are already baked into those exports. Do not apply them a second time. Preserve both closed geometry and door-sweep metadata. In-flight cabinet interaction should remain a distinct visual/behavioral capability with its actual tested scope; do not infer canonical item ownership from a movable mesh.

Any furnishing that blocks an otherwise promised route must be represented in canonical clearance/geometry or constrained to a harmless reserved subcell envelope. Current shelves can contribute visual colliders; a future semantic placement system should explicitly prove manual and Auto route feasibility against the same admitted plan. Removing random shelf placement must not remove canonical chests or relocate gameplay entities by appearance RNG.

Environmental condition remains a separate material system. A shared deterministic surface field can span meshes; soot or moss should not follow arbitrary SceneBox boundaries. Retain substrate UV alignment and material-family identity. Ordinary wear is not a real opening, and a decorative book is not a collectible item.

## 7. Live construction and offline model production

“Renderer” in the long-term goal includes a compiler that realizes a construction recipe into an object asset. It is more than a screenshot tool. Keep the same resolved construction available to both outputs:

```text
recipe + exact inputs + seed + profile/material revisions
  -> resolved assembly (parts, surfaces, joints, anchors, voids)
  -> meshes + UVs + material bindings
       -> live instances/batches under authorized game observation
       -> offline bake -> portable model + metadata sidecar
```

Use existing `VisualAsset`/`ModelPack` and TileLab construction candidates as the starting substrate. They already express explicit surface meshes, hierarchy, local transforms, states, slots, anchors and bounds. Extend only a missing capability required by a real export; do not impose a new shared universal world schema on both repositories.

Recommend GLB/glTF as the first evaluated textured interchange target, with optional OBJ for geometry-oriented consumers. Three.js has a glTF exporter with meshes/materials/textures and optional animation; its built-in OBJ exporter does not export MTL material data. Blender supports glTF import/export. These are format/tool capabilities, not evidence that this project's shader/material pipeline will round-trip correctly. See the official links in the source register.

Keep construction metadata in a sidecar: source recipe and exact resolved parameters; geometry/material/profile revisions and hashes; coordinate basis and units; anchors/ports; bounding/operating volumes; part/member identity; and declared state/animation treatment. A mesh file does not become canonical navigation, a puzzle schematic, or proof that a building can be entered.

### First export proof

Export one existing shelf/cabinet and one straight-stair assembly from their complete local authoring definitions. Produce a static closed cabinet variant first, retaining its articulated source. Import each in a fresh Three.js scene and in Blender or another independent consumer. Compare bounds, orientation, named anchors, UV repetition, material slots, alpha, normals, texture closure and appearance at scale. Include one nondefault seed/dimension variant to show the recipe remains reusable.

Then bake one bounded stairwell assembly with wall/deck openings, framing and explicit thresholds. Generate it as a complete authoring asset, not from a player camera's currently disclosed scene. Bake internal-face elimination only with the full assembly context; modular shared boundaries need an explicit ownership rule. Preserve useful objects/parts before optional mesh merging.

World-space material projection must become portable UVs or an explicit supported shader contract. Condition fields may be baked into finite textures with a shared border/halo; their bake resolution, scale and boundaries must be named. Runtime custom shaders, animated texture interpolation and emissive controls may not export faithfully. Static variants must declare their selected state/frame, while source animation frames/order/timing remain preserved separately. Unsupported features should produce a clear diagnostic or documented approximation.

### Granularity and caching

Begin with object and bounded assembly exports. Later choose room, building or street chunks based on measured reuse, culling, texture and reload costs. Do not bake an entire extensible dungeon or city into one permanent mesh by default. Cache by resolved recipe/input/profile/material/adapter identity, not by a UI label or visit order. Geometry and materials may invalidate independently. Repeated components should share source assets where useful without making all instances share mutable game state.

## 8. Path from dungeons to settlements

| Proof | Reused capability | New question to solve |
| --- | --- | --- |
| Empty dungeon with runs/junctions/chambers | Seeded sockets, bounded occupancy, open interiors | Does the place read as circulation and destinations? |
| Dedicated stairwell | Existing stair recipe, openings, lawful floor travel | Can the two approaches and reserved volume agree? |
| Small purposeful room pair | Shelf/support/opening recipes | Does purpose change the plan before decoration? |
| One two-storey building | Enclosure, floors, stairs, beams, furnishing anchors | Do interior, exterior, roof and flue/voids derive from one envelope? |
| Two neighboring buildings on a street | Building instances, shared joints and parcel occupancy | Do party walls, eaves, jetties, entrances and street clearance agree? |
| Small village/town block | Street routes, parcels, building programs and styles | Can functions cluster with understandable access and service relationships? |
| District/city composition | All prior capabilities with bounded regional planning | How do roads, public spaces, density, streaming and distant detail compose? |

Town services can gain physical hosts without requiring a full economy or NPC simulation. Inaccessible interiors still reserve volume. Function and construction determine form; region, culture, species and faction contribute explicitly composed styles rather than arbitrary recolors. No default historical region is selected by this plan.

Treat physical relations within their declared realm. Ordinary neighboring buildings, wells, sewers, cellars and mines obey shared volume constraints. A magical dungeon entrance can lead to a separate realm; only the local threshold consumes the host's space. Do not infer realm separation merely from the word dungeon. Current guidance is not proof of an implemented realm runtime, portal enter/return, or excavation system.

## 9. Small implementation slices and acceptance

All slices below are future work. Before starting, re-read the current source and reconcile the active owner's changes. Use an isolated owned implementation checkout; this planning turn creates no worktree or code branch.

| Slice | Exact first surfaces | Completion evidence |
| --- | --- | --- |
| P0: preservation and baseline | Source register, active owner branch, existing `docs/3d-exploration-plan.md`, selected asset pins; narrow fixture harness | Stable source/dirty hashes; replay of representative seed maps; owned in-flight work preserved; no competing renderer rewrite |
| P1: intentional empty baseline | `expedition/schematic.ts`, `world/types.ts`, `world/records.ts`, `world/generation.ts`; explicit scene furnishing input in `maze3d/scene.ts`; corresponding recipe/observation projection only as needed | Selected ordinary rooms have no arbitrary omitted cells and no random shelves. Existing special content remains game-owned. Shelf workshop and explicit furnished fixture still work. Existing stair geometry unchanged |
| P2: one circulation vertical | `modules/{policy,types,placement,step,assembly,quality}.ts`, `expedition/types.ts`, `topology/geometry.ts`; canonical `world/{generation,records,quality*,roles*}.ts`, `canonical/content/`; `game/{preparation,floorCapacity}.ts` and actual capacity allocators | A real passage target can branch without spawning a chamber; one lawful junction, one destination chamber, one bounded failure fixture; accounting/quality/content/knowledge consistent through canonical preparation |
| P3: dedicated stairwell allocation | `expedition/vertical.ts`, `world/generation.ts`, `world/records.ts`, floor/role/content binding; `game/spatialProjection.ts`, `SpatialView.ts`; scene/deck adapters only where necessary | New family reserves entry/exit stairwell envelopes; small ordinary chambers coexist; two legal approaches, correct floor binding, down/up round trip, reload and 2D/3D parity; existing crossing/cancellation behavior retained |
| P4: construction and furnishing intent | Profile-specific planning adjacent to `timber.ts`/`supports.ts`; `StageTimbers`; purpose anchors into existing `shelving.ts`/`StageShelving`; TileLab recipe only if a new operation is needed | Stable member identity and sensible termination in selected fixtures; explicit empty/library comparison; no hidden RNG coupling, blocked canonical route or material phase reset |
| P5: one portable export | Existing TileLab construction/model-pack seam and Maze Battle `assets3d/models` consumer adapters; new bounded exporter only in its owned repo | Shelf and stairwell import independently at correct scale/UV/materials; retained recipes regenerate variants; missing textures/unsupported materials fail clearly |
| P6: one building then adjacent pair | New building composition using accepted room/opening/stair/roof recipes and parcel constraints | Matching exterior/interior plans and cutaways; roof/headroom/street/neighbor agreement; complete authoring export plus separately admitted game projection |

P1 is the smallest useful visible cleanup. P2+P3 establish the first complete corridor-oriented dungeon family. If P2 needs too much canonical accounting at once, implement one fixed typed circulation fixture through the existing preparation phases before broad seeded generation. Do not declare the family done after a preview-only pass.

For P1, an all-empty diagnostic is acceptable before reward/content integration; explicitly distinguish that fixture from the normal game. In the normal game, a special chest, objective or stair is not an arbitrary decorative obstruction. Generic room growth must not imply extra rewards.

### First family acceptance

Use explicit seeds 1, 2, 3, 7, 42, 73, 1729 and 3735928559 at depths 1, 10 and 30, plus small prime budgets and supported capacity edges. Keep the current seed/recipe output as baseline. Same-seed maps across different recipe interpretations are controlled comparisons, not an expectation that topology remain identical.

Measure chamber count/area/aspect/physical dimensions, passage area and centerline runs, meaningful junction degree, reduced destination branches, route length, empty fraction, intended supports, props by placement rule, stairwell size/clearance, candidate work and capacity failures. Report per-floor results, not just averages. Set provisional visual targets from actual same-scale comparisons; no single passage ratio is a universal owner requirement.

For a new empty ordinary profile, absence of arbitrary solids and unrequested furnishings is an exact rule, not merely an improved percentage. For purposeful supported rooms, distinguish required structure from clutter. Check every advertised port is reachable with reciprocal links and legal door clearance; unlinked rooms must not gain false openings.

Capture overhead IDs/bounds/sockets and first-person views of one run, turn, junction, chamber, and both stair approaches at the same scale and lighting. Include normal fog plus separately labeled fully revealed authoring views. The owner's original screenshot seed is unavailable in this turn; use labeled equivalents until its fixture is known.

Run focused existing domain/canonical/scene tests, then current production/fixture type checks and the relevant native-browser cohorts when implementation exists. Key cohorts include canonical stairs, actual-App stair integration, canonical 2D/3D, shelving and restoration/3D integration; discover exact current config paths rather than copying stale commands. Test manual/Auto route agreement, stale commits, interruption, battle/town return, stopped Auto, source-cell rejection, save/reopen and resource disposal. No live provider is needed for this geometry proof.

## 10. Risks and remaining decisions

| Risk | Containment |
| --- | --- |
| New intent is sampled after geometry or recomputed differently on load | Bind resolved intent/version into proposal/recipe/schematic and validate exact replay |
| Circulation nodes inherit room rewards or invalidate ordinal loops | Separate spatial node enumeration from eligible room/content enumeration; update capacities and cursors together |
| Old anti-chain metrics reject intentional corridors | Measure reduced destination graph; maintain per-floor connectivity and meaningful branching |
| Exit designation changes break stair binding | Reserve explicit terminal profile; update floor validators and completion binding; retain canonical reciprocal travel |
| Small rooms expose doors/props/support clearance assumptions | Compare physical dimensions and test all admitted openings/paths; keep first stairwell roomy |
| Clearing shelves accidentally discards useful authoring work | Change default placement policy, preserve recipe/model family and explicit workshop/room fixtures |
| Renderer supports vary with current player pose | Use upstream construction/clearance decisions for stable geometry and baking; keep transient safety as presentation only |
| Nice exports conceal hidden surfaces or omit materials | Bake complete authoring assemblies, reimport independently, retain metadata and explicit unsupported-feature reports |
| Dirty checkout evolves during planning | Recheck hashes before implementation and measurement reuse; HEAD alone is insufficient |
| Style or authoring metadata leaks hidden facts | Project visible appearance separately from full semantic/authoring records and canonical group facts |

No immediate user question is required. Recommended provisional choices are the constructed-dungeon family, empty ordinary baseline, existing straight stair as its first dedicated stairwell, preservation of all useful shelf variants, and a GLB evaluation after the geometry vertical. Human comparison should decide room scale, circulation rhythm and construction appearance. The permanent core art/style baseline, compact/turning stair priorities, supported export consumers, animated export treatment and first physical-town functions can remain open until their proof is concrete.

The success condition is reusable construction competence demonstrated in a better dungeon, then in portable assemblies and coherent buildings. It is not a one-off dungeon aesthetic patch or a mandate to build a complete city engine immediately.
