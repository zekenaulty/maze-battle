# P3: dedicated stairwells and smaller chambers

27 October 2026. Owned branch `codex/purposeful-generation`, following `da67686`.
This is a checkpoint within the active P3–P6 goal; work continues into construction planning.

## Implemented behavior

Fresh games select `dedicated-stairs-v1`. Existing recipe discriminators retain their geometry and seeded ordering. The new family reserves an entry and final descent envelope before placement, tagged `purpose: stairwell-v1`. Each well is 9 rows by 3 columns; ordinary chambers are independently 3 or 5 cells per side. Circulation retains real runs and junctions from P2. Depth increases node count rather than ordinary-room size.

At the current 3.2-world-unit cell pitch, wells occupy 28.8 by 9.6 world units and ordinary rooms range from 9.6 to 16 world units per side. These are provisional game-scale choices, not a historical/structural standard. No global avatar, cell, wall, aperture, floor-rise or stair dimensions changed.

The existing straight flight keeps width 1.8, rise 4.68, 18 treads, 0.42 tread depth, 1.8 landings and the same floor alignment. The well purpose permits its narrower explicit envelope; older untagged stair rooms still require at least 9 cells in both dimensions. The same shaft removal and side bypass algorithm operates inside it. Upper and lower ends retain three reserved cells and two side lanes; all advertised ports remain walkable.

The final node is now the predetermined descent well for this profile, instead of converting an arbitrary farthest chamber after generation. Role preparation counts entry/exit as route anchors, while only ordinary chambers can be hub/specialty candidates. Wells have empty content witnesses, no reward/quest assignment and no random movement encounter. Purpose and recipe details are not disclosed in observations. This changes the new profile only.

## Qualification

- Domain sampling: **384/384 layouts** qualify, covering seeds 1–128 at depths 1, 10 and 30. Every sampled layout has a branching junction. [Compact measurements](p3-seed-measurements.json); regenerate with `node scripts/purposeful-generation/measure-circulation.cjs dedicated-stairs-v1`.
- Dedicated domain tests cover exact envelopes, original size guards, deterministic replay, advertised boundary cells at both stair ends, prime budgets 5/7/11 and capacity edges 127/256.
- Canonical writer tests cover three seeds through two floors, a dense 66-node floor, bounded visibility, private purpose, chamber-only specialties, empty well content, reciprocal down/up travel and all allocation phases.
- Actual initializer/public-birth tests carry the selected architecture into their public bounds. Their public roster/settings golden is unchanged. The focused initializer plus new geometry/canonical cohort passes **44 tests** before the added capacity-edge case.
- Native Chrome purposeful-generation cohort: **8/8** pass, including fresh-game default, manual passage movement and 2D/3D/reload continuity in P2/P3, all three profiles' down/up stairs, and real App Auto traversal/stop for P2/P3.
- Production build and fixture TypeScript project pass. Broad domain/canonical/game/knowledge/content/combat/service/3D regression: **1,891 tests / 106 files pass** with four workers. No gates or timing limits were weakened.

The area comparison counts planned floor cells, not bounding-box voids. Across 128 seeds per depth, circulation is 26.23%, 47.27% and 53.35% of total floor area at depths 1/10/30, compared with P2's 5.52%, 10.65% and 12.12%. Two dedicated well envelopes account for 54 cells per floor. Actual room appearance still needs human playtest feedback.

## Remaining work and scope

P4 will introduce reusable, complete authoring plans with stable members, supports and purpose anchors. P5 will bake a bounded assembly and a preserved shelf/cabinet into a portable static model, then reimport them. P6 will compose a bounded building and adjacent pair. A full authoring plan/export does not reveal unobserved game cells or admit a town runtime. Existing procedural shelves, supports, trim, stair finishes, materials and source recipes are retained.

The source worktree's owner has now committed the preserved construction work as `475bbc7`, with evidence/boundaries at `6c24cc4`. Its final support cleanup derives unchanged corner/brace offsets from existing constants. That cleanup and the owner's three documentation updates were preserved locally with hashes in `p3-source-reconciliation.json`. This records lineage; it does not imply a peer acknowledgement or change source-worktree state.
