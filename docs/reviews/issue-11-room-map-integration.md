# Earned Room Map Integration

2026-10-22. Issue #11 and the umbrella goal remain open. This integrates the
room-level operations required by Sprint 1; it does not close all six sprints.

## Behavior

- `maze.inspect` scope `connections` collapses observed passage cells into
  connections to other earned rooms. Raw `links` remains available unchanged.
  Scope/grant/publication/cursor restrictions and existing payload/IO caps apply.
  Connections are evidence, not permission to move or interact.
- Map opens a four-room page with earned anchors. Selecting a room recalls its
  local known cells without moving, looking again, collecting or spending items.
  Nearby retains ordinary overview/click-to-walk controls. Room recall remains
  read-only; manual camera adjustment is allowed.
- Centered recall follows actual canvas dimensions, including resizing while
  Rooms has unmounted the canvas. Manual adjustment releases that centering.
- Memory blocks now have mandatory immutable integrity companions committing the
  entire accumulated value and its record identity/revision. Deleting the sole
  reference to an older observed edge can no longer turn corrupted evidence into
  an apparently unexplored passage. Source receipt validation still applies.
  Missing proofs refuse; there is no resealing, migration or fallback.

The integrity addition uses the existing knowledge namespace and transaction,
not another store. Unchanged memory blocks retain identity; changed block/proof
pairs publish atomically. Current funded obligations remain protected. Older
development saves are disposable under issue #11, but owner state is not silently
reset. The existing owner preview/data were not changed during this integration.

## Reviewed Repairs

Independent review first reproduced omitted old-edge evidence; accumulated
memory proofs close that defect. UI review then found two regressions: Nearby
controls were unnecessarily disabled, and stale canvas dimensions could put a
recalled anchor outside the viewport. Both are corrected with unit/native checks.
Review also strengthened callback/head assertions after Map closes and checked
manual camera adjustment after recall. Child source checks are distinct from the
integrated runs below.

## Integrated Evidence

| Check | Result | Local evidence under `test-results/` |
| --- | --- | --- |
| Knowledge, action adapters, room-map hooks/UI | 1,167 PASS | `room-map-integration-reviewed.json` |
| Final exact-read-count and recall assertions | 39 PASS | `room-map-integration-final-fixes.json` |
| Native existing map plus paged recall/resize | 6 PASS, zero retries/skips | `room-map-integration-ui-final/results.json` |
| Paired authored corpus and dispatched queries | 8 PASS, 97.583s | `room-map-integration-corpus/results.json` |
| Native retained prefixes, reload/adoption/replay/Stop | 3 PASS, 98.262s | `room-map-integration-prefix/results.json` |
| Native public room connection and exact historical replay | 1 PASS, 8.331s | `canonical-room-connections/results.json` |
| Actual-App retained-depth/history and two-floor revisits/takeover | 3 PASS, 133.223s | `room-map-integration-revisit/results.json` |
| Production and seven affected fixture typechecks | PASS | terminal checks; commands below |
| Isolated production build | PASS, 2,143 modules; existing >500 kB warning | `room-map-integration-build/` |

Desktop, portrait-phone and landscape-phone screenshots were generated; desktop
and portrait room-page/recall screenshots were visually inspected. Tests check
no horizontal overflow, exact recalled coordinates, nonblank bounded canvas,
no movement/town/chest callbacks, and unchanged native head after closing Map.
The UI fixture uses test-only placements plus ordinary sight to earn its pages;
that is not a proof of a lawful multi-room gameplay journey.

The original 160-move prelude remains unchanged. Additional rollback-only native
tests reach a genuinely changed memory block/proof, inject an IndexedDB duplicate
key failure and a real write-ledger limit failure, and retain the entire database
and funded allocation. The original journey then performs reload/adoption, replay
and Stop/ACK. See [fault details](../../tests/e2e/canonical-exploration-prefix.memory-atomic.report.md).
This is not a >64-step route proof.

The positive room-connection case observes its passage through ordinary movement,
uses real canonical dispatch with typed offline admission, then replays after
new sight, reload/new epoch and local Stop without world/knowledge record reads
or mutations. Remote ACK funding remains retained, not falsely cleared. See
[native connection evidence](../../tests/e2e/canonical-room-connections.report.md).

Retained intermediate failures: first focused run had one old memory-read count
(4 now 8, explicitly four bodies plus four proofs); first full unit run had
4,744 PASS / 3 FAIL / one optional SKIP, all failures the old objective read count
(23 now 24, with the exact new proof key asserted). The three new map fixture
cases initially supplied a geometry cell's extra fields as an address and failed
schema validation; explicit row/column selection fixed the fixture. A previously
stale fixture also lacked required noncombat/auto-throttle GameView fields.
No runtime guard or limit was weakened. Full-unit rerun and real-service
requalification are recorded below when complete, not inferred from these passes.

## Commands And Remaining Gates

Run from the parent worktree, with each native config owning a separate isolated
origin. `MAZE_MAP_RUN`, `MAZE_PREFIX_RUN`, `MAZE_REVISIT_RUN` and `MAZE_CORPUS_RUN`
select separate evidence directories so failed attempts are retained.

```powershell
node node_modules/vitest/vitest.mjs run --maxWorkers=2
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-game-map.config.ts
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-room-connections.config.ts
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-exploration-prefix.config.ts
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-corpus.config.ts
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-revisit.config.ts
node node_modules/vite/bin/vite.js build --outDir test-results/room-map-integration-build
```

Fixture typechecks use `tsc --noEmit -p tests/e2e/<name>.tsconfig.json`, for
`canonical-game-map`, `canonical-revisit`, `canonical-corpus`,
`canonical-exploration-prefix`, `canonical-room-connections`, `canonical-agentica`
and `canonical-start-service`. No paid provider is used.

Remaining Sprint 1 work includes composing deliberate off-window room choice
with sustained execution in the actual App; separately proven recall and travel
are not that composition. Native multi-page connection continuation and full
paired connection-scope coverage remain. Sprints 2-6 retain their declared
information/recovery/parity/endurance/frozen-candidate gates. No unlimited
component traversal, automatic interaction or full RPG/combat parity is claimed.
