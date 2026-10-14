# Checked Terminal and Cancel Evidence

Initial terminal proof: PASS on 2026-10-13, Windows, .NET SDK `10.0.401`. Six new scenario groups
extend the three original admission groups. The four terminal lifecycle groups
contain 108 negative checks; the active-epoch group adds two. Each of these 110
rejections asserts the exact error code and unchanged hashes for every store file.
These are parameterized protocol probes, not 110 distinct integration workflows.

## Runtime and Invocation

Agentica source and all three prebuilt Release assemblies remain at
`d65fb5b7a5d4895921f8854054215b1d6279852e`. Both the runner and executable checked
the source pin, assembly informational versions and hashes in `pin.json`.
`Agentica.Lab.Web.dll` SHA-256:
`11455a4d12ada5bf175d8bd080f5dc7e4946340541a6c75d00742f6ebdedee2b`.
The other two hashes and original admission evidence are in [PROOF.md](PROOF.md).
Agentica was neither edited nor rebuilt; its checkout remained clean.

From `C:/Users/Zythis/.codex/worktrees/canonical-town-party/maze-battle`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/agentica-service-custody-probe/run.ps1 -AgenticaRoot C:/Users/Zythis/.codex/worktrees/maze-operation-stop/Agentica
```

Build: zero warnings/errors. Exit: zero. No service process or network call.
Generated evidence:
`test-results/agentica-service-custody/cabb1f90dd944e8a81590eedf5829eda/evidence/proof.json`.
SHA-256: `c6f3d220075a971618325ddf8ccf0b84a0c8a021378f2d9ad2999696bfa64f00`.
The initial run stopped on a fixture-only invalid `rejected` disposition; it was
corrected to the pinned `refused` result with its exact observation before this pass.

## Observed Matrix

| Probe | Result |
| --- | --- |
| Exact settled original, seq1 handshake, seq2 progress | Accepted; fresh observation reports column 1 and one host step; parked, no run |
| Seq3 completed, available/exhausted cognition budget | Accepted; separate completion evidence binds original objective |
| Seq3 cancelled, available/exhausted cognition budget | Accepted without completion; no objective-completion claim |
| Exact latest progress/terminal replay | Identical retained entry; operation ledger bytes unchanged |
| Terminal reply discarded, all registry/store instances reopened | Inventory retains exact original action, admission and terminal; exact retry succeeds |
| Later unresolved custody after terminal | Retry rejects `session.unresolved`; read-only inventory still retains exact terminal; same retry succeeds after settlement |
| Old seq1/seq2 after terminal | `operation.event_stale`; no effects or writes |
| Same terminal key, changed summary/usage/epoch | `operation.event_changed`; no writes |
| Replacement terminal identity or later progress | `operation.not_parked`; no writes |
| Wrong host/session/action | `operation.not_found`; no writes |
| Wrong operation/active epoch | `operation.event_binding`; no writes |
| Wrong sequence/observation/completion | Respective protocol errors; no writes |
| Scalar, array, >8192-byte usage | `operation.usage`; no writes |
| Structurally valid `{steps:-7}` | Accepted as opaque host usage; service cognitive usage unchanged; host validation required |
| Transfer then cancellation | Original epoch refused; current epoch accepted; original action remains in its original epoch |
| Decision on ordinary event API / terminal on wake API | `operation.wake_transport` / `operation.wake_kind` |
| Decision wake after terminal | `operation.not_parked` with available budget; `operation.budget` when exhausted |

Every group asserts zero runs, planner creations and provider discoveries. The
planner factory throws at either entrypoint. No run is created or started.

## Source-Grounded Host Requirements

All line references below refer to the exact pinned Agentica source, under
`C:/Users/Zythis/.codex/worktrees/maze-operation-stop/Agentica/Agentica.Lab.Web/`.

1. Retain and retry the same terminal identity/body. `Runtime/HostOperationStore.cs`
   lines 203-225 only replay the exact latest event; old events are not ACKed by
   returning a newer terminal, and changed payloads cannot borrow its key.
2. Lost-response reconciliation must compare the original action/admission,
   operation, active epoch and entire terminal event, not just `state` or sequence.
   `Runtime/HostRunRegistry.cs` lines 42-59 expose inventory and apply; lines 121-128
   recheck admission custody even for exact replay. Inventory remains available
   during later unresolved custody. It proves retention, not fresh execution authority.
3. Completion must bind the original objective and use evidence distinct from
   admission. Cancellation carries no completion. `Runtime/HostOperationStore.cs`
   lines 339-348 enforce this. The same latest observation can be reused unchanged;
   terminal delivery need not invent a fresh position or observation.
4. Host event usage must be validated against canonical host counters before
   submission/ACK. `Runtime/HostOperationStore.cs` lines 454-457 only check object
   shape and an 8192-byte bound. `HostRunUsage` is separate cognitive accounting;
   transition at lines 353-358 does not replace it from event usage.
5. Terminal/progress is not a cognitive wake. `Runtime/HostRunRegistry.cs` lines
   47-48 and 64-85 distinguish these paths; exhausted cognition allowance does not
   prevent parked progress or terminal delivery. `Runtime/HostOperationStore.cs`
   lines 311-320 still require the original operation, active epoch and next sequence.

Source-only additional boundary: registry lines 53-54 refuse cancellation while
a claimed live wake is nonterminal (`session.busy`). This probe does not claim to
qualify stopping or reconciling an executing wake, adoption, or StopDecision.
The later [StopDecision proof](STOP-DECISION-PROOF.md) closes only the parked,
never-woken decision-suppression gap; executing wake/adoption remains outside scope.

## Limits

Actual pinned registry/store implementations accept the synthetic nonzero
progress and terminal inputs; no service implementation is copied or mocked.
Reopening instances models durable reload after a successful write with its reply
discarded, not process-kill timing or disk-write failure injection. No Maze engine
step, canonical local ACK/reserve release, browser pairing, HTTP/authentication,
mounted driver, running model or live-provider behavior is qualified.

The isolated branch's preexisting probe folder matched parent `fb118a1` exactly.
No merge of unrelated parent changes was needed; only this test folder changed.

## Stop and UnACKed Delivery Follow-Up

PASS on 2026-10-13, using the same invocation, pinned source and binaries above.
Build: zero warnings/errors; exit zero. The full rerun adds seven scenario groups:
blocked terminal with available/exhausted budget, four cancellation-flush cases,
and arrival as a decision. All original admission/terminal groups still pass.
The terminal/epoch/flush/arrival groups now contain 176 parameterized rejection
checks, each asserting exact protocol code and no durable file changes.

| Retained event at Stop | Before Stop | Flush and cancellation |
| --- | --- | --- |
| Seq1 custody probe | Not yet delivered | Exact seq1 accepted, cancelled seq2 accepted |
| Seq1 custody probe | Delivered, response lost/no local ACK | Exact seq1 replayed, cancelled seq2 accepted |
| Seq2 progress | Not yet delivered | Exact seq2 accepted, cancelled seq3 accepted |
| Seq2 progress | Delivered, response lost/no local ACK | Exact seq2 replayed, cancelled seq3 accepted |

All four cases run with exhausted cognitive allowance. A serialized fixture
envelope retains the original pending event and cancellation, with ordinary ACK
absent. It stays byte-identical through delivery, cancellation and restart. No
additional progress is submitted; cancellation reuses exactly the retained event's
observation and usage and carries no completion. This shows that service acceptance
does not require an ordinary local ACK write. It does not exercise the real Maze
funded transaction, immediate local Stop fence or disk-quota failure path.

Before the retained event reaches the service, sending its successor cancellation
fails `operation.sequence`. Once cancellation is accepted and its reply is lost,
reopened inventory exposes that exact terminal. Retrying the terminal twice returns
the same entry without changing the operation ledger. Re-flushing the old pending
event at that point fails `operation.event_stale`. The host must compare the exact
retained terminal with `latestEvent` and recover that terminal, not blindly restart
the pre-terminal flush. This follows pinned `HostOperationStore.cs` lines 217-225
and 318-320 and is exercised through the real registry API.

Arrival is explicitly a host `decision`, not proof of the original objective.
Ordinary Apply rejects it with `operation.wake_transport`; relabeling it as
`completed` without completion evidence rejects with `operation.completion`.
No successful wake is invoked. The natural completed test uses a synthetic
objective-proof claim only; it does not justify a host completion on arrival.
Blocked/cancelled terminal cases reject completion claims and remain non-waking.

Latest evidence:
`test-results/agentica-service-custody/a87bddd32c6d40f69fe61c3da1b58d30/evidence/proof.json`.
SHA-256: `82a777bc07925d6eb42f957580852c1e73d464d702426e50004f895e2d36ebd0`.
The first follow-up build caught a nullable usage comparison in the new probe;
explicit non-null pattern checks repaired it before the passing run.
No Agentica edits, server, provider, browser, preview or mounted-host proof.
