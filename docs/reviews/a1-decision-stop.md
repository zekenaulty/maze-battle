# A1: Durable Stop Of A Pending Decision

2026-10-12. Provider-free actual-game integration. A1 remains PARTIAL and the
goal is active. Subsequent [decision adoption qualification](a1-decision-adoption.md)
repairs the continuation gate described here; this report preserves its historical
evidence. This closes the restart cancellation failure recorded in the
[controller report](a1-rpg-controller.md); it does not qualify new-owner decision
continuation, frontier exploration, quest collection or the two-dungeon corpus.

## Change

Agentica review branch `codex/maze-operation-stop`, source
`6d8db3b68a3851c9118adb6e05010921b850138b`, adds
`POST /api/operations/stop-decision` and the SDK's explicit `stopDecision` method.
The request is the exact original immutable decision. It is never rewritten as
a cancellation event, delivered as a wake, or given a replacement sequence.

The ledger retains the decision as cancellation source, preserves original
admission, prior events, usage and any existing wake identity, and reports
`cancelled`. A never-delivered decision reserves no successor. Exact Stop retries
return the same durable record. Changed source, wrong binding/sequence, completed
work, unresolved custody and an already-admitted child fail closed. A stopped
decision cannot wake. Old entries omit the new optional field and retain their
original hashes and meaning.

The ordinary-game controller stops local effects before service reconciliation.
It verifies both returned decision identities before acknowledging its outbox and
the retained launch. A missing process-local run is no longer a dependency. If
the service reports an existing live window, only the exact locally announced
and attached successor can receive run cancellation; that acknowledgement alone
does not settle the parent's durable Stop. A still-busy or uncertain result stays
unacknowledged for explicit reconciliation, never automatic cognition or effects.

No save schema, world, inventory, movement, interaction, Auto policy or grants
were replaced. The vendored SDK is identical to upstream blob
`457f959f396ff8488232070c88a99c71da6815ed`. This extension is on a separate
Agentica review branch, not claimed as merged/released.

## Evidence

- Agentica Lab Web suite: 159 PASS, including 30 new decision-stop cases and 21
  existing operation cases. The new cases cover undelivered/claimed decisions,
  reload, exact duplicate, mutations, old ledgers, terminal and admitted-child
  refusal, live-window refusal and unchanged custody with no additional planner.
- SDK custody/recovery/operation suites: 89 PASS, including six new Stop cases.
- Actual browser + real .NET service + loopback fixture planner: 10 PASS. The
  former pending-decision restart failure now passes. An added fault sends Stop
  to the service but drops its reply, restarts browser/GameSession and service,
  then retries the identical request. Position, inventory, decision and planner
  count remain unchanged; no wake identity is created.
- Native actual-IDB controller suite: 14 PASS. Its announced-but-unbound successor
  regression caught the need to stop a live window separately. The fixture now
  correctly treats a claimed wake as `waking`, not `continued` before admission.
- Controller/UI/directed unit suite: 228 PASS, including eight new decision-stop checks.
- Known-destination regression selection: 15 PASS. TypeScript and production
  build PASS, 2,122 modules; the existing main-chunk warning remains (524.12 kB).

Independent review caught a legacy cross-entry contradiction: a `waking` parent
could already have an admitted child from the old non-atomic write path. Stop
and ledger replay now check child lineage, not only the parent's projected state.
New reservations/admissions from a stopped claimed window are fenced too. Four
regressions cover these paths; the original failing fixture setup was corrected
for JSON timestamp escaping, while the actual unchanged-ledger-byte checks remain.

The paired test still includes a successful known-route and intermediate-decision
case, completion replay, ownership adoption for running travel, and refusal of
new-owner decision continuation. Refusal is safety evidence, not continuation.
The bounded fixture planner is not a paid model or a quality/latency benchmark.

Commands use the new isolated service checkout as `AGENTICA_FIXTURE_SOURCE`,
`scripts/rpg-paired-host.mjs` pins its source revision, and isolated test ports
remain 5092/5093/5212. The service was freshly built using installed SDK 10.0.401
from outside the checkout; the repository's unchanged global.json pins 10.0.302.
This is not qualification under the pinned SDK. Initial restore emitted a nested
NuGet SDK-pin warning; no-restore compilation, tests and publish succeeded.

Fresh Release fixture SHA-256:

- `Agentica.Lab.Web.FixtureHost.dll`:
  `05c854dc206a1fffb1af0d6e5a64e7dc01b6a033868336af660406cd49f97fbe`
- `Agentica.Lab.Web.dll`:
  `81e7f87a17f296562867e40fd4d6215e6353dd4712b51c663c4bccb9093a49a3`

## Remaining

Explicitly continuing an old pending decision under new host custody still needs
a separate bounded contract. Preserve the original wire receipt and its epoch;
do not substitute a new grant, synthetic decision or model activation to bypass
that check. Once qualified, continue A2 earned-frontier exploration, A3 explicit
ordinary quest collection/return, then Q's two-dungeon qualification. Paid model
testing still requires separately confirmed limits and authorization.
