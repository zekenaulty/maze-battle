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
| Full unit regression | 4,747 PASS, zero failures, one existing optional SKIP | `room-map-integration-full-units-final.json` |
| Frozen actual-App/pinned-Agentica service regression | 43 PASS, 1,006.146s; zero skips/retries/flaky cases | `maze-start-service-RfgRdm/results.json` |
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
No runtime guard or limit was weakened. The full-unit rerun and real-service
requalification both completed successfully; they are separate runs in the table.

## Frozen Candidate And Preview

The full service cohort qualifies Maze Battle commit
`3e04e914fde3d7f4c1945f5f4cae4e6f0e9c9d64` against clean Agentica source
`27cb2ce9717438edfe19487e3920faa183112c97`, using deterministic fixture planners.
It ran with .NET SDK **10.0.401**, not the repository-pinned **10.0.302**; this
does not qualify that pinned SDK environment. The candidate runtime and fixtures
were unchanged throughout the run. No paid provider was used.

`test-results/maze-start-service-RfgRdm/provenance.json` retains exact source,
fixture, action-contract and built assembly hashes, SDK selection and command
arguments. `results.json`, `service.log` and browser traces retain the raw run.
That 43-case service cohort contains existing recovery/return cases, not the
paged-room-selection journey. The later checked 45-case composition is recorded
below with its own frozen source identity.

An isolated production preview is available at `http://127.0.0.1:5199/`. Its
fresh-origin smoke passed at 1440x1000 and 390x844: Rooms opens, recall draws,
Map closes, no horizontal overflow, and no browser page errors. Canvas backing
sizes were 1432x840 and 382x499 respectively. Screenshots are retained as
`test-results/room-map-preview-final-<width>-{rooms,recall}.png`; the portrait
pair was visually inspected. A first smoke timed out on an incorrect test
selector expecting `aria-busy="false"`; ready canvases omit that attribute.
The corrected smoke required absence of `aria-busy="true"`. No runtime change
was needed. The owner's preview on port 5198 and its stored game were untouched.

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
node tests/agentica-start-service/run.mjs --agentica-root C:/Users/Zythis/.codex/worktrees/maze-action-recovery/Agentica
```

Fixture typechecks use `tsc --noEmit -p tests/e2e/<name>.tsconfig.json`, for
`canonical-game-map`, `canonical-revisit`, `canonical-corpus`,
`canonical-exploration-prefix`, `canonical-room-connections`, `canonical-agentica`
and `canonical-start-service`. No paid provider is used.

The [actual-App room journey](../../tests/e2e/canonical-start-service.room-journey.md#parent-integration-2026-10-22)
now composes deliberate off-window room choice with sustained execution in both
authored worlds. Ordinary sight earns three rooms; the planner discloses but
does not collect a chest, returns to the earned entrance, then selects the
remembered room from public map page two. Its exact off-viewport anchor causes
the subsequent 22-step / one-replan navigation, crossing the 16-step prefix.
Explicit collection and earned return then reach host and service completion.
B adds reload/explicit adoption after arrival, before collection. All 32
original actions replay exactly without new submissions in each world.
No hidden layout coordinates guide the fixture policy.

Frozen parent `6f5508f` passes all **45 actual-service cases** (1,452.803s), with
the same Agentica source and separately labeled SDK environment. Independent
review added explicit service-completion and pack-not-stash custody assertions.
The report retains provenance, failed fixture attempts and exact limitations.
This is not a mid-flight recovery or >64-step native route proof.

[Paired connection queries](../../tests/e2e/canonical-corpus.queries.report.md)
now cover equal common-prefix frames/work, partial/earned-complete connections
and opaque unknown/passage selectors. The dedicated [actual-App UI cohort](../../tests/e2e/canonical-corpus-ui.report.md)
also passes exact dungeon/Rooms/Nearby, fog and DOM comparison before lawful
divergence at desktop and portrait sizes, without native DB writes. These do
not close all information or generated-topology gates: native multi-page
connection continuation, complete planner inputs and active journey recovery
remain. Sprints 2-6 retain their declared gates. No unlimited component
traversal, automatic interaction or full RPG/combat parity is claimed.

Public service-map pages contain two rooms; manual Rooms pages contain four.
The four-room authored corpus can exercise service pagination, not manual page
two. Manual room selection remains recall-only. Existing native manual paging
evidence stays separate; this journey test does not prove UI-driven
travel. Preserve 64 movement steps, four replans and 120 seconds per navigation
window, the corpus profile and existing read/payload limits. A representability
failure is reported rather than solved by weakening these acceptance checks.
