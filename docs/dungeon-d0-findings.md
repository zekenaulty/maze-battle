# D0 Findings: Dungeon Creation and Scaling

Date: 2026-10-11. Status: D0 review package; **D1 NOT STARTED**.
Related: [issue #3](https://github.com/zekenaulty/maze-battle/issues/3),
[proposed D1 repair](dungeon-d1-repair-plan.md),
[compatibility audit](reviews/d0-compatibility.md).

## Conclusion

The ordinary RPG's growth currently buys empty allocation and longer corridors,
not progressively more rooms. There is also a deterministic seven-room chain
failure, beyond the already reported eight-room ceiling. Removing the ceiling
alone would expose invalid room roles and would not fix topology or allocation.

The separate streamed topology already demonstrates bounded room-graph growth.
Reuse its keyed identity, spatial reservations and transactional expansion
concepts for a versioned shared module assembler. Do not adopt its separate
exploration save, chest counters or mandatory-passage arithmetic as RPG rules.

The D1 proposal is ready for owner review. No generator, gameplay, application
UI, save schema, live preview or Agentica service has been changed by D0.

## Measured Baseline

Runtime source is unchanged from `c62ed05`; exact diagnostic head, source file
hash, Node version, seed list and process metadata are in
[measurements.json](evidence/dungeon-d0/measurements.json).
The runner invokes the real generators; it is not a replacement generator.

- Six seeds: 0, 1, 7, 42, 55, 20261008.
- Sixteen levels: 1-10, 15, 20, 25, 30, 40, 60; 96 cases per generator.
- Ordinary: 84 measured; 12 deliberately skipped before allocation at levels
  40/60. Streamed: all 96 measured, including 126 rooms at level 60.
- Hard diagnostic bounds: ordinary 100,000 allocated cells; streamed 512 rooms;
  each cohort subprocess 180 seconds and 768 MiB JS heap. A bounded stop is not
  a passing generation result and does not prescribe a production-world limit.
- Same seed is restarted at each level to isolate scale effects. Equal early
  layouts in this cohort do not mean consecutive real-game floors reuse RNG state.
- Small-footprint probes and independent >8-room role probes supplement the
  progression sweep. Streamed level 300 stopped at its requested diagnostic prefix
  of 16 rooms, retaining unresolved sockets and reporting `limited`.

### Ordinary RPG: structured-v2

Means across six seeds, except room count and allocated cells (constant per row).
Walkable means actual linked cells plus the entry, not the whole allocated array.

| Floor | Allocated cells | Rooms | Walkable grid | Mean forks | Mean corridor steps | Mean entrance-to-exit steps |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1-4 | 117 | 6 | 67.81% | 1.33 | 2.92 | 20.00 |
| 10 | 437 | 6 | 39.74% | 1.33 | 7.73 | 41.00 |
| 15 | 1,517 | 7 | 13.89% | 0.00 | 15.00 | 114.00 |
| 20 | 5,180 | 8 | 8.21% | 1.50 | 34.38 | 151.00 |
| 25 | 18,765 | 8 | 3.74% | 1.50 | 71.32 | 290.33 |
| 30 | 68,640 | 8 | 1.80% | 1.50 | 142.13 | 558.67 |

**Reproduced defects:**

1. Room count caps at eight. Floor-30 room footprints occupy only **0.254%** of
   allocated area on average; walkable room-plus-corridor coverage is **1.797%**.
   Increasing world allocation is not equivalent to increasing usable dungeon.
2. The seven-room target prioritizes seven slots over six regardless of aspect
   quality. Seven factors only into 1x7/7x1, so every sampled floor-15 graph is a
   chain: zero forks, zero loops, six-hop diameter. `structuredRooms.ts`'s lattice
   scoring and `structuredGraph.ts`'s neighbor edges explain the result.
3. Chain-like output is not limited to seven rooms: seed 42 has zero forks and
   seven-hop diameter at floors 20/25/30. Other seeds branch; connectivity alone
   is therefore an insufficient quality gate.
4. A direct nine-footprint `nameRooms()` call emits one undefined role; twelve
   emits four; thirty-two emits twenty-four. These are latent cap-removal defects,
   not a claim that today's capped generator produces undefined roles normally.
5. The compounded progression would request a 964x968 grid at floor 40 and a
   13,286x13,290 grid at floor 60. Those arrays were NOT allocated. This is a
   concrete eager-allocation hazard, not a measured crash or OOM claim.

Across the 84 completed cases, measured room overlaps, invalid corridor steps,
corridor intrusions into non-endpoint rooms and invalid roles were zero; all
walkable cells were reachable. The failure is structural quality/scaling rather
than a disconnected-floor defect in this cohort. Existing tests require <=8
rooms and reserved-gap corridors, so their green result preserves legacy behavior.

### Streamed topology: spaces-v2

Passage nodes are contracted for room-graph metrics, but retained for physical
traversal. Room-envelope coverage measures footprint area divided by its bounding
rectangle, not ordinary-grid walkable coverage; the percentages are not synonyms.

| Level | Requested / actual rooms | Mean forks | Mean graph diameter | Loops | Mean room-envelope coverage |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 8 / 8 | 2.00 | 3.00 | 0 | 36.86% |
| 10 | 26 / 26 | 8.50 | 6.00 | 0 | 31.89% |
| 20 | 46 / 46 | 15.83 | 7.00 | 0 | 30.99% |
| 30 | 66 / 66 | 22.67 | 8.00 | 0 | 30.70% |
| 60 | 126 / 126 | 43.00 | 10.33 | 0 | 29.50% |

All cases sealed at the requested room budget, with connected room graphs,
nonoverlapping spaces, valid reciprocal connectors and fully reachable
materialized schematic cells. All joins used passage modules: **no direct room
joins**, and all graphs are trees. Loops are optional design work, not an automatic
failure. Room sides span 5-15 cells across the cohort. Minimum-size 5x5 fallback
rooms account for 0% of non-entry rooms at level 1, 42.22% at level 20 and 52.67%
at level 60 (six-seed means). Growth is real, but crowding increasingly forces
the smallest reserved footprint. D1 should review size variety alongside counts,
not call this final-quality module assembly merely because it reaches budget.

At level 60, mean canonical placement candidates were 625.5 for 125 attachments;
maximum total indexed occupancy entry checks were 9,222 across the six seeds,
including commit revalidation/insertion. Counters distinguish canonical proposal
from duplicate validation work. Local reservation-array comparisons are not
instrumented and are explicitly `null`, not zero. These finite samples do not
prove arbitrary-depth growth or production storage performance.

## Compatibility Findings That Change the Repair

- Ordinary RPG owns real party, loot, quests, portals and floor archives. The
  streamed chest action increments exploration counters, not RPG inventory.
- Old stream readers encode `2 * rooms - 1` spaces, a passage per attachment and
  one chest per non-entry room. Adding direct joins requires new semantics, not
  weakening old validators or relabeling old saves.
- New ordinary layouts need version-aware normalization and rendering: current
  void rendering recognizes the exact `structured-v2` tag. New metadata would
  otherwise be dropped or void rendered as floor.
- Role changes affect quest generation and chest placement. Preserve existing
  content caps and effects initially; do not accidentally multiply loot/quests
  merely because the world has more rooms.
- Whole-floor RPG routing is not actor-scoped navigation. D1 proves geometry;
  A0-A3 still own the knowledge-safe shared-controller integration.

See the [source-referenced audit](reviews/d0-compatibility.md) for consumers,
reader invariants, save identity and the exact preservation checks.

## Evidence and Limits

- Diagnostic assertions and focused legacy regression results are recorded in
  the [verification note](evidence/dungeon-d0/verification.md). Tests capture current defects as findings;
  they do not claim those defects were repaired.
- [Ordinary footprint diagrams](evidence/dungeon-d0/ordinary-maps.png) and
  [streamed footprint diagrams](evidence/dungeon-d0/streamed-maps.png) were rendered
  in headless Chromium and visually inspected. They show real measured geometry,
  independently fitted scales and omitted internal obstacles, not player fog or
  screenshots of new gameplay. [Interactive-size HTML](evidence/dungeon-d0/maps.html).
- Elapsed audit time includes both generation and measurement. Process heap
  samples include the loader, audit and GC timing; they are not peak allocation,
  retained world size, a mobile benchmark or isolated generator latency.
- No combat simulation, providers, live runtime adoption, save migration or D1
  candidate generation was exercised. Existing native storage/play tests are
  future D1 compatibility gates, not implied by in-memory diagnostic success.

Reproduce from the repository root:

```powershell
node scripts/dungeon-diagnostics.mjs --out test-results/dungeon-d0
node node_modules/vitest/vitest.mjs run scripts/dungeon-diagnostics --maxWorkers=1
```

**Owner gate:** review this report and the D1 plan before authorizing implementation.
