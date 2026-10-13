# Issue 11: Bounded Structural World Storage

2026-10-13. P2a; **P2 remains partial, actual-game cutover is not qualified**.
Authority: [issue 11](https://github.com/zekenaulty/maze-battle/issues/11).
This extends the canonical database without adding a playable alternate game or
reading/converting old formats. The current preview still uses its prior writer.

## Implemented Boundary

- Extracted `bootstrapModule` and `proposeModuleStep` from the existing D1 module
  assembler. The existing assembler now calls them too. They take a compact
  generation state, one reserved socket, its source and a local occupancy query,
  not the whole floor. No replacement layout algorithm or fixed room alignment.
- Canonical floor initialization and expansion persist pinned `modules-v3`
  recipes, `stone-room-v1` room/passage specs, ports, connections, frontier records
  and occupancy bins. A proposal publishes both endpoints and updated counters
  with its exact command receipt in one transaction. Pending sockets never permit
  travel. Previously stored room geometry is not rewritten when links are added.
- The same paged occupancy code now accepts read/write functions instead of an
  experiment-specific database handle. Expansion reads at most 25 local bins.
  Each bin is validated; missing means empty, but stored null is invalid.
- One room load materializes at most 512 cells and four connection references.
  A step loads the current room and, only for a doorway, its destination. Both
  boundary direction and reciprocal adjacent walkable endpoints must agree.
  Missing established rooms, ports, floors or connections cause failure; the
  resolver never regenerates them or performs optional interactions.
- Floor creation records reciprocal stairs from the completed upper exit to the
  new entry. Only the next never-generated level can be prepared. Ascent and
  descent load exact endpoints; floor-one ascent resolves the town return point.
  Both source and destination geometry must exist and be walkable. Portal/item
  consumption and mode transitions remain shared-game integration work.
- Local mutation records live in the world area, separate from knowledge.
  Historical world roots retain old doors while later generation advances current
  topology. These internal authoritative readers are NOT disclosure tools.

## Native Measurements

Chrome on isolated `127.0.0.1:5209`, one worker, no external requests. Eight real
generated rooms per floor, pinned seeds; retain 1, 8 or 32 complete structural
floors. Six east/west resolver steps in floor one's entry update only the compact
checkpoint and exact receipt. Scans/getAll are forbidden during those steps.

| Retained generated floors | Head bytes | Native read payload/step | Native write payload/step | Mean step time |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 471 | 28,336-28,337 B | 1,138-1,142 B | 7.67 ms |
| 8 | 472 | 35,981 B | 1,143 B | 8.88 ms |
| 32 | 473 | 42,914 B | 1,147 B | 9.02 ms |

Every measured step writes exactly one `heads` and one `receipts` value. Geometry,
connections, mutations and all other floors have zero writes. Reads grow with
bounded radix index paths, not a scan/deserialization of floor history. Logical
retained charges after the six steps: 194,401 / 1,703,825 / 7,762,962 B. No sources
are pruned; enforced canonical quota limits ongoing history growth.

Origin storage estimates before/after: 282,624/286,720; 1,921,024/1,929,216;
8,265,728/8,269,824 B. Estimates include native overhead/compression. Measured
payloads are JSON bytes of actual IndexedDB requests, **not physical disk I/O**.
Times include instrumentation overhead. Internal structured-clone allocation is
not directly measured. These are real generator/storage/resolver tests, NOT App
movement, observation-bookkeeping costs or Agentica end-to-end qualification.

## Verification

- **562 focused unit tests / 27 files PASS**, final rerun 35.28 s. Covers persistence,
  module generation/policy and 41,472 candidate shapes inside the local read bound.
- **102 native IndexedDB cases PASS**, 63.07 s, no retries, skips or flaky cases;
  26 world cases plus all 76 canonical kernel/operation cases.
- **Final 26-case world rerun PASS**, 37.4 s, after a stair-construction cleanup;
  **fixture TypeScript and production build PASS** (2,132 modules). The existing
  main-chunk size warning remains at 554.12 kB. Shared generator extraction is
  bundled; the canonical world writer is not yet adopted by the playable app.
- Byte-for-byte SHA-256 generation transcripts match the pre-extraction source
  for nine seed/level/policy cases. Native persistent direct/mixed/passage outputs
  match the in-memory assembler's rooms, joins and connections exactly.
- Twelve-floor return after native reload and ownership takeover preserves room
  record identity, authoritative mutation state and separately retained knowledge.
  This exercises stair resolution, not a fully rendered player walking every tile.
- A 2,006-room budget advances 32 bounded proposals to 33 rooms without allocating
  the future rooms or a full grid. This does not qualify completion of that floor
  or unbounded total storage.
- Native failure injection at record/head/receipt writes rolls back the entire
  expansion; retry applies once and replay does not invoke generation again.
- Independent scoped review completed with no remaining actionable findings.
  It identified missing upper-floor world binding, missing stair source geometry
  checks, and null-as-empty occupancy. All were repaired and covered natively.

The first 6-case native run passed 3 and failed 3 layout comparison tests because
the audit fixture supplied an incomplete read-budget object. The fixture was
corrected; generation had succeeded. The next 20-case run and combined 102-case
run passed. The intentionally corrupt records in regressions are disposable
fixture state, never changes to the owner's game data.

Raw local evidence: `test-results/canonical-world-combined-results.json`, including
`world-depth-*` inline JSON measurements. The first failed run is retained as
`test-results/canonical-world-first-results.json`; the final targeted rerun is
`test-results/canonical-world-final-results.json`.

```powershell
node node_modules/vitest/vitest.mjs run --config tests/click-navigation.config.ts --configLoader runner --maxWorkers=2 src/persistence src/domain/expedition/topology/modules src/domain/maze/moduleGenerate.test.ts src/domain/maze/modulePolicy.test.ts
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical.tsconfig.json
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical.config.ts
npm run build
```

## Remaining Boundary

P2b must bring floor quality/content-role assignment, chest/encounter definitions,
bounded rendering and perception residency into the shared game, preserving
mandatory effects and explicit interactions. Structural `exit` means generation
reached its room budget, not that the full D1/content/quest qualification ran.
P3 must replace `GameState.floors` in the active path and persist party/items/quests,
observations, Agentica execution/delivery and manual saves on the same authority.
P4 removes every superseded runtime database/writer. P5 repeats actual-App deep
revisits, native movement instrumentation, known-destination and Q recovery gates.
No paid provider, paired service, full Q or final #11 completion is claimed.
