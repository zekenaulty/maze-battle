# Explicit Content Interaction Operations

Issue [#11](https://github.com/zekenaulty/maze-battle/issues/11), 2026-10-18.
Runtime candidate `21319cf`; integrated native fixture candidate `aba8411`.
This is a checked host-owned execution prerequisite, **not a mounted Agentica
interaction tool or full quest qualification**. The umbrella goal remains active.

## Delivered

`canonical/interaction` binds one exact shared content command and the actor's
current position. It uses the same canonical transaction, funded operation ledger,
world records, inventory and quest records as the actual game. There is no second
inventory, save format, loot generator or movement routine.

1. Admission reserves cleanup capacity and records sequence zero. It does not
   accept a quest, open a chest, claim a reward, move or refresh observations.
2. `interaction.apply` consumes the pending operation once. It invokes the existing
   `commitContentCommand` for explicit acceptance, chest opening or reward claim.
   Effect, progress, post-effect sight where appropriate, and host evidence commit
   atomically. An unchanged result also consumes the operation.
3. Settlement is effect-free and yields a **decision**, not objective completion.
   A changed actor position blocks the original action; it does not pathfind back.
   Opening a chest from town is unavailable. All other content eligibility remains
   in the shared game command rather than an adapter-specific copy.
4. Exact originals replay without new writes, random rolls or payments. A second
   fresh application refuses. Cancellation after application retains the committed
   outcome; it never reports that an already-applied effect did not happen.

The existing transaction-restricted navigation host view is now a shared typed
operation host. It preserves bounded append-only evidence, exact references,
closed views, and poisoned transactions after caught/unawaited failures. Hooks
cannot read hidden world records through the knowledge reader or overwrite either
navigation or interaction progress. Navigation keeps its existing typed facade.

Verified-host operations require host hooks at admission, application and
settlement; generic ACK cannot discharge them. These hooks are trusted host code,
**not proof that Agentica custody is implemented for this operation yet**. The
future adapter must validate disclosure, grant, original publication and service
confirmation. Pending interaction transfer currently refuses even after generic
kernel adoption; it needs its own explicit proof before being supported.

## Evidence

The new native fixture uses generated ordinary fetch content, actual shared loot
and inventory commands, and browser IndexedDB. Test-only placement/acceptance
prepares a current-tile target. It does not claim agent discovery or authorization
of that target, nor traverse the full return journey.

- New binding/progress and source-proof unit tests: 48 PASS. Source proofs use the
  real writer, loader and receipt validator with doubled storage only.
- Integrated interaction browser cohort: 16 PASS, no retries/skips, including
  exact reload/retry, concurrent fresh attempts, one quest award/payment, moved
  position, Stop/takeover, unsupported transfer, hook failure, item/quota rollback,
  cancellation after effect, and funded settlement/ACK at ordinary quota.
- Navigation regression: 56 PASS; frontier regression: 33 PASS; Agentica
  navigation admission/proof regression: 24 PASS. These are native browser
  fixtures, not new browser-to-service or live-model runs.
- Production build and production/interaction-fixture TypeScript checks: PASS.
  Existing chunk-size warning remains (749.56 kB JS / 228.92 kB gzip).
- Full unit qualification: 3,815 PASS / one existing optional digest-assembly
  comparison SKIP across 237 files, 263.07 seconds, with two workers. The native
  final interaction/proof cohorts used `aba8411`; source remained unchanged.

Evidence paths under the integration checkout:

| Scope | Evidence |
| --- | --- |
| Interaction, final combined candidate | `test-results/canonical-interaction-final/results.json` |
| Navigation | `test-results/interaction-navigation/results.json` |
| Frontier | `test-results/interaction-frontier/results.json` |
| Existing Agentica navigation proof | `test-results/interaction-agentica-navigation/results.json` |
| Initial full units | `test-results/interaction-unit-qualified.json` |
| Focused long-test triage | `test-results/interaction-unit-timeout-triage.json` |
| Full units, two workers | `test-results/interaction-unit-final.json` |

The user preview at port 5198 is left running. No user database reset, provider
call, Agentica checkout change, capability expansion or message-budget increase.

## Review And Failure History

An independent review found that a valid-looking application receipt could precede
admission, change the original custody, or carry unsupported input fields. One
bounded admission-receipt read now enforces chronology and original owner/epoch;
application inputs have exact fields. Twenty-one regression cases cover these
and related source/witness tampering. A second review found no additional material
runtime defects in this bounded implementation.

The initial isolated browser run failed all 14 cases during teardown because its
network guard rejected Vite's own fixture WebSocket. Only the exact loopback
fixture WebSocket origin was allowed; other origins remain blocked. The next run
passed 14/14, then the strengthened race/hook run passed 15/15. Those original
reports/traces remain in the `navigation-recovery-ui` worktree under
`test-results/canonical-interaction-run{1,2,3}`. No runtime assertion was weakened.
The added funded-settlement case passed independently and in the combined cohort.

The first full unit run had 3,813 PASS, two failures and one optional skip. The
two existing simulation cases exceeded their 60-second limits (68.84 and 63.18
seconds) while other browser/build work was running. Their JSON failure messages
are generic `STACK_TRACE_ERROR`, so contention is an inference, not a diagnosed
runtime defect. This failed run is retained separately, not relabeled as passing.
The focused one-worker rerun passed all 16 cases across those two files in
55.73 seconds, with the formerly failing cases taking 25.03 and 21.38 seconds.
No source, seed, assertion or timeout changed for that rerun.
The final complete two-worker run then passed with no competing browser tests
and no changes to the simulation assertions or timeouts.

## Next Boundary

1. Bind a distinct `maze.interact` action to current, disclosed target evidence;
   extend operation binding, event, terminal, recovery and decision dispatch with
   an interaction discriminant. Do not disguise it as navigation or fabricate
   movement counters. Confirm parked service custody before application.
2. Sanitize the result and publish a fresh post-commit context for continuation.
   Raw internal quest and item IDs encode hidden room identity; they must not
   enter provider observations or pagination handles. Do not reuse the old
   publication after content mutation or manufacture a new sight receipt for
   acceptance/claim when sight did not change.
3. Define shared Guild disclosure intentionally. Manual offers are currently
   town-only; Auto's remote board access is an explicit automation policy, not
   inherited permission for Agentica. A bounded offer is a Guild report, not
   observed geometry or permission to navigate to an unseen target.
4. Measure the expanded manifest and nested proofs before exposing another tool.
   The present four-tool launch is already near its 3,072-byte bound; do not
   silently relax validation or remove existing tool semantics to fit a test.
5. Prove the complete current-sight interaction, service ACK, fresh decision,
   host-proven return and interrupted recovery through the actual App. Then run
   the required depth/revisit/multi-controller and two-dungeon Q corpus. This
   native prerequisite does not close those remaining acceptance claims.
