# Maze Battle to MazeTileLab: initial geometry handshake

- Packet ID: `mb-geometry-20261026-01`
- Kind: proposal + measured negative fixture
- Contract: `spatial-contract-v0.1`, proposed; see sibling contract in this commit.
- Delivery: prepared locally; no peer message or shared-document write performed.

This initial observation packet predates discovery of the peer's local guidance.
The later `2026-10-26-maze-battle-response.json` supersedes its peer-guidance UNKNOWN
and aligns the exchange to the exact TileLab proposal digest. Numeric and installed
fit decisions remain open.

## Baselines and custody

| Surface | Inspected state | Treatment |
| --- | --- | --- |
| Primary Maze Battle checkout | `codex/streaming-exploration`, `cdcc4d8`; clean at initial inspection | Preserved; not the complete current 3D implementation |
| Consumer 3D checkout | `codex/canonical-3d-exploration`, `e9b658218c160de2300fe7cc2a6a109b9a8d5632`, dirty | Read-only inspection of active repair; no fixes copied or overwritten |
| Earlier asset integration worktree | `feature/maze-3d-projection-asset-lab`, `69a63b4`, clean, ahead of its remote | Separate lineage; not silently merged |
| Producer checkout | Remote `zekenaulty/MazeTileLab`; local legacy directory `D:\maze-quest\MazeQuestTileLab`; HEAD `d1e6662e93945b5aebf89a189dc755e45ebfdf0a`, dirty | Read-only; directory name does not change repository identity |
| This guidance work | `codex/maze-agent-guidance`, isolated managed worktree, based on consumer `e9b6582` | Owns only guidance, proposal, diagnostic and selected regression fixture |

The active consumer repair included changes to `constants.ts`, `scene.ts`,
`masonry.ts`, `boxUVs.ts`, `surfaces.ts`, `StairTraversal.ts`,
`AutoWalkPresentation.ts`, their tests, a new `construction.ts`/test, and the stairs
browser test. The observed construction helper maps stored floor frames into a
separate presentation rise/separation and defines shared-origin masonry UVs. The
observed wall height is 4.8 rather than committed 4.5. These are provisional source
observations, not verified root causes, settled design choices or passing evidence.
Obtain the repair's final commit, reproduction and measurements before binding a
producer candidate to those dimensions. No competing spatial refactor is included.

The producer's README, targets and workshop implementation/tests were also dirty,
including timber work. Current source HEAD alone does not identify how an older
immutable artifact was generated; preserve the actual artifact pins below.

## Proposed consumer seam and concrete failure

Use the existing explicit selection → `importWorkshopPreview` → validated
`ModelPack` → `VisualInstance` preview seam. The lighting workshop currently scales
the independent arch by 1.5. The actual iron door instead goes through
`StageInteractables.sync`, with 1.8 × 3.3 aperture dimensions and separate model
normalization. There is no installed surround binding between those two paths.

The exact original authored geometry from
`workshop-authoring-20261025-v1/doorway-export/geometry.json` is retained as a
geometry-only negative fixture; it is not imported into a runtime pack:

- Geometry SHA-256: `c54bb6cceda85653ce5a83223d8e779027e4be5034255f5c51cc84294ac4b8a1`.
- Selected workshop descriptor SHA-256:
  `e6a3711d391526695f06c9c44f42c763b181147890c8dc8b2cb9879c5d7ccc0c`.
- Local bounds: X ±1.36, Y 0–3.1669714456075937, Z ±0.28 authoring units.
- At scale 1: local geometry validation passes, but solids intersect the current
  game's 1.8 × 3.3 door-aperture volume. Thus local validity does not imply fit.
- At scale 1.5: the aperture is unobstructed in this limited test; world width is
  4.08, height is 4.7504571684113905, depth is 0.84. That exceeds committed wall
  height by 0.25045716841139054 and the single-cell lateral envelope by 0.44 per side.
  The observed uncommitted 4.8 wall change would remove the height exceedance;
  it does not prove the whole installation fits or resolve the width policy.
- Tested transform: common floor center, aligned axes, uniform positive scale;
  position tolerance 1e-6 world units, existing convex contact tolerance 1e-7 local
  authoring units. No rotation, mirroring or source-to-world default is inferred.

This is numeric context checking against the actual game aperture constants,
**not** an actual iron-door mesh/sweep, installed joint or visual acceptance test.
The retained provenance file states the package-closure evidence limit.

## Requests for the producer owner

1. Respond to the same contract version/content with your pinned baseline and local
   guidance/skill paths. Keep the producer skill in its own repo; no global install.
2. Confirm source/authoring axes, pivot and unit provenance. Propose an explicit
   adapter factor for this installation; do not treat 1.5 preview scale as agreement.
3. Inspect the real selected `iron-door-source` model and consumer normalization
   before constructing the next surround. Supply measured closed/open geometry,
   required hinge/sweep and floor/wall anchors; flag any unavailable source payloads.
4. Propose the smallest compatible candidate/placement evidence sidecar, preserving
   existing material-export and construction revision semantics. Confirm joint,
   opening, void and material projection/phase meanings.
5. Export one fit-aware immutable surround and local evidence. Retain the old arch
   as an independent demo. Await consumer composition/browser checks before claiming
   admission; neither repository's local validation accepts the other's changes.

Maze Battle follow-up: reconcile the active repair's final revision, freeze a
tested target opening/room fixture, then compose the actual door and selected new
surround at that revision. World pitch, exact lattice representation, final floor
mapping, boundary/anchor names and UV datum remain open joint decisions.

## Evidence and outstanding gates

The diagnostic regression command is:

```powershell
node --experimental-strip-types --test scripts/architecture-fit/verify.mjs
```

Seven checks PASS, including the original-arch failures, immutable input, explicit
units/pivot, pinned CLI input and no-admission behavior on a numeric PASS. The
standalone scale-1.5 CLI intentionally exits 1 for the measured dimensional failures.
No paid generation, peer checkout mutation, source repair, asset installation,
shared-document update, push or merge was performed for this setup.

UNKNOWN/pending: peer acceptance and producer-local guidance; full candidate
closure in this geometry-only fixture; real door mesh/open-sweep fixture; composed
room/floor/UV and distant/rotated fixtures; fresh-agent governance replay; intended-
scale browser acceptance; save/reload and canonical travel integration. The initial
guidance and negative fixture are ready for review; end-to-end admission is pending.
