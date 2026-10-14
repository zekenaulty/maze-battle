# Pinned Service Custody Probe

Provider-free executable qualification of the real public
`HostRunRegistry.ApplyOperationEvent` API and its private `CheckAdmission` gate.
It references prebuilt Agentica assemblies, not copied service implementations or
ProjectReferences. `pin.json` checks the exact source commit and all three Agentica
DLL hashes before building, then the executable rechecks the assemblies it loaded.

## Invocation

From the Maze repository root, with .NET 10 installed:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/agentica-service-custody-probe/run.ps1 -AgenticaRoot C:/Users/Zythis/.codex/worktrees/maze-operation-stop/Agentica
```

The supplied checkout must be clean and at
`d65fb5b7a5d4895921f8854054215b1d6279852e`, with the exact pinned binaries in
`Agentica.Lab.Web/bin/Release/net10.0`. Its Debug DLL is not the pinned build.
The script never builds or edits Agentica. NuGet sources are cleared; only the
local .NET/ASP.NET reference packs and prebuilt assemblies are needed.
No existing fixture or service process is required.

Build output, isolated durable stores, and `evidence/proof.json` go to a new
`test-results/agentica-service-custody/<random-id>/` directory on every invocation.
Existing ledger directories are never reused or deleted.

## Admission Assertions

- Reserve the original action in both durable stores; `operations.Admit` retains
  its applied admission while action custody is still pending or explicitly unresolved.
- Submit one deterministic progress event, sequence 1, using the exact admission
  observation and zero movement. The real registry rejects with `session.unresolved`;
  every fixture store file is unchanged and no event is retained.
- `custody.Resolve` the exact original admission. The identical event now succeeds;
  repeat delivery returns the exact accepted entry without changing the operation ledger.
- The observation, active epoch, parked state and zero movement remain unchanged.
- A separately resolved but different original result still rejects with
  `operation.admission_unsettled`, without changing stores.
- No host run exists and neither planner creation nor provider discovery is invoked.
  Both planner-factory entrypoints throw if called; no network client is constructed.

The parent handshake must persist this sequence-1 event identity and exact body
before delivery, retry only that original event after `session.unresolved`, and
wait for its accepted response before movement. The first subsequent movement
event must use sequence 2. A parked inventory entry alone does not prove that
the separate action-custody settlement has finished.

## Terminal Assertions

`TerminalFixture.cs` creates isolated real stores/registry instances, admits and
settles the original, sends the sequence-1 handshake, then sends nonzero progress
at sequence 2 with a new observation. These are synthetic host protocol inputs,
not Maze engine movement. `TerminalProbe.cs` and `TerminalGuards.cs` assert:

- `completed`, `blocked` and `cancelled` at sequence 3, each with available and exhausted
  service cognition budgets; progress and terminal events never create a run.
- Exact progress and terminal replay retain the original response and operation
  ledger bytes. Older event replay, changed bodies under the same key, replacement
  terminal identities, post-terminal progress and wake attempts reject.
- Dropping the terminal return value and reopening all stores/registry retains
  the exact original terminal in read-only inventory. Its original event retries
  successfully. Later unresolved custody blocks retry, but not inventory; settling
  that unrelated original permits the same terminal to replay again.
- Wrong original host/session/action/operation, wrong active epoch, invalid
  sequence/observation/completion and non-object/oversized usage reject without
  changing any store file. A transfer retires the original epoch; cancellation
  binds the active epoch while preserving the original action/admission.
- Host usage is distinct from service cognitive usage. A deliberate negative
  host counter in an object is accepted by the service: this characterizes its
  structural-only check, not valid Maze evidence. The host must validate counters.

`CancellationFlushProbe.cs` covers retained probe/progress that either has not
reached the service or was delivered without a persisted local ACK. It confirms
the exact retained event, then cancels at the next sequence with no fixture ACK
write and no new progress. After a dropped terminal reply, inventory and exact
terminal retry succeed; re-flushing the old event instead fails `operation.event_stale`.
The persisted fixture delivery envelope stays byte-identical and unACKed throughout.
This demonstrates service compatibility, not the canonical host's Stop/ACK implementation.

Arrival at a known destination is a host `decision`, not objective completion.
The arrival probe asserts that the ordinary event API requires the wake path and
that relabeling arrival as `completed` without completion evidence rejects. It
does not call a successful wake or provider. The natural `completed` case supplies
synthetic objective proof only to qualify that protocol shape; Maze should emit it
only after actual objective proof, never from arrival alone.

See [checked terminal evidence and host requirements](TERMINAL-PROOF.md) for exact
source lines, output identity, observed codes and limits. The original admission
proof remains in [PROOF.md](PROOF.md).

This is direct pinned-service/runtime API evidence, not browser/HTTP pairing or
mounted-controller qualification. No model, real gameplay, running wake/adoption,
wire authentication or canonical local reserve-release/ACK transaction is tested.
