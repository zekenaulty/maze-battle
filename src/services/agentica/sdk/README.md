# Agentica browser host SDK

Vendored without edits from `zekenaulty/Agentica` commit
`602f15ac24a60faee8665cb165cb2d7c761c9eed` on `codex/maze-start-admission`:
`Agentica.Lab.Web/wwwroot/sdk/agentica-host.mjs`.

SDK Git blob: `1e413916aa079a71e84b82b53cb88fb701f15079`.
SHA-256 of the committed UTF-8/LF bytes (51,894 bytes):
`46d88c25bda57ee1371fc05209445f321dd3183e52f71a12abce221094a5a9dd`.
The runtime is copied from the committed blob, not the CRLF upstream checkout.
The fidelity test permits only Git's CRLF checkout conversion before hashing.

This revision adds `startDurable`, `getStart`, and `stopStart`, including the
typed .NET default/null echo comparison. An uncertain submission is reconciled
by its original attempt key, never automatically retried. Lookup alone does not
register an executable run. Stop fences local effects before HTTP completes;
`terminal: null` still means unsettled even when `stopRequested` is true.
Service digest fields are format-checked, not cryptographically recomputed by
this SDK. A manifest digest binds capabilities only, not the full start request.

The prior `d65fb5b7` revision adds explicit `adoptDecision`: a separate new-custody
checkpoint alongside the immutable old decision, with one atomically claimed
successor. The earlier `6d8db3b` revision adds `stopDecision` without cognition
activation to the durable admission, operation inventory/events and wake API.
The prior baseline was `1e1a2df`, contained in Agentica main merge `977d0ca`.
These extensions are on separate review branches, not claimed as main releases.

This dependency-free SDK owns transport, original-attempt custody callbacks and
reconciliation. Maze Battle supplies its own IndexedDB hooks and legal command
implementation. Local declarations preserve Maze's richer operation return
types and narrow legacy launch input. Durable request echoes use `HostRunRequest`
because materialized nullable/default fields need not have the input's shape.
`HostStartTerminal` distinguishes known original-run usage from interrupted,
unknown usage. The upstream module remains the runtime source of truth.

Offline checks (from the repository root):

```text
node --test tests/agentica-sdk-fidelity/vendor-runtime.node.mjs
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node node_modules/typescript/bin/tsc -p tests/agentica-sdk-fidelity/tsconfig.json
```

The focused tests use in-memory sockets and fetch stubs. They establish vendor
fidelity and local SDK behavior, not service persistence or live-provider proof.

No provider credentials, automatic live-provider selection or service-specific
world logic are included. The first integration uses only the explicit loopback
fixture host. Update this provenance when refreshing the vendor file.
