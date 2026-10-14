# Checked StopDecision Reconciliation

PASS on 2026-10-13, Windows, .NET SDK `10.0.401`. The two new groups cover
available and exhausted service execution budget. Each reaches the parked original
through its settled admission, seq1 custody probe and seq2 nonzero synthetic host
progress. The original seq3 arrival decision contains no objective completion.

## Exact Runtime and Invocation

Source: `C:/Users/Zythis/.codex/worktrees/maze-operation-stop/Agentica`, unchanged at
`d65fb5b7a5d4895921f8854054215b1d6279852e`. Existing Release DLLs are used directly;
Agentica was not rebuilt. Runner and executable verify the three hashes in
`pin.json` and loaded assembly informational versions. `Agentica.Lab.Web.dll`:
`11455a4d12ada5bf175d8bd080f5dc7e4946340541a6c75d00742f6ebdedee2b` (SHA-256).

From the Maze worktree root, run just this proof:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/agentica-service-custody-probe/run.ps1 -AgenticaRoot C:/Users/Zythis/.codex/worktrees/maze-operation-stop/Agentica -StopDecisionOnly
```

Omit `-StopDecisionOnly` for the complete suite. Both final invocations passed,
with zero build warnings/errors and exit zero.

## Checked Behavior

- Serialize the exact decision before calling public `HostRunRegistry.StopDecision`.
  Discard the accepted return value, then reopen every registry/store instance.
- Read-only inventory contains `state: cancelled`, with both `latestEvent` and
  `stopDecision` matching the original decision digest exactly. Its kind remains
  `decision`, completion remains absent, and original request/action/admission,
  active epoch and cumulative service usage remain unchanged.
- `wakeRunId`, `wakeAdoption` and `settledUsage` remain absent. No run is created.
  The new groups never call `Wake`; neither planner-factory entrypoint is invoked.
- Replay the exact `StopDecision`, restart again, and replay again. Each response
  matches the entire retained entry; every store file and fixture input remains
  byte-identical. Retry again after all negative checks to confirm no poisoning.
- Sixteen parameterized rejections assert exact errors and zero store changes:
  skipped sequence, non-decision kind, invented completion, changed summary,
  replacement ID, changed epoch, ordinary Apply replay, and relabeling the stopped
  identity as a cancelled event. The two variants exercise the same eight guards.

The original decision digest is
`sha256:1dfaf3f85911f86f88e475388f1a68fdfedc8959dfe38a7e90b9ab846acb0ca9`.
Pinned `Agentica.Lab.Web/Runtime/HostRunRegistry.cs:106-117` checks original custody
before StopDecision; `Runtime/HostOperationStore.cs:247-284` suppresses the original
without a successor and makes exact StopDecision replay idempotent. Ordinary
Apply is not a substitute replay path: it rejects the decision with
`operation.wake_transport`, or its relabeled stopped identity with `operation.stopped`.

## Retained Evidence

All paths below are relative to `test-results/agentica-service-custody/`:

| Scope | Evidence path | SHA-256 |
| --- | --- | --- |
| Focused PASS | `df85ca6104e7486995f5318a4e4646f2/evidence/proof.json` | `6e243bfb5898b65f59175116c590f7ee78ac7b48ffdcdb68140f682150aca601` |
| Full-suite PASS | `d6b2ae1becc1464b966f741592a183a1/evidence/proof.json` | `abe3998e3188baf662dfde28a37c1166632d02b3e13e222a0c32b697fc3c524b` |

Two earlier full runs compiled but failed on `UnauthorizedAccessException` from
atomic `File.Move(..., overwrite: true)`: `f0796ec493304df0b30b234ead362118` in
`HostOperationStore.Reserve` during the existing mismatched-admission case, and
`7c4238fb912248e2a7cd985b975f5c52` in `HostContextSession.RecordActionDispatch`
during new fixture setup. Their partial stores remain intact. No service fix,
retry wrapper or permission change was made; the filesystem failure cause is
uninvestigated. The later focused and full runs used fresh directories and passed.

## Limits

This proves the real pinned in-process registry's parked-decision suppression and
durable reopen/replay behavior with synthetic protocol inputs. Discarding a return
is not a process-kill or disk-failure injection. No server, HTTP/browser pairing,
mounted host, canonical reserve release, executing-wake cancellation, adoption,
actual game movement or provider execution is qualified.
