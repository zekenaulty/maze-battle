# Actual Planner Input Disclosure Pair

Base: `6f5508f`; isolated branch `codex/corpus-planner-disclosure`.
Fixture-only increment. Production, Agentica SDK, original corpus policy and
profile limits are unchanged. Ports 5436/5437; no owner DB or preview.

## Capture Boundary

`corpus-planner-capture` wraps the existing public-only `CorpusSequencePlanner`.
Each actual `CreatePlanAsync`/`RefinePlanAsync` call synchronously serializes its
complete public `PlanningRequest` and refinement `Observation` before invoking
the policy. This includes request/context, descriptors, observations, receipts,
execution context, tool surface, and both context frames. Public JsonIgnored
members (session context, authorization scope, compact payloads) are retained
too. No selected-field projection or pre-storage normalization is used.

Read-only `/fixture/planner-inputs` exposes immutable UTF-8 JSON strings, byte
counts and SHA-256 hashes, never inputs to planning. Bounds: two roots, two
windows/root, eight calls/window, 262144 bytes/call (8 MiB maximum retained UTF-8
payload, not total heap). Exhaustion/oversize refuses explicitly before policy execution; no
partial capture. This dedicated model does not capture existing cohort models.
The launcher passes an environment allowlist, the factory admits offline models
only, and provider environment lookup throws. Zero paid calls is a construction
property, not billing telemetry. No credential fields are redacted after capture.

## Paired Qualification

One actual-App/pinned-service test runs fresh A then B, with ordinary guild
acceptance and identical owner objective. Variant enters genesis only. The
policy sees no world fixture, hidden target coordinates or oracle path.
Each world executes objective/objects/frontiers queries, selects the first
delivered frontier, parks, explicitly Continues, and repeats that public policy.
Eight calls/world: create + three refinements in each of two windows.

Every captured current observation is independently compared to the original
sent start/result/wake observation. All complete request fields are then compared
across the pair. Calls 0-6 are equal under the declared metadata allowlist. Call
7 is the first disclosure difference: 60 leaf differences confined to frontier
directions, coordinates and source indexes in the frame, retained observation
and refinement argument. A offers east; B offers north. The emitted action uses
the exact first received token. Both anchors happen to share the same junction
tile; this test does not claim entry into the later divergent branch.

Allowed pair differences are specific identity paths, absolute observation,
receipt, frame and goal-spine timestamps, plus elapsed/remaining timeout values.
Identity mapping is bijective across both windows. Observation and host-frame
digests are checked against their complete raw sources before allowing derived
identity differences. Embedded frontier/page tokens are decoded only in a
comparison copy; unknown fields and all gameplay fields remain comparable.
Receipt prose permits only its bound receipt ID to vary, retaining the rest.
Timeout accounting, pressure categories, revisions, source sequences/indexes,
tool schemas, semantic IDs, budgets and counters remain exact. No global UUID,
date or field-name scrubber is used. Raw strings and every applied allowance
remain attached independently of the comparison.

Both roots perform local Stop, reconcile the retained navigation terminal twice,
then acknowledge funded root Stop. Allocations become empty; counters and raw
captures remain unchanged. This is not objective completion qualification.

## Verification And Retained Failures

- Final native pair: **1 PASS**, 65.064s test / 72.006s total, zero retries.
  Evidence: `test-results/maze-start-service-IMRJHs` (`results.json`, raw capture,
  pair comparison, independent wire, trace, source hashes and provenance).
  16 calls, 523599 raw bytes, maximum 45496 bytes/call. Four planner instances,
  four creates, twelve refinements, sixteen actions, two explicit Continues.
- Capture self-tests: **3 PASS groups** (complete immutable pre-policy snapshot;
  root/window/call exhaustion; oversize refusal before policy).
- Comparator: **7 PASS** (identity/clock, gameplay, unknown/removal/tools, digest
  tamper, cross-call alias, unchanged budgets, embedded-token fields).
- Root and focused service-fixture TypeScript checks: **PASS**.
- Initial candidate `test-results/maze-start-service-0UGOne`: **FAIL**, 33.4s.
  Eight calls captured, but test incorrectly expected root Stop acknowledgement
  without reconciling the parked child terminal. UI truthfully showed pending;
  no production change. Reused the existing two-reconcile cleanup sequence.
- Intermediate capture/cleanup run `test-results/maze-start-service-pF4et7`:
  **1 PASS**, 69.057s total. Full pair comparison was then applied to its retained
  raw evidence before the final assertion-bearing run above.
- An intermediate focused typecheck rejected the new `.mjs` comparator import
  without a declaration; the dedicated `.d.mts` fixes it. No runtime failure.

Commands (from this worktree; service launcher builds in isolated TEMP):

```powershell
$env:MAZE_START_BROWSER_PORT='5436'; $env:MAZE_START_SERVICE_PORT='5437'
node tests/agentica-start-service/run.mjs --agentica-root C:/Users/Zythis/.codex/worktrees/maze-action-recovery/Agentica --grep 'paired corpus actual planner inputs'
dotnet C:/Users/Zythis/AppData/Local/Temp/maze-start-service-IMRJHs/artifacts/bin/StartServiceFixture/release/StartServiceFixture.dll --capture-self-test
node --test tests/e2e/canonical-start-service.planner-compare.test.mjs
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-start-service.tsconfig.json
node node_modules/typescript/bin/tsc --noEmit
```

Pinned Agentica source `27cb2ce9717438edfe19487e3920faa183112c97`; external tree
and vendored SDK are checked unchanged. Build SDK 10.0.401, not repository SDK
pin 10.0.302 qualification. This slice proves the fixed public sequence through
first disclosure, not all inspect scopes, map/UI/fog equivalence, later windows,
adoption/transfer, model competence or paid-provider behavior. Full cohort not run.
