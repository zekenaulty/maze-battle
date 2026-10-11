# D1.4 Bounded RPG Measurements

2026-10-11. **Initial lane: PARTIAL; integrated follow-up: PASS below.** Product
revision `5c12b496c7cc3761ca66deccc2c80ee2024f7d3d`, isolated branch
`codex/d1-measurements`. No product files, existing documents, providers, player
saves or user IndexedDB were changed. No push. Parent owns native persistence,
resize, capacity UI and integrated acceptance.

## Integrated Follow-up

The tables and initial failures below remain the original `5c12b49` evidence.
They now refer to [the preserved pre-optimization record](../evidence/d1/measurements-before-local-lookups.json),
not the current [integrated record](../evidence/d1/measurements.json).
The latter was generated against `b237160d8810374c781c40bbc61d8d1f61ca12e1`,
source SHA-256 `2cd8dd51857459fbe00f3d5eafa4ef7f1f270396690e7aea112dde1dd6272971`.

The parent fixed repeated dense-cell lookup and already-accepted contract path
searches, retaining sparse/legacy lookup behavior and observation semantics.
Issue #5's renderer fix was also integrated. The same unextended 10s/1024-step
tour limits now complete **16/16**, including both 256-room fixtures:

| Seed | Moves / targets reached | Tour ms | Move p50 / p95 ms |
| --- | --- | ---: | --- |
| 2 | 1004 / 6 of 6 | 1018.0 | .786 / 1.432 |
| 42 | 898 / 6 of 6 | 877.5 | .759 / 1.515 |

All 26 domain and eight render records completed without errors; cohort times
were 15.13s and 10.55s. Geometry hashes match the initial run. Verifier PASS:
16 projection/reload fixtures, 10 archive fixtures and 32 render modes.
The 256-room seed-42 fog camera/overview median synchronous draw is 9.1/21.1ms;
draw plus readback is 21.5/28.9ms. These remain single-machine submission/readback
measurements, not FPS promises or coupled end-to-end gameplay measurements.

Native real-GameSession measurements and the remaining expensive whole-save
archive writes are recorded separately in [integrated D1 qualification](d1-qualification.md).
No claim of arbitrary-size or constant-cost persistence follows from this repair.

## Original Results and Limits

- **PASS, offline domain:** 16 actual `generateModuleMaze` projections, full
  `createNewGameState` construction and JSON/`normalizeGameState` round trips;
  10 independently generated archive fixtures. All room centers and linked cells
  are reachable; every projected link is reciprocal and in bounds. All floor
  mazes survive reload unchanged. Geometry hashes agree across both runs.
- **PARTIAL, actual movement:** final run completed 13/16 target tours. The
  128-room seed-42 and both 256-room tours hit the fixed 10-second traversal
  budget. No blocked move, wrong destination, stair transition, combat or
  geometry mutation occurred in executed steps. Static reachability is not a
  replacement for the unexecuted movement steps.
- **PASS, isolated render measurements:** actual `drawMaze`, eight budgets,
  seed 42, camera/overview, fog on/off: 32 combinations. Pixel checks found
  nonblank geometry/markers; no page errors, external requests or reported asset
  failures. This is neither visual correctness sign-off nor an FPS benchmark.
- Domain cohort: **68.05s**; render cohort: **14.36s**. Each has a 180s hard
  process-tree timeout, 155s cooperative stop and 768 MiB V8 old-space limit.
  The latter is not a total RSS cap. Largest after-fixture snapshots were
  **379.3 MiB heap / 662.4 MiB RSS**, not peaks or retained-size measurements.

Machine: Windows 10.0.26200 x64, AMD Ryzen 9 PRO 6950H, 16 logical CPUs,
29,832,904,704 bytes physical RAM; Node 22.13.0, Vite 8.0.16,
Chrome 155.0.8059.39 headless. These are noisy single-machine observations,
not benchmark guarantees or portable gameplay-latency promises.

## Fixture and Timing Definitions

Fixed seeds **2, 42**, budgets **7, 11, 13, 16, 32, 64, 128, 256**. Recipes use
the default module policy, world `d1-measurements`, level 1, with `roomBudget`
explicitly overridden independently of level. Archive fixtures use levels 1-16,
seeds 42-57, with constant budget 32 or 128. This is not a progression/deep-level
capacity UI test.

Generation timing wraps the real projector, including its assembler, quality
check, dense cells, path search and initial visibility. Full game construction
is separately recorded. Structural audit and a second independent assembler
pass for work counters are outside generation timing. Each JSON stringify,
parse and normalization is measured three times; table reload values are the
median of parse plus normalization. This is in-memory reload, not disk/IDB I/O.

Tours start at the real generated entry and sequentially visit exit, all three
chests, the farthest room center, then return to start, deduplicating coordinates.
Routes use the actual solver. Each direction executes
`moveActive(game, direction, { triggerStairs: false })`, with an assertion on
position, unchanged level and absent battle. Caps are 1,024 steps or 10s per
fixture, checked between moves, including route-search time. Move timers exclude
route planning and assertions; separate route and whole-tour times are retained.
No teleport, rewritten movement, quest-solving loop, chest opening or combat
runner is used. Real movement's automatic guild synchronization and incidental
quest completion remain included; `randomBattles` is false.

## Projection, Save and Movement Cost

Paired values below are **seed 2 / seed 42**, not confidence intervals. MiB is
1,048,576 bytes. Step p50 is the upper empirical median; p95 is nearest rank.

| Rooms | Dense cells | Walkable % | Room footprint % | Full GameState MiB | Generate ms | Reload ms | Step p50 ms | Step p95 ms |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | 1,316 / 1,680 | 40.9 / 41.0 | 42.6 / 48.0 | .125 / .152 | 10.3 / 4.4 | 5.6 / 4.9 | .7 / .8 | 2.4 / 1.8 |
| 11 | 2,346 / 2,736 | 35.5 / 38.4 | 37.1 / 43.8 | .208 / .240 | 4.7 / 6.3 | 7.1 / 7.7 | 1.0 / 1.1 | 1.9 / 2.0 |
| 13 | 3,360 / 3,363 | 30.7 / 35.1 | 32.6 / 39.6 | .283 / .287 | 6.0 / 6.9 | 8.2 / 7.5 | 1.1 / 1.3 | 1.8 / 2.1 |
| 16 | 3,864 / 4,189 | 33.6 / 34.6 | 36.5 / 38.7 | .330 / .356 | 7.5 / 11.9 | 8.8 / 10.6 | 1.4 / 1.7 | 2.6 / 3.3 |
| 32 | 9,047 / 7,047 | 28.4 / 38.7 | 30.5 / 42.3 | .736 / .611 | 17.8 / 18.9 | 24.1 / 16.6 | 4.1 / 2.8 | 6.4 / 4.7 |
| 64 | 15,458 / 13,328 | 29.6 / 37.0 | 31.5 / 39.6 | 1.275 / 1.149 | 30.1 / 23.9 | 42.0 / 35.4 | 5.5 / 4.9 | 9.5 / 7.7 |
| 128 | 30,276 / 25,688 | 29.9 / 35.3 | 31.9 / 37.6 | 2.522 / 2.215 | 62.7 / 58.3 | 100.9 / 121.1 | 16.9 / 13.6 | 25.8 / 22.7 |
| 256 | 49,283 / 45,200 | 36.6 / 38.8 | 39.2 / 41.5 | 4.310 / 4.008 | 136.0 / 110.4 | 208.1 / 149.0 | 35.8 / 21.2 | 57.7 / 35.1 |

Serialized bytes include **both** top-level `game.maze` and the active
`game.floors[].maze`, all actors, inventory/stash, chests, quests, visibility and
other serialized game fields. No active-floor deduplication is performed. The
evidence records individual maze/floor sizes and a separately labelled hypothetical
size without the active floor entry. Initial 256-room states are **4,519,862 /
4,203,090 bytes**; partial tours grow them to **4,581,925 / 4,301,077 bytes**.

Final bounded tours: 128/42 executed 680 moves, reached 5/6 targets; 256/2 executed
268, reached 1/6; 256/42 executed 435, reached 3/6. All were time-limited, not
step-limited. The first run completed 14/16 tours and reached 2/6 on both 256-room
fixtures: repeat variation is retained, not hidden by selecting the faster run.

## Topology Shape

Footprint coverage includes the rectangular room footprints; walkable coverage
counts cells with nonempty links divided by the dense envelope. They are not
interchangeable. All samples stay below 65,536 cells; no default-policy capacity
failure was observed. This lane did not retest the explicit over-capacity fixture.

| Rooms | Forks | Leaves | Max unbranched run | Entry depth | Diameter | Max side depth |
| ---: | --- | --- | --- | --- | --- | --- |
| 7 | 2 / 2 | 5 / 5 | 1 / 1 | 2 / 2 | 3 / 3 | 1 / 1 |
| 11 | 3 / 3 | 7 / 7 | 2 / 2 | 2 / 2 | 4 / 4 | 2 / 2 |
| 13 | 4 / 4 | 8 / 8 | 2 / 2 | 2 / 2 | 4 / 4 | 2 / 2 |
| 16 | 5 / 5 | 10 / 9 | 2 / 2 | 3 / 3 | 5 / 5 | 2 / 2 |
| 32 | 11 / 12 | 18 / 16 | 3 / 3 | 4 / 4 | 7 / 7 | 3 / 3 |
| 64 | 21 / 23 | 29 / 27 | 4 / 3 | 5 / 5 | 9 / 10 | 4 / 5 |
| 128 | 39 / 47 | 53 / 54 | 4 / 4 | 7 / 7 | 13 / 13 | 6 / 6 |
| 256 | 77 / 82 | 96 / 94 | 6 / 6 | 9 / 10 | 18 / 19 | 9 / 9 |

Distances here are room-graph edges, not cell moves. Side depth is the shortest
leaf distance to a deterministic entry-to-deepest-room spine. Evidence retains
degree histograms, every leaf depth, side depth and passage length. Independent
all-roots graph search agrees with reported diameter. Median footprint coverage
is 36.4% at 32 rooms and 34.8% at 128; sampled fork fractions remain above 15%.
The 256-room examples contain 171/195 direct joins and 84/60 passages; 5x5
non-entry footprints are 11.0%/12.2%. Small prime floors remain shallow. Two
seeds do not supersede the broader assembly audit or establish layout variety.

## Work Counters

These are from a separate same-recipe eager assembler, not instrumentation of
the projector's internal instance. For seed 42:

| Rooms | Committed candidates | Committed occupancy queries | Committed local checks | Physical index queries | Physical bucket reads | Physical entry checks |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 7 | 9 | 6 | 19 | 20 | 38 | 21 |
| 11 | 47 | 44 | 76 | 106 | 160 | 177 |
| 13 | 81 | 78 | 144 | 178 | 250 | 366 |
| 16 | 105 | 102 | 225 | 232 | 380 | 460 |
| 32 | 329 | 313 | 634 | 691 | 1,024 | 1,580 |
| 64 | 1,073 | 1,010 | 1,961 | 2,160 | 2,852 | 4,897 |
| 128 | 2,395 | 2,260 | 4,295 | 4,805 | 6,169 | 12,844 |
| 256 | 6,340 | 6,055 | 10,320 | 12,673 | 15,319 | 35,557 |

The first three counters include initialization and accepted proposals only.
Commit re-proposes/revalidates; physical index reads also include that work and
`OccupancyIndex.add()` overlap checks. Do not add these mixed counters together or
call committed candidates all physical attempts. No extra retries are injected.
Default search allows 16 candidates per direction, at most four directions at
entry and three at each later room per proposal pass. `added.some` checks are
represented only in committed local counters; array copies, reservation removal,
receipt JSON, cloning and commit revalidation's local checks remain separately
uninstrumented. Timings include them; operation totals do not.

## Archive Growth

Each sample builds distinct real floors, then assembles them through the real
normalizer. There is one active floor plus the indicated archived floors, with
the active maze still duplicated at top level. These are initially explored,
unlooted floors, not a worst-case explored/loot-rich campaign or stairs proof.

| Total / archived floors | 32-room full bytes | 32-room reload ms | 128-room full bytes | 128-room reload ms |
| --- | ---: | ---: | ---: | ---: |
| 1 / 0 | 640,438 | 15.0 | 2,322,732 | 68.6 |
| 2 / 1 | 967,941 | 18.6 | 3,387,100 | 96.4 |
| 4 / 3 | 1,587,556 | 28.4 | 5,959,500 | 151.5 |
| 8 / 7 | 2,871,468 | 45.0 | 10,385,402 | 246.8 |
| 16 / 15 | 5,351,533 | 82.3 | 19,542,933 | 466.8 |

## Actual Browser Draw Cost

Fresh nonpersistent browser context; only localhost:5200 requests allowed.
The measurement HTML does not load the game application or persistence layer.
Canvas is 1100x900, DPR 1, initial entry visibility, two warm-up draws and seven
samples per combination after a 400ms sprite settling interval. All values below
are medians. Synchronous draw is CPU/API submission cost, **not presentation or
GPU completion**. Full-canvas readback adds raster synchronization and copies,
changes canvas behavior, and is not a normal frame. Visibility snapshots are
timed separately; draw columns reuse a prepared snapshot. No screenshot is
rewritten and no additional map image is used as correctness proof.

| Rooms | Fog camera draw ms | Fog camera draw + readback ms | Fog overview draw ms | Fog overview draw + readback ms | Revealed overview draw ms |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 7 | 3.8 | 20.5 | 1.4 | 10.0 | .8 |
| 11 | 4.5 | 27.3 | 2.0 | 15.3 | 1.6 |
| 13 | 4.9 | 27.0 | 2.1 | 12.7 | 1.6 |
| 16 | 4.9 | 28.0 | 2.8 | 17.0 | 1.9 |
| 32 | 5.1 | 26.6 | 4.3 | 24.4 | 3.1 |
| 64 | 5.3 | 23.9 | 9.0 | 32.0 | 6.2 |
| 128 | 7.0 | 26.3 | 52.8 | 56.7 | 12.7 |
| 256 | 12.8 | 35.4 | 118.2 | 120.2 | 25.0 |

## Expensive Paths for Parent Triage

1. **Dense-cell work on every move.** Repro: `floor-256-2` in the command below;
   49,283 cells, p50 35.8ms/p95 57.7ms, maximum 72.1ms per move in the final run.
   `src/domain/gameFactory.ts:229` scans for active/destination cells and calls
   visibility plus guild synchronization. `src/domain/maze/movement.ts:22`
   rebuilds a full cell map; `visibility.ts:44` calls it, including through
   `guild/contracts.ts:92` and pending locate-quest checks. These are observed
   costs plus source-based attribution, not isolated profiler percentages.
2. **Overview cost scales with the full dense envelope.** Repro:
   `render-256-42`, overview, fog true. `drawMaze.ts:155` builds the full overview,
   `:287` scans dense cells for clipping, and `:776` iterates fog bounds. The
   118.2ms result makes a cheap per-frame overview assumption unsafe. Camera mode
   still rebuilds the full map in `:506`, despite viewport-limited drawing.
3. **Eager archive serialization/normalization is not bounded by active rooms.**
   Repro: `archive-128-16`, 19,542,933 bytes, 466.8ms median parse+normalize.
   `gameFactory.ts:169`, `:576`, `:590` normalize/copy stored floors; active state
   is represented twice and normalized through multiple calls. This is an
   existing representation cost exposed at the new scale, not evidence of a
   save-corruption bug. No optimization or product fix is included here.

No new correctness defect was observed in completed samples. Full large-floor
tours remain **UNKNOWN beyond their recorded prefix**. Parent should resolve
acceptable runtime/storage costs explicitly; a feasible 256-module projection
alone does not establish a responsive full RPG session.

## Reproduction and Evidence

Run from the isolated worktree with dependencies installed or the authorized
`node_modules` junction. Only the render cohort opens a server, on strict port
5200; it does not fall back to another port. Caches are under this harness's
ignored `.cache` directory. The runner closes the browser/server and kills its
own process tree on timeout. Its nonzero exit on partial coverage is intentional.

```powershell
node --test scripts/d1-measurements/worker-output.test.mjs
node node_modules/typescript/bin/tsc --ignoreConfig --noEmit --target es2023 --module esnext --moduleResolution bundler --types node,vite/client --skipLibCheck --strict --noUnusedLocals --noUnusedParameters scripts/d1-measurements/measure.ts
node scripts/d1-measurements/run.mjs --render
node scripts/d1-measurements/verify.mjs
```

- Protocol/timeout tests: **5/5 PASS**, including a deliberately stuck worker.
- Focused TypeScript check: **PASS**; initial invocation needed TypeScript 6's
  `--ignoreConfig` when naming source files. No product config was changed.
- Final runner: **exit 1, PARTIAL**, 26 domain records and eight render records;
  three explicitly bounded tours, no fixture errors or cohort timeout.
- Evidence verifier: **PASS** on source/harness hashes, all 16 projection/reload
  invariants, 10 archives, 32 render modes and repeat geometry identities. It
  explicitly retains 13/16 complete traversal coverage, not overall acceptance.
- [Original final compact JSON](../evidence/d1/measurements-before-local-lookups.json) includes raw timings,
  fixture recipes, hashes, counters, byte counts and memory snapshots.
- [Initial compact JSON](../evidence/d1/measurements-initial.json) retains the
  first domain result and renderer failure. Initial Vite `appType: custom`
  returned 404 for the harness HTML, whose CSP blocked dynamic module imports.
  Direct diagnosis confirmed the 404/CSP; `mpa` plus an explicit successful-load
  check fixed the harness only. No product failure is inferred from that run.

Product source SHA-256 (tracked `src`, package and lockfile paths plus bytes):
`9b77678bd3a54c42af35eb8a351ed326c5e982f1897056b08f3bc344ddaa1296`.
Integrated D1 acceptance, production/native storage, mobile/resize, provider
behavior, capacity UI and full quest/combat completion remain outside this lane.
