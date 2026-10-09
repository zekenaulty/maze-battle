# Agentica browser host SDK

Vendored without edits from `zekenaulty/Agentica` commit
`6dc1c6d510dde06aa67c3b0f5118e13894711af5`:
`Agentica.Lab.Web/wwwroot/sdk/agentica-host.mjs`.

This dependency-free SDK owns transport, original-attempt custody callbacks and
reconciliation. Maze Battle supplies its own IndexedDB hooks and legal command
implementation. Local declarations describe the public surface consumed here;
the upstream module remains the runtime source of truth.

No provider credentials, automatic live-provider selection or service-specific
world logic are included. The first integration uses only the explicit loopback
fixture host. Update this provenance when refreshing the vendor file.
