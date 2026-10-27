# Cabinet fit, timber joints and optional stair/support comparisons

Consumer work: `codex/canonical-3d-exploration`, isolated owned worktree, based on
`4640157e1136effed3aeefef05cf7a4c7e62b9af`. This follows the owner's visual QC
of the selected shelving and timber integrations. The original consumer reports
remain historical evidence; this report supersedes their static-cabinet boundary.

## Cabinet repair and interaction

The selected `shelving-v3` source remains TileLab commit
`ed88b0674d01f8b6015560a9da173ff03ed8c4e1`; its hashes remain pinned in
`scripts/asset-selections/shelving-v3.json`. `fitCabinetDoors` applies the narrow
consumer recipe `cabinet-overlay-fit-v1`: move both hinge bind translations back
by **0.0432 world units**. The door rear now meets the carcass front at Z=0.192.
Meshes, UVs, hinge angles, avatar scale and producer files are preserved. Source
manifests/placement bytes remain in evidence; derived joint pivots/sweeps and the
recipe are recorded separately. The aggregate operating envelope stays conservative.
The corrected merged pack revision is
`eb11b1b5e698a74b830b96dd6517b5d72ed5741adfc4e3171f689e091eb8f1ef`.

E and **Use nearby control** open/close nearby cabinets. Aim takes priority,
otherwise the nearer cabinet or existing door control wins. Interaction requires
the same floor, a visible front and enough clearance for the leaf sweeps, player
and neighboring geometry. Open/closed geometry is cached and shares material
batches. State follows a stable furnishing ID within the renderer's lifetime;
it resets on leaving/recreating that renderer. It is visual state, without a
canonical command, inventory authority or save schema change. The cabinet body
retains its conservative collider; opened leaves are not separate walk colliders.
Poses switch immediately; animated hinge motion is a future refinement.

## Timber joins and optional supports

Perimeter trim now extends by its section width around convex masonry corners.
X runs own the corner and cap Z runs; collinear runs merge. This fills the missing
corner volume without overlapping two coplanar faces. End grain remains visible
at intentional exposed ends and differing timber sections; this is a butt-joint
construction, without invented ornamental joinery or image editing.

**Architecture options** exposes independent booleans, all off by default:

| Strategy | Placement policy |
| --- | --- |
| Corner posts | Disclosed rooms of at least six cells; two blocked wall edges, inside-face contact derived from cell/wall/post dimensions; full floor bearing required |
| Wall braces | Larger rooms of at least nine cells, long joists, alternating floor-anchored rows, actual masonry bearing, at most eight per room |
| Stair entry frame | Two posts outside the existing 1.8-wide flight and a header; admit the complete frame only when both feet bear on the upper landing |

All strategies reject intersecting props/supports, protect the stair run and
exclude the player's actual 0.38-radius disk before adding solid posts. Room
posts and entry posts supply local colliders; elevated braces/header are overhead.
They use the existing three timber batches and renderer. Missing timber packs
create neither posts nor invisible support colliders. Total support parts are
capped at 96. The fixture has eight corner posts, sixteen braces and one
three-piece entry frame when each strategy is tested independently. These are
optional construction prototypes, not a structural engineering solver or a
persisted room-style language. Revealed geometry can add/remove eligible pieces.

## Selected stair faces

`scripts/asset-selections/stair-detail-textures.json` pins exactly two full raw
images and their generation reports from the owner's working run
`run-20261023-132932-8b1964e4`. `import-stage-details.ts` verifies those bytes,
retains the source PNGs/receipts and writes the optional local material pack.
Its revision is
`6cd0d5c0446d5638e9ae4e7e45a3a692da594240888c18e9df59e7c6380048d7`.

| Optional face | Source and selected top-left-origin pixel rectangle (1024 square) |
| --- | --- |
| Dressed stone risers | `cobblestone_alt/materials/cobblestone_alt/raw_edit.png`, (64,608)–(960,704) |
| Iron stair edging | `iron_block/materials/iron_block/raw_edit.png`, (128,8)–(896,40), upper 0.075 units of the riser |

These bounded UV rectangles refer to the full retained images; the PNGs are not
cropped, rescaled or generated. V is converted once for Three.js. The riser is
partitioned into non-overlapping material regions within the existing exposed
masonry union. No overlay polygons, extra walk geometry or rail are added.
Cobblestone treads and the flight dimensions/traversal are unchanged. The iron
looks warm/rusty under the current warm lighting; both treatments remain optional
comparisons pending human art review. Missing detail packs retain the original
faces. No texture is fetched until its treatment is used.

Reproduce local generated packs from this repository root:

```powershell
node --experimental-strip-types scripts/import-shelving.ts --source D:/maze-quest/MazeQuestTileLab/exports/shelving-v3 --selection scripts/asset-selections/shelving-v3.json --write
node --experimental-strip-types scripts/import-stage-details.ts --source D:/maze-quest/MazeQuestTileLab/output/run-20261023-132932-8b1964e4 --selection scripts/asset-selections/stair-detail-textures.json --write
```

## Qualification and limits

- **128 focused unit tests / 14 files PASS**: import fidelity/rejection, cabinet
  correction/idempotence, sweep/visibility, convex joins, face-area/UV invariants,
  player-safe supports and existing movement/input/lifetime coverage.
- **26 native browser cases PASS**: seven shelving/QC, eight stairs/controls,
  eleven existing 2D/3D. Real E/button cabinet operation leaves the canonical
  revision unchanged. Actual door-to-frame gap measures zero. All support
  strategies together permit descent and return; optional face treatments are
  captured from below. Missing packs, all five shelving models, cardinal mesh
  envelopes, view round trips, resource identity/disposal and control recovery pass.
- Production TypeScript/build and shelving fixture types PASS. Existing large
  bundle warning remains. The unchanged 20-cell manual motion probe records
  993 frames, 17 ms RAF p95 and zero pending stopped frames/duration, locally.
- Independent boundary review found a support/player-radius mismatch; corrected
  to the movement radius and covered by a rounded-corner collision regression.
  An initial unit run exposed an outdated renderer test double; adding the new
  settings method restored all input/lifetime tests. No movement gates were relaxed.

Screenshots, reports, the earlier captures and final native evidence are retained
in the task visualization directory under `quality-polish-20261026`. Inspected
captures include the cabinet closed/open, actual trim corner, entry frame and
stairs viewed upward with original and optional faces. The early top-down stair
capture could not show risers; it is retained as incomplete visual evidence.

Consumer decision: enable the cabinet fit/interaction and closed corner joins;
expose supports and stair finishes for optional review. Human visual approval
remains separate. Full-suite/long Auto endurance and all possible room layouts
were not requalified. No paid calls, broad intake, peer checkout mutation,
owner-save reset, shared spatial-contract agreement or merge into main occurs.
Next slice: owner selection of the support/finish mix, then a versioned room-style
profile; inventory-backed cabinets require a separate game-owned contract.
