# Agentica browser host SDK

Vendored without edits from `zekenaulty/Agentica` commit
`6d8db3b68a3851c9118adb6e05010921b850138b` on `codex/maze-operation-stop`:
`Agentica.Lab.Web/wwwroot/sdk/agentica-host.mjs`.

SDK Git blob: `457f959f396ff8488232070c88a99c71da6815ed`.
This revision adds explicit `stopDecision` without cognition activation to the
prior durable admission, operation inventory/events and semantic wake API.
The prior baseline was `1e1a2df`, contained in Agentica main merge `977d0ca`.
The decision-stop extension is a separate review branch, not yet a main release.

This dependency-free SDK owns transport, original-attempt custody callbacks and
reconciliation. Maze Battle supplies its own IndexedDB hooks and legal command
implementation. Local declarations describe the public surface consumed here;
the upstream module remains the runtime source of truth.

No provider credentials, automatic live-provider selection or service-specific
world logic are included. The first integration uses only the explicit loopback
fixture host. Update this provenance when refreshing the vendor file.
