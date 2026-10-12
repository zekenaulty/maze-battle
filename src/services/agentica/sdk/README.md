# Agentica browser host SDK

Vendored without edits from `zekenaulty/Agentica` commit
`d65fb5b7a5d4895921f8854054215b1d6279852e` on `codex/maze-decision-adoption`:
`Agentica.Lab.Web/wwwroot/sdk/agentica-host.mjs`.

SDK Git blob: `e192c1130f88cd43dccfe541eab3c8d2f5499ae8`.
This revision adds explicit `adoptDecision`: a separate new-custody checkpoint
alongside the immutable old decision, with one atomically claimed successor.
The prior `6d8db3b` revision adds `stopDecision` without cognition activation to
the durable admission, operation inventory/events and semantic wake API.
The prior baseline was `1e1a2df`, contained in Agentica main merge `977d0ca`.
These extensions are on separate review branches, not claimed as main releases.

This dependency-free SDK owns transport, original-attempt custody callbacks and
reconciliation. Maze Battle supplies its own IndexedDB hooks and legal command
implementation. Local declarations describe the public surface consumed here;
the upstream module remains the runtime source of truth.

No provider credentials, automatic live-provider selection or service-specific
world logic are included. The first integration uses only the explicit loopback
fixture host. Update this provenance when refreshing the vendor file.
