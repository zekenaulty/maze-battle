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

## Assertions

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

This is direct pinned-service/runtime API evidence, not browser/HTTP pairing or
mounted-controller qualification. The only synthetic inputs are the bounded
protocol request, admission and zero-move event. No model is called and no Maze
gameplay, new observation, wake, adoption, completion or terminal ACK is claimed.

The parent handshake must persist this sequence-1 event identity and exact body
before delivery, retry only that original event after `session.unresolved`, and
wait for its accepted response before movement. The first subsequent movement
event must use sequence 2. A parked inventory entry alone does not prove that
the separate action-custody settlement has finished.
