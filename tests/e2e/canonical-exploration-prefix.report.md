# Native Earned Survey Prefix Qualification

## Scope

Base `316212d53ad4c43370c614d3622c170c7b8504f7`; navigation/knowledge/generation
sources match the earlier `db001c7` prefix repair. Only new prefix fixture,
tests, configuration and this report. No runtime or service-fixture changes.
Fresh disposable Chrome contexts, native IndexedDB, isolated port 5418;
nonlocal traffic blocked. No provider, Agentica service or owner-preview use.

This qualifies **22 steps across a 16-step retained prefix**, not >64 steps,
whole-room coverage, a full-room agenda, or sustained autonomous exploration.

## Native Case

- Seed 66, existing `stone-room-v1` generator, eight 15x15 rooms/direct joins,
  world `frontier-exploration-pair`. Standard generation/quality/roles/content
  preparation; real entry-center start, ordinary look and **126 ordinary moves**.
  No teleport, authored sight, geometry/content mutation or injected progress.
- The original search's 136-move endpoint cannot freshly admit room exploration:
  it has no current frontier. The native prelude earns the west-hand room earlier,
  then ends at `socket-0:room (0,5)`. It is not the identical search history.
- Admission selects the first same-space frontier from the current public query:
  `(2,0)`, south. No seed, hidden geometry, desired survey waypoint or route is
  passed to runtime planning. Seven approach moves plus one crossing reach `(3,0)`.
- Production survey selects `(11,0)`: shortest earned detour **22**, retained
  prefix **16**, original window `{floor:1,row:8,column:-10,rows:21,columns:21}`.
  The independent diagnostic uses the same source-validating knowledge reader,
  with throwing guards against world reads and scans; it never supplies a plan.
- At cumulative step 24 the retained prefix is empty. Real page reload preserves
  native state. Refill stays in the original window and yields six more moves.
  Every executed survey position matches the original route: no oscillation.
- Same-owner case retains `{steps:26,replans:1,durationMs:120000}`. Refill is clipped
  to the remaining two moves; the next pulse blocks at the original step limit.
- Adoption case retains `{steps:32,replans:1,durationMs:120000}`. Takeover/resume
  changes epoch, refuses stale-owner and unadopted advances without writes;
  explicit adoption after reload charges exactly one replan on advance. The
  original deadline, binding, waypoint and window survive; step 30 reaches the
  selected waypoint. Local survey remains running, not semantically complete.
- Both cases perform funded cancellation, reload, reject new movement and ACK
  the exact terminal. Admission/move/cancel/ACK exact replay returns original
  receipts with zero writes; changed-body replay is refused. Full native-store
  SHA-256 digests remain equal around read/replay/refusal groups. Final reserved
  bytes/reservations are zero. World root, party, inventory and stash are unchanged.
- Deadline retention is checked, not wall-clock expiry. Quota exhaustion, crash
  injection, UI/service integration and >64 native movement are not qualified.

## Commands And Evidence

Run from the isolated repository root:

```text
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-exploration-prefix.tsconfig.json
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-exploration-prefix.config.ts
node node_modules/vitest/vitest.mjs run src/persistence/canonical/navigation/explorationPlan.prefix.test.ts src/persistence/canonical/navigation/exploration.prefix.test.ts
node node_modules/typescript/bin/tsc --noEmit
```

Final checks: **2 native passed, 0 failed/skipped/retried**, 68.337 s, started
2026-10-20 22:15:21.212 UTC; **9 unit tests passed in 2 files**, 2.87 s; both
TypeScript commands exit 0. Node 22.13.0, Chrome 155.0.8059.85, Vitest 4.1.11.
Both native cases: diagnostic survey 656 transaction reads, readonly refill 679,
refill move 826 (also maximum navigation-pulse reads), exact move replay zero
writes. Final steps/replans: resume 26/0, adopt 30/1; reserved bytes/reservations
zero. These measured counters are not a claim about arbitrary-history bounds.

The native config selects exactly two tests, one worker, no retries. JSON results
and per-stage evidence are under `test-results/canonical-exploration-prefix/`.
Evidence includes every setup command's attempt/observation/revision/stats, all
navigation receipts, retained states, original requests, quota and store digests.
Measured transaction reads include physical canonical storage work, unlike the
search's logical adapter counters. No work/read bounds were increased.

Retained candidates under `test-results/`:

- `canonical-exploration-prefix-candidate01`: two failures with the 160-move
  prelude; `Canonical storage: exploration read budget exhausted`. Also a test
  guard mistake rejected same-origin Vite WebSockets; corrected to allow only
  the isolated local origin, not any provider/service connection.
- `canonical-exploration-prefix-candidate02`: one diagnostic reproduction after
  the guard fix. Pulse 16 fails; committed state remains at step/sequence 15,
  survey `(3,7)`, waypoint `(11,0)`. Existing material-reader bound is 256 logical
  reads. This is a real history-dependent limit, not repaired or hidden here.
- `canonical-exploration-prefix-candidate03`: 94-move prelude, one failure at
  pulse 6 due to lawful `other-space-visible` notice for `socket-5:room`. No
  material-stop suppression was added; this setup was discarded.
- `canonical-exploration-prefix-candidate04`: 126-move prelude, same-owner case
  passed. `candidate05`: both cases passed before final admission-snapshot checks.

## Preserved 128-Seed Search

Original search at `db001c792ec4893f3a6a6d5403cff0a8dc11ccbf`,
2026-10-20 21:36:25.720..21:44:27.922 UTC (**482.202 s**). Exactly **128** distinct
floor seeds: 0..63 default odd 5..15/mixed joins; 64..125,177,349 with existing
15x15/direct policy. Eight rooms each: **1,024 rooms, 136 passages**, all **36**
supported odd dimension combinations, **156** sampled local shapes.

**120,208 trajectories; 31,606,994 evaluated checkpoints; 75,717,002 reachable
unresolved candidate evaluations; 412,316 unreachable candidate evaluations.**
Counts include repeated states. Eight DFS orders, three deterministic random
walk variants, nearest-boundary survey and unseen-cell-preserving walks; finite
256/512-move continuations. Entry-origin and cold-placement histories were kept
separate. Actual materializer/linked sight, full current sight and earned edge
union; no guessed shortcuts. Offline geometry constructed setup walks only.

| Maximum | Steps | Seed/history | Limit |
| --- | ---: | --- | --- |
| Selected entry-origin survey | 22 | 66, 136 moves | Native variant above qualifies 22, not >64 |
| Any reachable unresolved boundary | 31 | 16, 45 moves | Actual planner selects another 7-step boundary |
| Any remembered destination | 32 | 16, 46 moves | No selected survey boundary here |
| Cold-placement selected survey | 19 | 3, 42 moves | Does not establish entry traversal |
| Cold-placement other boundary/destination | 29 | 6, 30 moves | Not the selected survey |

Production cross-check: **6 passed, 0 failed**, in-memory storage only; **329**
actual command-handler moves plus looks, **4,976** sight comparisons across every
origin of checked floors, exact route/source validation, unchanged world records.
Planner/region aggregate: **3,340 logical gets, 0 scans, 0 hidden reads**; selected
22-step case **682 gets, 3 witnesses**. This was not native grant/reload proof.

Geometry: room axes odd 5..15 (at most 225 coordinates), one-wide passages at
most seven long; every cardinal-adjacent walkable pair is linked. Two-wide open
perimeter and center cross with seeded pillars/square/baffles. Maximum sampled
walkable room 221 cells; sampled truth diameter 28, actor-window truth distance
20. These are **not upper bounds on partially earned memory graphs**. Sight
radius seven/max 113, jointly visible edges only, retained source provenance;
survey window 21x21, same-space routes, nearest-boundary/coordinate ranking,
16-step retained prefix, 512-cell full ranking and 64-step refill path prefix.

**>64 NOT FOUND, not proven impossible.** Stop reason: 128-seed cap, not a
structural proof. Histories/recipes/shapes are sampled, not exhaustive. The
existing abstract >64 unit regression retains its narrower evidence level.
Raw search/report/verification artifacts remain in ignored
`test-results/exploration-prefix-search/`; this tracked summary preserves their
exact bounds and limitations, separately from the later admission-setup probes.

## Integrated Recheck

At parent candidate `bc3f8be`, the independent source review found no blocking
finding. The parent repeated both native cases: **2 PASS**, zero failures,
skips or retries, **54.6 seconds**. The nine focused prefix units and fixture
TypeScript check also pass. Native evidence is
`test-results/canonical-exploration-prefix/results.json`; unit evidence is
`test-results/prefix-parent-unit.json`. No service or paid-provider run is
included. The longer 160-move material-reader failure remains a separate open
runtime defect; these passing cases do not qualify sustained history scaling.
