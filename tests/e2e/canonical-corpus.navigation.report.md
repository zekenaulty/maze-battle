# Paired Navigation And Immediate History

2026-10-22 local. Base `07114dc6920e47a8cdf5f43de6ee6ea5a756df89`, branch
`codex/corpus-navigation-disclosure`, isolated quest-context-boundary worktree.
Initial commit `e35b76e`: **PARTIAL: 1 native PASS / 1 native FAIL**, reproducing a
production source-reader defect without production/SDK edits. The authorized
identity repair below now passes **2/2 native cases**. The separate storage-work
delta remains unresolved; neither increment claims final goal qualification.

## Method

Fresh native IndexedDB, actual GameSession, shared `initializeCorpus` with null
knowledge, ordinary sight and public guild acceptance. No movement prelude,
teleport, injected knowledge or inventory. One bounded paired trajectory has two
entry cases: zero-step current-actor navigation followed by six/one east steps;
and the independent nonzero six/one-step case, so the initial-history defect does
not hide the remaining evidence. All destinations come from the public actor or
successive dispatched `cell` results' east edges. No layout/oracle path enters
navigation. Only the ordinary sight snapshot is the independent divergence oracle.

Real action reservation/dispatch/result, navigation admission/progress/settlement,
decision intent/claim/successor selection and verified handoff ACK paths run.
Launch and remote custody/claim responses are explicitly **typed offline evidence**,
not Agentica service or SDK-transport qualification. No provider/service/network
calls occur. Strict Vite port 5456 only; 5457 is a never-contacted offline endpoint.
Both ports have no listeners after the run. Owner/parent ports were not touched.

The existing xorshift UUID seed `0x731c0ffe` is installed before fixture modules,
only at the exact fixture URL. Date is fixed throughout to
`2026-10-20T12:00:00.000Z`; timers are not frozen. The full allocation/caller ledger
must match before sight divergence. No gameplay, IDs, bytes, errors or ordering
are normalized. The declared counter projection excludes only measured wall times
and browser physical-storage estimates; raw values remain attached.

Native request instrumentation covers the whole measured fixture call, including
its verification reads, not just one production action. All requests, statuses,
counts, serialized byte sizes and record keys are retained. Index/cursor access
fails closed; measured calls assert no enumeration. Canonical commit receipts and
their own counters are separately retained. These are not physical-disk metrics.

## Checked Claims

- Nonzero A/B case PASS: six actual east steps then one, with unchanged
  64-step / 4-replan / 120000ms navigation limits. Start, selected targets,
  admission, custody probe, each progress event, terminal, nonempty immediate
  history and syntax/unknown-destination refusal outputs match exactly through
  step six. The query contains the exact original terminal event, not the new
  actor-only successor publication. Query roots/checkpoint remain unchanged.
- Step seven ordinary sight differs lawfully. Admission, progress and history
  still match in this bounded actor-only projection; no assertion forces every
  surface to diverge. Source identities, capability schemas and raw frames remain.
- Old history replays after new sight with identical results and full native DB
  equality: 37/35 native reads, 64,891/63,631 bytes, zero writes for the two results
  in each world. All record reads are execution `agentica/` records, not current
  world/knowledge records. Missing source receipt and an inconsistent terminal
  source command both throw; independent full dumps remain unchanged. Fault
  injection restores exact original bytes, never reseals or backfills evidence.
- Successful cases finish original root Stop/ACK with zero allocations,
  reservations and reserved bytes. Maximum observed result/observation/event:
  **1502 / 1113 / 892 bytes**, below unchanged 4096 / 2800 / 4096 caps.

## Initial Reproduced Blocker

The zero-step navigation legitimately arrives with sequence/steps zero, retains
custody, settles, selects its successor and ACKs the predecessor. Its first
`maze.inspect {scope:'decision'}` then fails: `historical observation event changed`.

`src/persistence/canonical/agentica/operation.probe.ts:10` makes the source event ID
`custody-${attemptId}`. `decision.query.source.ts:41` instead requires the bare
source attempt ID for every source kind, including `probe`. The final failed
attachment retains confirmation attempt `336dcc42-8d80-4d06-8d7c-2ed7538968ae`
and probe `custody-336dcc42-8d80-4d06-8d7c-2ed7538968ae` with their original witness.
No synthetic event or forced advance was inserted to avoid this branch.

At `e35b76e` the remaining requested claim was **nonempty immediate history at the unmoved
initial checkpoint**. The source reader needs exact kind-appropriate probe ID
validation; the existing progress/transfer checks must not be relaxed. This lane
reported the defect and left the positive regression failing pending authorization.

## Separate Work Difference

Movement-byte equivalence is **FALSE**, not normalized away. Before any lawful
sight difference, moves 3-6 each read `dungeon/1/connection/socket-1:entrance`:
432 serialized bytes in A, 433 in B. Each corresponding canonical commit differs
by one read byte. The measured six-step fixture call has 7,592 reads in both,
14,139,822/14,139,826 read bytes, 437 writes and 622,686 write bytes. All raw output
frames still match; successor/history/refusal work comparisons match exactly.

The earlier strict work-equality assertion's failure is retained. The final
comparison reports every differing field and `equal:false`; it does not claim
whole-call work equality from equal actor outputs. This is input to the already
declared Sprint 4 boundary, not a new matrix. App diagnostics/capacity-threshold
observability and timing safety are not measured here or declared harmless.

## Commands And Evidence

```powershell
$env:MAZE_CORPUS_NAVIGATION_RUN='corpus-navigation-bounded-candidate'
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-corpus.navigation.config.ts
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-corpus.navigation.tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-corpus.tsconfig.json
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run --config tests/e2e/canonical-corpus.unit.config.ts --reporter=default --reporter=json --outputFile=test-results/corpus-navigation-corpus-units.json
```

Final native run: **1 PASS / 1 FAIL**, zero skips/retries/flaky cases, 50.316s;
started `2026-10-23T01:20:59.842Z`. Nonzero case 39.086s; zero case 6.389s.
All three typechecks PASS; corpus units **11 PASS**, 1.90s. Node 22.13.0,
Chrome 155.0.8059.85, Vitest 4.1.9. Dependencies are read through the existing
junction; Vite/Vitest caches and outputs are worktree-local. No clean-install claim.

`test-results/corpus-navigation-bounded-candidate/results.json` retains raw paired
frames, sight, source identities/receipts, counters, UUID ledgers, faults, cleanup,
source/fixture hashes and comparisons; failed traces are alongside it. Hashes
are rechecked after execution. Earlier `corpus-navigation-*` attempts remain:
unaccepted versus accepted request, action-derived observation ID, wrong cleanup
executor/quota shape, and strict movement-byte equality failures. Fixture type
errors were corrected before the final run; runtime guards and limits were not.

No existing query/UI/planner-frame cohort was rerun or relabeled as new proof.
No paid provider, actual service, parent edit, merge, push or goal completion.

## Checked Custody Identity Repair

Follow-up directly after `e35b76e`, 2026-10-22 local. The sole production change is
the final identity check in `decision.query.source.ts`: a `probe` must have exactly
`custody-${source.attemptId}`; progress and transfer still require the bare exact
attempt ID. No alternate ID, normalization, changed receipt or compatibility path.

The full binding remains layered: confirmation loading validates the original
action/grant/publication, admission/result, operation, custody epoch/owner, command
input and exact producer-generated probe. Historical query validates the selected
action's confirmation key, immutable row ID/revision/complete receipt witness and
confirm source operation. Replay additionally binds the reserved query publication,
successor grant, original intent, terminal settlement operation/attempt, generation,
game, event identities and sequence. It reads retained evidence, not current sight
or live custody. None of these checks or budgets changed.

The old unit fixture incorrectly fabricated a bare-ID, sequence-two probe. It now
uses `operationCustodyProbe` and a genuine sequence-one/zero-step probe followed by
a sequence-two terminal. Fifteen focused tests cover exact positive query/replay,
bare/foreign/double-prefixed IDs, wrong action/row/revision/command/witness/missing
receipt, wrong publication/operation/terminal source, and rejection of a custody
prefix on progress/transfer. Semantically invalid candidates with valid fixture
witnesses exercise identity checks independently of byte-tamper rejection. Upstream
authority/terminal mocks remain explicitly unit-fixture boundaries; native runs use
the real canonical validators.

The positive unit test failed before the runtime edit with the exact native error;
`test-results/corpus-navigation-probe-red.json` retains this targeted red run
(one failure, fourteen intentionally unselected tests). After repair: **217/217
affected units**, eleven files, 3.03s; **11/11 corpus units**, 1.81s; production,
navigation-fixture and corpus-fixture typechecks all PASS. Reports:
`test-results/corpus-navigation-repair-units.json` and
`test-results/corpus-navigation-repair-corpus-units.json`.

```powershell
$env:MAZE_CORPUS_NAVIGATION_RUN='corpus-navigation-custody-repaired'
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-corpus.navigation.config.ts
node node_modules/vitest/vitest.mjs run --config tests/e2e/canonical-corpus.navigation.unit.config.ts src/persistence/canonical/agentica/decision.query src/persistence/canonical/agentica/operation.probe.test.ts src/persistence/canonical/agentica/operation.records.test.ts src/persistence/canonical/agentica/operation.wire.test.ts src/persistence/canonical/agentica/decision.claim.test.ts src/persistence/canonical/agentica/decision.interaction.test.ts src/persistence/canonical/agentica/terminal.base --reporter=default --reporter=json --outputFile=test-results/corpus-navigation-repair-units.json
```

Native **2 PASS**, zero skips/retries/flaky cases, 62.001s, starting
`2026-10-23T01:33:16.947Z`; zero case 34.927s, nonzero case 24.227s. Raw evidence:
`test-results/corpus-navigation-custody-repaired/results.json`. Zero-step history
preserves the originally failing `custody-336dcc42-8d80-4d06-8d7c-2ed7538968ae`,
operation `travel-ddfddeed82f9224822904c76879495b6656b21ff2e232777bbc193029fda5e59`
and terminal attempt `eae56f47-88ee-47ef-92dc-92100a5be5d0`, without forced progress.
Its three historical replays after later sight use 36/38/37 reads,
79,112/65,903/65,091 bytes, zero writes, with exact full-DB equality in both worlds.
Missing/inconsistent source refusals and original root Stop/ACK pass in both cases.
Maximum result/observation/event sizes are **1523/1131/923 bytes**.

Step-zero work and output match exactly. At step six the same four 432/433-byte
connection reads persist: zero-first trajectory 29,688,731/29,688,735 bytes;
independent nonzero trajectory 14,139,822/14,139,826. No raw delta was removed or
normalized. Continuation/query work and actor output equality still pass; step-seven
ordinary sight differs lawfully. Storage-work repair remains parent-owned. Strict
5456 shut down and 5457 stayed unused. No production limits, SDK, service or native
assertions changed; no paid calls, push, parent edits or broader qualification.
