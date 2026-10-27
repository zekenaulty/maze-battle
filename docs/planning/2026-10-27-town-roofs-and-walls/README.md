# Small town: roof, eaves and finished wall stretch goal

27 October 2026. Local planning update following the owner's two town references and supplied white-concrete texture. Implementation status: **planned**, with read-only source/material inspection completed. The P3–P6 construction proof remains preserved at `1d3e515`.

## Revised first-town target

Keep the town small and spend the first milestone on one convincing building, inside and outside. The 8–12-building town remains a later composition target; it is not the first visual acceptance gate. First finish the guild/library building as a reusable construction example, then use the inn to demonstrate a different functional plan and silhouette. Compare a small neighboring pair before growing a block.

The owner-supplied images guide steep pitched roofs, substantial eaves, readable timber frames, pale infill, stone bases, varied gable heights, dormers and chimneys. These are illustrative references, not evidence of a particular historical period or a mandate to reproduce a stock scene. Their image pixels and watermarks are not construction assets. The first profile remains provisional within the shared game language; later regional/cultural/faction profiles can vary construction and form as well as color.

**Stretch goal R:** create a reusable pitched-roof and eaves system in TileLab, qualify one finished building envelope with usable interior space, then explicitly select and integrate the candidate into Maze Battle. Deliver quality that remains visible at eye level, under the eaves, inside the roof and at street distance. The prototype belongs in TileLab first.

## First reusable roof

Start with a rectangular two-slope gable, ridge along the building's long axis. The host supplies its actual wall-plate/support datum, footprint, permitted projections and roof/attic clearance. A bounded recipe resolves pitch, ridge height, thickness, eave/rake overhang and member spacing. Ridge height follows span and pitch; it is not a decorative peak placed independently of the interior.

The first roof includes:

- Real covering/deck thickness with separate outer covering and underside materials, supported rafters, named wall-plate and ridge/purlin connections, and tie/support intent where needed.
- Eave and gable overhangs, fascia/barge boards, visible rafter tails and optional soffit boards. Every visible edge terminates deliberately; a double-sided paper plane is not the finished roof.
- Stable member/anchor IDs, source recipe and material pins, measured grain along sloping wood, real endgrain faces, and roof-cover UVs measured along the slope. Courses follow the eaves; textures are not stretched to fill a whole roof.
- A true roof envelope and reserved attic/headroom volume. An unused attic can remain inaccessible, but still occupies space. No third playable storey is inferred from a roof silhouette.
- A complete textured asset, cutaway/section views and the retained procedural brief, followed by portable export/reimport at the declared scale.

A lean-to porch/shed roof is the next small extension. Hipped roofs, dormers, chimney penetrations, valleys, intersecting gables and the more exaggerated curved forms in the second reference are further stretch work after the simple roof fits and renders well. Penetrations require actual cuts, framing and weather/joint treatment; they are not solids pushed through an uncut roof. Simulated structural loads and weather are outside this visual prototype.

The roof surface should use one deliberately selected covering first, such as a subdued shingle or slate family. Existing wood supplies the frame, fascia and underside. Separate shingles need not each become a mesh in the first distant roof; near-edge thickness and silhouette should come from geometry, with course/detail density chosen after measuring cost. A targeted output-name search did not identify a dedicated slate/shingle/plaster delivery; that is not a complete catalog audit. A final covering remains an explicit material selection.

## Finished walls and tint

Use separate semantic material roles for exterior infill/render, interior plaster, timber framing/trim and stone plinths. Exposed timber should be real frame members and openings should have proper reveals/sills/heads. Interior and exterior finishes can share a neutral source where appropriate, while retaining independent pigment, roughness and wear choices. Do not paint an entire timber-frame building into a repeating wall texture.

The useful first wall material is a light, largely neutral, low-frequency-balanced plaster/render albedo with restrained grain and wear. A quieter interior variant and a somewhat rougher/weathered exterior variant should be compared. Avoid baked directional shadows, highlights, strong edge bands and one conspicuous crack pattern per tile. These are material briefs for later authoring, not image-generation requests in this task.

Tint should be a separate, deterministic visual parameter applied to the source texture under ordinary scene lighting. Start with the neutral base plus warm ivory, muted ochre and subdued gray-green comparisons; those are comparison swatches, not a permanent palette. Shade caused by light remains distinct from pigment. A tint cannot heal a seam or turn one material's large-scale crack structure into another material.

Current consumer evidence matters: `ThreeAssetLibrary.material` resets loaded textured materials to white. Its fallback color is not an implemented texture-tint control. Introduce an explicit tint binding for the selected new profile and include the resolved tint in the material cache key, or create owned material instances. Shared source textures can remain shared; changing one house must not recolor another through a mutable shared material. Apply separate bindings to inside/outside wall faces and reveals without duplicate coplanar skins. Define input color space and let the standard renderer/exporter perform its normal color conversion.

The current portable adapter already hashes material color and the installed GLTFExporter writes `baseColorFactor`. A standard base-color tint is therefore the first portable route to qualify. It still requires a round-trip comparison; it is not already supported by the current wall UI. Begin with albedo and scalar roughness. Normal/roughness maps, procedural grime and custom shaders need separate support/closure tests; the current P5 exporter explicitly refuses unqualified additional maps. Preserve the neutral original rather than baking every tint into a separate source PNG.

## Supplied material: actual findings

Source: `D:/maze-quest/MazeQuestTileLab/output/run-20261026-185717-578ce76e/white_concrete/materials/white_concrete/repaired_seam.png`.
SHA-256: `e214b6e59bcbc3af46f28bd2de41b6a03a7047c3c4021f39378a520fb968840b`. The 1024×1024 source is fully opaque. Its generation report calls it pigmented concrete, not a qualified plaster delivery; treat weathered infill as a proposed use.

The file's opposite RGB edges match exactly. Its saved 3×3 preview nevertheless has dark grid lines. The source repair applies periodic adjustment followed by an eight-pixel wrap blend. Measured edge-adjacent RGB variation is about .25/.18 versus 8.46/8.70 in the interior, so the border has been strongly smoothed. Exact edge equality is insufficient to certify visual continuity or natural feature repetition.

There is also a preview-path defect to investigate before regenerating the material. `SaveRepeatPreview` draws nine separately resized images with GDI HighQualityBicubic over a dark background. Saved-preview columns at a join average about 198–199 RGB, while a Chrome repeating-pattern render of the identical PNG at the same 384-pixel tile size averages about 209 at the corresponding join and has no comparable boundary dip. The latter experiment changed/saved no texture pixels. This establishes that the saved preview adds a visible boundary artifact relative to that wrapped render; the exact GDI interpolation contribution is an inference from code and the comparison.

Do not conclude that every observed game seam is a preview artifact. The browser experiment is Canvas2D, not the Maze Battle material/UV/mipmap pipeline. Check a real wrapped wall, corners and distance before deciding whether to repair pixels. The existing cracks/mottling may still repeat conspicuously. Retain raw/generated/repaired files and their report. See [measured inspection](wall-material-inspection.json).

First diagnostic sequence: inspect original at native scale → compare a repeat-aware preview against the saved preview → test real UV wrapping/filtering at intended texel scale → distinguish boundary dip, border smoothing, repeating motifs and mesh UV phase → choose a new immutable pixel repair only if needed. Making the feather wider by default is not a quality rule. New pixel editing or generation is a subsequent explicit material task; no source texture was edited here.

## TileLab first, existing capabilities retained

The inspected TileLab `main` is `200b22c` with active dirty material/import/planner work and untracked local governance files. Do not implement into that checkout or assume its HEAD contains its dirty source. Create an owned producer worktree and explicitly preserve the relevant active work before implementation. The separate `codex/additive-surface-trial` worktree is peer-owned and remains read-only.

TileLab already has:

- A sloping `beam` geometry operator with roll control, measured repeat UVs, grain direction and distinct endgrain.
- A flat two-tier timber-ceiling recipe using existing saved wood/masonry, source closure, reservation cuts, immutable output bundles and a local viewer.
- Named attachment anchors, convex clearance checks, recipe regeneration validation and a selected material-export workflow.

These should be extended. There is no pitched-roof recipe in the inspected workshop; the flat ceiling is not evidence of one. The construction dispatcher currently accepts box/atlas-box/arch/beam/reference operations. General prism geometry exists as a helper, but arbitrary roof/deck operations need a deliberate supported operator or an explicit assembly of supported sloping members. Do not silently assume a public prism opcode. Stay within current operation/triangle budgets for the first fixture; preserve old engine/profile/output pins when adding a new operation.

Prototype a wall/timber corner and complete small gable in TileLab, then fit the selected roof to the actual consumer building envelope. Producer `blocks` and game world units are distinct. Carry an explicit agreed conversion, axes, origin, wall-plate datum and placement matrix; no scale is inferred from matching a familiar ceiling height. Spatial proposal v0.2 remains proposed/unacknowledged, not a shared installed API.

Maze Battle already has the `surface-parts-v1` adapter for arbitrary mesh positions/normals/UVs/indices. Reuse that candidate/consumer seam instead of adding a second renderer. Current `ConstructionMember` AABBs and cardinal clipping are not a sufficient representation of sloped roofs; carry actual mesh/member geometry, transforms, bounds and support IDs. The producer supplies authoring competence; the game owns assembly placement, lawful observation and admission.

## Impact on the P6 host and neighbors

Keep existing flat/parapet `two-storey-building-v1` and `building-composition-v1` reproducible. Introduce a new roof-bearing host/profile for the pitched variant. Remove/replace the parapet deliberately; a pitched roof must not be laid over contradictory geometry. Recheck wall plates, upper ceiling/roof void, stair/attic clearance, window heads, roof/wood UV phase, actual member support and complete export bounds.

The current pair validator equates the maximum building Z bound with the street edge. That works for its flat body, but a real eave can extend above the street without moving the entrance floor. The new composition must distinguish the body envelope, roof/projection volumes, entrance-floor ports and protected street clearance. Never move a doorway or widen the street just to hide an AABB mismatch. World/realm identity remains required for every occupancy check.

Illustration only: the existing 1.6-unit alley with .5-unit opposing roof overhangs leaves .6 units between the eaves, while its ground width is still 1.6. Validate actual roof volumes and required overhead clearance; do not treat those example dimensions as an accepted permanent rule. Aggregate export/camera bounds include the true ridge, rake and eaves. Material-only changes must not modify walls, topology, floor spacing, stairs or saved placements.

## Checkpoints and acceptance

| Checkpoint | Deliverable | Required evidence |
| --- | --- | --- |
| Q0: this plan | Pinned sources, material diagnostics, bounded roof/wall brief | Local files only; source assets/checkouts unchanged |
| Q1: wall finish study | Existing candidate in a repeat-aware wall/corner, inside/outside roles and three tint swatches | Actual repeat/filtering views near/far; no border grid; neutral original retained; one instance's tint cannot affect another |
| Q2: TileLab gable/eaves | Complete roof, frame, underside, edge trim and explicit attachment/clearance metadata | Regeneration, winding/normals/UVs, support/joins, no holes/inverted underside, source closure, bounded cost; include one nondefault span/pitch |
| Q3: one finished host | Selected gable on a matching two-storey building with proper wall finishes and usable interior | Street/eye/overhead/section/under-eave/attic views; roof supports and space agree; neighboring roof/alley/street clearance; human visual review |
| Q4: portable consumer proof | Explicit selected immutable candidate through current model/material seams | Pinned scale and true bounds; texture/tint closure; standard loader and independent import; actual game rendering, then separate canonical admission if requested |
| Further stretch | Lean-to, then dormer/chimney/intersecting roofs and a small coherent block | Each adds its own fit/support/opening/UV/budget checks; preserve qualified earlier recipes |

Value is measured by a good complete building that can be regenerated and varied, not by how many unfinished buildings occupy the scene. Geometry and material qualification can proceed with saved assets; final material selection and human art acceptance remain real gates. An initial engineering allowance is roughly 8–16 focused hours for the first producer wall/gable quality candidate and another 4–8 for composed consumer/export qualification, subject to texture choice and visual revisions. This is a planning estimate, not completed work or an automatic paid-generation budget.

Current evidence: read-only source inspection PASS; numeric material/preview comparison PASS within the stated experiment; finished wall appearance, pitched roof, full building quality, portable roof proof and game admission **not yet qualified**. Relevant source hashes and dirty scopes are in [source inspection](source-inspection.json). Planning created no TileLab output, runtime code, provider call or asset admission.
