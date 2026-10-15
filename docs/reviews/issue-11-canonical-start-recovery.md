# Issue 11: Canonical Durable Start Recovery

2026-10-15. Integration base `e47168d`; pinned Agentica service `602f15a`.
Issue #11 and the umbrella goal remain open. This is a bounded initial-launch
integration, not the complete Agentic Play controller.

## Implementation

- Vendored the exact checked SDK, with provenance and executable fidelity tests.
- GameSession commits the dispatch attempt before `start.durable`. That exact
  attempt is the service key. Neither reload nor a missing response creates a
  replacement run.
- Validate both full service requests against the retained original authority,
  allowing only typed defaults and resolution of unspecified provider settings.
  Scope, objective, evidence, capabilities, limits and explicitly chosen settings
  must remain unchanged. Service-generated request hashes are format-checked and
  pinned, not falsely described as client-recomputed .NET digests.
- Persist a compact admission alongside the canonical run: exact attempt/run,
  hashes, resolved provider settings and admission timestamp. Original requests
  remain in their existing canonical source; no duplicate full-request store.
  Subsequent operation receipts use the frozen accepted settings.
- Replace partial `/api/runs` discovery/cancellation with exact durable
  `/api/starts` lookup and `/api/starts/stop`. A 404 is UNKNOWN; `terminal: null`
  is still pending, including when Stop has been requested.
- Local cancellation precedes network effects and uses already-reserved capacity.
  Only a validated immutable service terminal can release a dispatched launch's
  reservation. An undispatched launch can settle locally without service access.
- Funded verified ACK rechecks the original source inside the canonical
  transaction. Physical-write retries retain the original request. History reads
  and replacement-launch admission validate the compact ACK proof again. Settled
  launches cannot acquire new run records afterward.

No migration, fallback reader, parallel launch database, automatic restart,
implicit grant, wake or provider activation was added. Ordinary App gameplay and
the user's preview database are not test fixtures.

## Qualification

Checked production through `3f6db39`, integrated fixture changes through
`1f60dce`. The following cohorts are distinct; overlapping review reruns are not
added to their totals.

| Gate | Result and evidence boundary |
| --- | --- |
| Full unit suite | 3,001 PASS, one optional .NET manifest probe SKIP; `vitest run --maxWorkers=2`, 197 files, 224.15 seconds. |
| Focused post-integration unit rerun | 200 PASS; canonical Agentica/game/directed wire suites. Included in the full suite, not additional cases. |
| Native canonical cohorts | 331 PASS, no failures/skips; launch 93, transport/recovery 56, operations/event/terminal 116, actions 23, action guards 17, GameSession host 17, concurrency 9. |
| Real service/browser integration | Five PASS using real GameSession/IndexedDB, vendored SDK and pinned Agentica HTTP/WebSocket service. No model calls or action frames. |
| Actual App | Three PASS: desktop/mobile movement/reload/canvas pixels, invalid observation with explicit reset, and former routes sharing the same game. |
| Node | 17 PASS: 12 SDK fidelity/contract checks and five D1 worker-output checks. |
| Types/build | Production TypeScript and build PASS; six affected fixture TypeScript checks, real-service fixture and SDK declaration checks PASS. |

The 331 native cases ran serially with one worker in the isolated
`codex/maze-durable-start-tests` workspace at `6f52fcd`. The integrated parent
production and affected fixture files were compared and are identical. Those
cases use mocked service replies to exercise adversarial transitions; they are
not claimed as real-service coverage.

The real-service cohort ran again on parent `529eb65` (14.5 seconds); evidence is
`test-results/maze-start-service-TozcCb/`, including source/assembly provenance,
requests, traces and service logs. It proves exact recovery after loss injected
at the correlated SDK reply boundary, browser reload, normal logical-quota
exhaustion, actual service-process restart, unknown admission and invalid key/
reference rejection. The injected planner waits cancellably and never produces
actions. Service usage may count that fixture planning entry; this is not paid
usage. [Reproduction and limits](../../tests/agentica-start-service/README.md).

The service build used installed .NET 10.0.401 outside the checkout; unchanged
10.0.302 pin and hosted CI are NOT qualified. Fixture storage and ports 5258/5259
are isolated. Expected negative 400/404/409 responses are not hidden.

Independent review found and repaired three defects: resolved provider settings
could exceed the original submission byte cap and prevent settlement; typed fact
defaults/100-nanosecond timestamp formatting could reject legitimate echoes; a
late announcement could invalidate an already-ACKed launch. Four independent
repros pass after repair, along with committed unit/native regressions. Local
Stop priority over a conflicting late announcement/grant is also covered.

Initial failures are retained: the default highly concurrent full unit run timed
out in two heavy topology/autoplay cases (the other 2,997 passed); both focused
one-worker reruns and the subsequent full two-worker run passed without relaxing
their timeouts. One invocation accidentally supplied a Vitest diagnostic file to
Node's runner; the corrected Node cohort passed, and that diagnostic remains in
the passing full Vitest suite. Fixture development exposed setup/typecheck and
unrelated Vite HMR socket issues, repaired in the fixture, not production.

Preview 5198 returned HTTP 200. No user-preview reset or database modification
was performed. The browser tool did not expose the previously reported tab, so
current visible user-tab state is not claimed; recovery/rendering evidence is
from the isolated actual-App cohort.

## Remaining Work

Explicit remote transfer/adoption, decision/wake and publication renewal remain
before the Agentica controller can mount in the actual App. Then remove the
remaining old RPG writer and proof adapters, and complete the planned depth,
revisit, multi-controller, capacity and two-dungeon gates. Live-model testing
still requires separately confirmed provider limits and authorization.
