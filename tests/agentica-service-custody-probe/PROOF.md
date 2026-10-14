# Checked Custody Handshake Evidence

PASS on 2026-10-13, Windows, probe compiled with local .NET SDK `10.0.401`.
Agentica was not rebuilt. Its checkout remained clean at
`d65fb5b7a5d4895921f8854054215b1d6279852e`.

## Exact Runtime

Source: `C:/Users/Zythis/.codex/worktrees/maze-operation-stop/Agentica`.
Consumed binaries: `Agentica.Lab.Web/bin/Release/net10.0/`.
Both the runner and executable verified the hashes, and the loaded assemblies'
informational versions all contain the full source pin.

| Assembly | SHA-256 |
| --- | --- |
| Agentica.Lab.Web.dll | `11455a4d12ada5bf175d8bd080f5dc7e4946340541a6c75d00742f6ebdedee2b` |
| Agentica.dll | `e82a68e9716d5b87462172f548a83123afb78972010492babde68610d11171ce` |
| Agentica.Clients.dll | `716f1f1cbda7022203c678b5c38123c3aef9b0481bdf090c63526c67d8f49b26` |

## Executed Command

Working directory: `C:/Users/Zythis/.codex/worktrees/canonical-town-party/maze-battle`.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/agentica-service-custody-probe/run.ps1 -AgenticaRoot C:/Users/Zythis/.codex/worktrees/maze-operation-stop/Agentica
```

Build: zero warnings/errors. Exit code: zero.

| Case | Observed result |
| --- | --- |
| Parked admission, original custody pending without result | `session.unresolved`; all durable store files unchanged |
| Parked admission, original custody explicitly unresolved | `session.unresolved`; all durable store files unchanged |
| Resolve exact admission, redeliver identical sequence-1 probe | Accepted in both cases; still parked, same epoch/observation, zero movement |
| Repeat exact accepted event | Identical response; operation ledger bytes unchanged |
| Resolve different admission summary | `operation.admission_unsettled`; durable stores unchanged |
| Cognition/transport | Zero runs, planner creation, provider discovery and model calls; no HTTP/socket/browser |

The exact same deterministic event digest was used before/after resolution and on replay:
`sha256:623fdd1c59ea6753a28ca44d56079af056a732dc862de0dddf9cb305e3d76918`.
The settled original admission digest was
`sha256:41aaab890c034596f7bd7f9ad3133f8a88e878bdf73e628fa8abdc9cc1821f81`.

Generated evidence is retained locally at
`test-results/agentica-service-custody/034f32eb4694458ea07dddf0d809aca5/evidence/proof.json`,
SHA-256 `66700ee01a5bc358d2d22fa6d94af673e60b242148ffd293152bafe1595d1f08`.
Fresh invocations use a new output directory and print its proof path.

This qualifies the real pinned registry's admission gate with synthetic bounded
protocol inputs. It does not qualify the parent's mounted queue/transport,
browser-to-service pairing, authentication, provider execution, or gameplay.
