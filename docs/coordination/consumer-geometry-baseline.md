# Consumer geometry baseline and admission notes

Status: **Maze Battle consumer notes, 26 October 2026**.
The shared proposal is the exact peer text in [spatial-contract-v0.1.md](spatial-contract-v0.1.md).
These notes add source measurements and consumer integration details; they are not
a competing contract version, implemented runtime schema or save migration. This document
refines the [joint brief](https://docs.google.com/document/d/1J2fJ7NUnpP3aBx35Ppif8bvNSEIZWoIRIlLDkwLfxFY/edit)
against inspected source. Changes to the shared proposal require a new digest and response.

The updated architecture brief's §6.6 adds a material scope clarification:
[realm-scoped geometry and magical portals](../design/spatial-domains-and-portals.md).
The physical transform/stacking notes below apply within a declared realm; they do
not require town and remote dungeon volumes to share one Euclidean embedding.
Current floor/stair types are baseline facts, not proof of a realm/portal runtime.

## Frames and current measurements

| Frame | Inspected convention | Required treatment |
| --- | --- | --- |
| Source asset | Minecraft source models/UV16 in selected material exports | Source basis stays provenance; normalize through the existing adapter |
| TileLab authoring | Right-handed, X right, Y up, Z front, floor-center origin, `blocks` | Declare world-units-per-authoring-unit explicitly; no cross-repo default |
| Part/instance | Parent-local positions, pivots, Euler radians in visual model parts | Compose parent transforms in order, convert normals/bases correctly |
| Logical cell/room | Integer row/column, canonical space identity and earned adjacency | Cell identity does not prescribe visible cube count or detail pitch |
| Floor/stair (current runtime) | Versioned `FloorFrame`/stair placements in `domain/expedition/vertical.ts` | Preserve existing serialized frame and recipe semantics; not proof of magical portal support |
| Game world | X follows columns/east, Z follows rows/south, Y up | Apply source-to-world conversion exactly once and retain placement pins |
| Render-local | Scene subtracts the selected origin cell/floor frame | Rebase presentation without changing canonical IDs or saved positions |

Inspected committed consumer baseline: `e9b658218c160de2300fe7cc2a6a109b9a8d5632`
on `codex/canonical-3d-exploration`.

| Quantity | At this committed baseline | Evidence |
| --- | --- | --- |
| Cell pitch | 3.2 world units | `constants.ts::CELL_SIZE`, `vertical.ts::SPATIAL_CELL_SIZE` |
| Wall height / slab / wall thickness | 4.5 / 0.18 / 0.16 | `maze3d/constants.ts`, `maze3d/scene.ts` |
| Door aperture | 1.8 wide, 3.3 high | `constants.ts`, `scene.ts` doorway panels |
| Stored stair rise / separation | 4.68 / 9.36 | `vertical.ts::STAIR_RECIPE` |
| Existing architecture preview scale | 1.5 world units per authoring unit | `ArchitectureExhibit.ts`; preview choice only |

These are baseline facts, **not selected permanent design constants**. The active
dirty repair was separately observed with 4.8 wall height, 4.98 presentation floor
rise and 9.6 presentation stair separation. That observation is not committed
acceptance. Reconcile the repair's final source, reproducer and evidence before
publishing consumer measurements. Never update saved stair frames just to match UVs.

Proposed matrix convention for exchanged placement descriptions: column vectors,
rightmost transform first, explicit `T_target_from_source` naming:

`p_world = T_world_from_floor * T_floor_from_room * T_room_from_instance * T_instance_from_part * p_part`.

The source-to-authoring normalization and authoring-to-instance scale must each
appear exactly once in the chain. This notation describes the exchange; existing
runtime helpers remain authoritative until deliberately adapted. A mirrored or
nonuniform transform needs explicit normal/winding/UV treatment, not silent support.
The chain is intra-realm. A cross-realm portal instead names explicit canonical
endpoints and transition/return semantics; it does not assert shared physical
coordinates, occupancy or a dungeon volume beneath the entrance.

Resolve repeated placement as `origin + basis * (pitch * integer_index + offset)`.
Do not accumulate floating increments. The long-term project-owned construction
quantum, allowed rational subdivisions, exact-versus-float policy and legal
quantization points remain decisions for both owners. Do not equate current 3.2
cell pitch with TileLab's source block or force every logical cell into one cube.

## Joins, vertical composition and materials

- Use one canonical shared boundary identity. The inspected scene compiler emits
  shared walls/openings once using north/west ownership when both cells are present.
  Reciprocal knowledge, corners and disclosure changes need fixtures before treating
  that implementation rule as the whole cross-repo boundary contract.
- Define an opening from one plane, aperture, floor datum and orientation. Both
  sides, the real door leaf, surround and threshold must reference it. Preserve
  canonical travel decisions even when the visual door changes state.
- Distinguish abutting/watertight joins, intentional overlap, visible material joints
  and intentional voids. Validate transformed surfaces/edges; AABBs alone cannot
  prove watertightness or clearance of a curved arch.
- Derive floor finish, wall endpoints, slab undersides, ceilings, risers, treads and
  landings from compatible datums. Cut every affected stair deck/ceiling surface.
  Test reciprocal ascent/descent and round trips with preserved stored frames.
- Continuous masonry needs a documented projection basis, physical period and
  common phase datum. Grain, end grain, pinned door atlases and terminating trim
  may have distinct policies. Do not resize the structure to complete a UV repeat.
- Report topology gaps, UV discontinuity, shading artifacts and behavioral clearance
  independently. Use named tolerances in world units and UV periods; retain exact
  lattice checks separately. Numerical tolerances are fixture-specific proposals
  until reviewed, not one global epsilon.

## Minimal descriptor exchange

Reuse `tilelab-workshop-v1`, `tilelab-geometry-candidate-v1`, material-export v1/v2
and the current `maze-visual-model-pack-v1` where supported. This proposal adds an
installation evidence sidecar concept; it does **not** add fields to those schemas.

| Category | Producer supplies | Consumer records/verifies |
| --- | --- | --- |
| Identity | Semantic ID; recipe, geometry/layout, material revisions; descriptor and payload hashes | Selection and independent placement revision; supported adapter; preserved replacement identity |
| Frames | Source/authoring basis, units, origin/pivot, local bounds, supported transforms | Explicit conversion, full parent chain and derived world bounds |
| Composition | Named anchor positions, normals/up, openings, supports, voids, reserved clearances | Target boundary/socket, intended joint type, door states/sweep, installation-specific clearance |
| Visuals | Material roles, UV basis/period/phase, face orientation, transparency, complete animation | Atlas conversion, projection datum, actual renderer state and resource constraints |
| Evidence | References, observations versus intentions, regeneration pins, validation and limits | Independent closure check, measured fit, fixtures, screenshots and scoped admission decision |

Unknown units, unsupported transforms, changed pins or unproven fit remain
unadmitted with actionable diagnostics. A producer's `review` value cannot accept
a consumer placement. Retain candidate, validated, reviewed and admitted evidence
separately rather than inferring one global success state.

## Exact consumer integration seam

1. Producer exports an immutable selected workshop package. Maze Battle owns
   `scripts/asset-selections/workshop-first-slice.json` (or a new explicit selection).
2. `scripts/import-workshop-preview.ts::importWorkshopPreview` checks manifest and
   payload pins, delegates geometry validation to `scripts/workshop-geometry.ts`,
   and adapts to `src/assets3d/models/contract.ts::ModelPack`.
3. The existing `--write` preview path is `public/assets/model-packs/lighting`;
   `ArchitectureExhibit` consumes it through `VisualInstance`. Neither step installs
   a door surround in the canonical scene.
4. The actual iron door is `iron-door-source`, selected through the separate
   interactables model pack and sized in `StageInteractables.sync`. Its source
   geometry, closed/open poses and world normalization must be included in a real
   surround fixture. The runtime's nonuniform normalization is existing behavior,
   not a recommended universal scaling policy.
5. A future installation adapter must bind the surround and actual door to the
   same scene opening, preserve boundary ownership and independently qualify all
   affected canonical behavior. That adapter/admission path is **pending**.

## Initial regression and open gates

The checked-in original independent-arch geometry is pinned by SHA-256 in
`tests/fixtures/architecture/provenance.json`. The read-only
`scripts/check-architectural-fit.ts` uses current game constants and the existing
convex-solid validator. It detects an obstructed door aperture at scale 1 and a
wall/cell envelope exceedance at the existing preview scale 1.5. Those are measured
numeric preflight failures, not a diagnosis of every visible seam. It does not use
the real iron-door mesh or simulate its hinge, and never issues admission.

Pending joint acceptance corpus: actual iron door plus a newly fit-aware surround,
closed/open and threshold/junction views; shared-wall two-room traversal/phase;
stacked floors with reciprocal stairs/apertures; distant indexed repetition;
rotated/mirrored corner fixtures; logical-cell footprint variants; material-only
UV correction; old-save reload and 2D/3D parity. Each fixture must pin revisions,
transform chain, numeric tolerances, measured failures, screenshots and UNKNOWNs.

Questions requiring a recorded peer response: world-unit/construction pitch policy;
exact indices versus continuous offsets; shared boundary/anchor naming; final
floor/portal presentation conversion; masonry phase datum; smallest installation
sidecar and compatibility/version policy. The outgoing handoff identifies concrete
next actions without changing either active geometry implementation.
