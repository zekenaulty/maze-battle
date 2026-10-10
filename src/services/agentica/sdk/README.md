# Agentica browser host SDK

Vendored without edits from `zekenaulty/Agentica` commit
`1e1a2df3c489d633b62b739b7bd61eba2cfa3c5d`:
`Agentica.Lab.Web/wwwroot/sdk/agentica-host.mjs`.

SDK Git blob: `64665c24e9a73ebd7dcd97a91fefcd9f0d944a2b`.
This cut adds durable admission, operation inventory/events and semantic wake.
Agentica main merge `977d0cab5421fd4e09fd33f1224f241b7e425abe` contains it.

This dependency-free SDK owns transport, original-attempt custody callbacks and
reconciliation. Maze Battle supplies its own IndexedDB hooks and legal command
implementation. Local declarations describe the public surface consumed here;
the upstream module remains the runtime source of truth.

No provider credentials, automatic live-provider selection or service-specific
world logic are included. The first integration uses only the explicit loopback
fixture host. Update this provenance when refreshing the vendor file.
