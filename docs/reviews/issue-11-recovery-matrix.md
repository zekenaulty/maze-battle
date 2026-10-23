# Issue 11: Bounded S3 Recovery Reconciliation

2026-10-23. Read-only audit of `260d49709771c079bc118a97087087284399dc6f`.
No new runtime changes, test runs, service starts, providers or parent edits.

## Conclusion

**No additional missing cut in the declared S3 matrix was found.** The plan's
finite gate at `docs/canonical-persistence-plan.md:661-673` requires collective
coverage, not every fault at every position. The eight new actual-App cuts,
existing takeover/duplicate proofs, and capacity/funded-cleanup evidence cover
that gate at the levels below. This reconciliation is not a fresh full-candidate
PASS, qualification of the in-flight capacity repair, or completion of issue 11.

## Retained Evidence

Artifacts below are in the parent's
`C:/Users/Zythis/.codex/worktrees/dungeon-d0/maze-battle/test-results/`.
The audit read the JSON results/provenance and selected inline raw proof
attachments; it did not regenerate or normalize stored evidence.

| ID | Candidate and retained result | Level |
| --- | --- | --- |
| R6 | `813a9ba`; `maze-start-service-772PSO/`: 6 PASS, 831.856s | Actual App, native IndexedDB, real offline-planner service |
| R4 | `33bd239`; `maze-start-service-bLARhm/`: 4 PASS, 389.546s | Same level; two accepted-loss cases overlap R6 |
| R48 | `bbdadf1`; `maze-start-service-Wl7MZr/`: 48 PASS, 2459.005s | Actual-App and native contract fixtures, labeled separately below |
| K | `canonical/results.json`: 177 PASS, 2026-10-14, 137.575s | Earlier native storage/domain suite, not a fresh `260d497` run |

All four result files report zero unexpected, flaky or skipped tests. R6 + R4
therefore establish **8 distinct cuts, not 10**. R48 also overlaps the active
pair; its count is not additive. The three service runs retain clean Agentica
source `27cb2ce9717438edfe19487e3920faa183112c97`, but use .NET **10.0.401**,
not the unavailable 10.0.302 pin. Zero-paid evidence is by construction from
injected offline planners, not billing telemetry.

The R4-to-`260d497` diff changes docs and capacity tests/support only, not runtime
or service fixtures. R6 predates the retained-completion recovery repair tested
by R4; R48 predates both that repair and pre-ACK resume. These are incremental
proofs, not one current combined run. Raw source hashes remain in attachments;
checkout LF/CRLF differences are not gameplay changes.

## Matrix

Paths in this table are under `tests/e2e/`. Line numbers refer to `260d497`.

| Required invariant | Evidence and source | Boundary / remaining claim |
| --- | --- | --- |
| Unfinished outbound and return resume (2 cuts) | R6 and R48; `canonical-start-service.active-journey.spec.ts:12`, final outcome at 131, replay at 146. One committed step, reload/new owner, explicit Resume and later Continue; original action/limits survive, 22-step outward and 24-step return, one collection, 32 retained replays. | Actual App. These two cuts are after progress ACK; they are not credited as pre-ACK proof. |
| Accepted interaction progress and completion confirmation lost (2 cuts) | R6 and R4; `canonical-start-service.corpus-delivery.spec.ts:70` verifies real HTTP 200 or withheld `action.accepted`/successful outcome; reload/effect comparison at 89, replay/cleanup at 119. | Acceptance is observed independently before withholding from the App. Collection remains once; local satisfaction is not inferred from arbitrary outcome text. |
| Unaccepted committed interaction progress and completion result (2 cuts) | R4; `canonical-start-service.corpus-preacceptance.spec.ts:69` proves the selected progress was not dispatched or the completion result/acceptance absent from wire. Original completion goes through HTTP recovery at 118; original root identity, ACK source and unchanged game state at 137; replay at 166. | Actual App. Final stopped/interrupted root is cleanup, not a fabricated successful workflow. This is the retained successor objective-result path, not arbitrary pending effects or initial-grant completion. |
| Committed navigation step before progress ACK (1 cut) | R6; `canonical-start-service.corpus-preack.spec.ts:28-54`, `:96-100`. One real step with no local progress ACK and no dispatched event; inspection is inert; Resume delivers the exact predecessor once before transfer and completes the original 22-step route. | Original 64-step / 4-replan / 120000ms limits, start/deadline and root grant remain; no replacement start/wake/cognition. |
| Accepted transfer ACK lost (1 cut) | R6; same spec `:57-78`, `:101-110`. Real HTTP 200 retained, local ACK/authority absent; second reload, exact original transfer request and reply, then newer-epoch transfer chained to it. | Explicit reconcile/resume, original action and cumulative progress. Neither the held reply nor inspection grants movement. |
| Takeover fencing and explicit adoption | R48 `canonical-start-service.transfer.spec.ts:29-75`: real service, new owner/epoch, ACK before both kernel adoption receipts, authority before one movement, original run/grant retained and planner counters unchanged. K `canonical-core.spec.ts:63` rejects a fresh old-owner writer but returns the original committed receipt. | Transfer case is a native contract fixture, not mounted App. Actual-App new-owner resume is supplied by R6; concurrent active two-tab endurance remains S5. |
| Exact duplicates do not repeat effects; changed duplicates refuse | R4 retained-hook replays preserve sources/head; R6 pre-ACK replay has zero fresh submissions (`corpus-preack.spec.ts:113`). R48 `canonical-start-service.decision-pending-replay.spec.ts:17-55` repeats exact HTTP recovery before/after a real service restart and after ACK; five changed-body attempts refuse with 409 both before and after restart. K `canonical-operations.spec.ts:49` repeats admission/cancel/ACK with identical receipts and store dump. | Original result replay, not permission to issue a fresh action. The HTTP restart case is a proven no-effect pending result; it is not every effect/process-crash combination. |
| Capacity refusal and atomic failure | R48 four A/B before/after-collection cases, `canonical-start-service.corpus-recovery.spec.ts:28-48`: ordinary quota refusal/reload preserves game evidence. K `canonical-operation-failures.spec.ts:3-39` injects IDB quota errors at operation/receipt/head writes for admission/settlement/ACK and compares the entire dump; insufficient admission also rolls back. | App fixture sets the logical quota boundary; it does not fill physical browser disk. Earlier native injection is transaction-abort evidence, not OS power-loss or capacity-noninterference proof. |
| Funded Stop and verified child/root ACK | R48 `corpus-recovery.spec.ts:56-99`: original operation/root IDs and admission, exact terminal and ACK sources, unchanged world/knowledge/checkpoint/items, fixed limits, zero reservations, no new action/wake/cognition. R6 `corpus-preack.spec.ts:123-149` and R4 `corpus-preacceptance.spec.ts:131-173` discharge both funded allocations and retain exact replay. K `canonical-operations.spec.ts:25-75` covers funded settlement/ACK and Stop/takeover cleanup after ordinary writes fill capacity. | Local Stop is not remote clearance. The tests wait for verified ACKs before claiming release; neither a terminal navigation/root nor these cases clear arbitrary other remote actions. |

Selected raw checks corroborate the assertions: the six distinct delivery/pre-ACK
scenarios in R6/R4 end with the selected operation and root acknowledged, empty
allocations and zero paid calls; both pre-ACK routes end at 22 steps. R48's duplicate-recovery
proof records an actual process-ID change, exact retained result, and the ten
409 refusals; its transfer counter attachment is unchanged after takeover work.

Runtime anchors are the ACK-only predecessor port in
`src/services/agentica/game/playActiveNavigation.ts:90`, the gated pending-result
recovery in `src/services/agentica/game/pendingActionRecovery.ts:65`, and the
original claim/grant/source/fence proof in
`src/persistence/canonical/agentica/completion-recovery.proof.ts:18`.
None introduces a new start, fresh effect or substituted completion evidence.

## Limits And Handoff

- No new S3 runtime feature or fault cohort is needed by this reconciliation.
  Older reports' open pre-ACK/pre-acceptance items are superseded by R6/R4.
- **S4 remains open/FAIL at this base:** the private-world quota disclosure and
  command-work boundary are separate from successful funded cleanup. Pure
  capacity helpers are not runtime qualification. Any integrated accounting
  change must preserve these recovery invariants and receive affected checks.
- **S5 remains open:** generated depth/history/paged-graph and active two-tab
  endurance are not supplied by these finite authored-room cuts.
- **S6 remains open:** full frozen-candidate regression and source/runtime
  qualification after integration. This audit is not that run.
- R6's setup service restarts isolate the two-root fixture policy before genesis;
  they do not prove a crash during work. R48's explicit recovery restart does.
  Failed `maze-start-service-0vmkqv/` (fixture root allowance) and interrupted
  `maze-start-service-zIayhS/` (overbroad outcome guard) remain retained; no timeout
  increase or production repair was credited for those fixture corrections.

Supporting reports: [active integration](issue-11-active-recovery-integration.md),
[pre-ACK integration](issue-11-preack-capacity-integration.md),
[pre-acceptance integration](issue-11-preacceptance-integration.md), and
[original native reservation boundary](issue-11-operation-capacity.md).
