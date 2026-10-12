# A2: Real-Service Discovery Handoff

2026-10-12. Based on Maze `56e8e03` on `codex/agentic-game-a1` and the unchanged,
qualified Agentica fixture `d65fb5b7a5d4895921f8854054215b1d6279852e`.
This is provider-free cross-runtime qualification of the current frontier
primitive, not full A2/Q, model competence, or quest completion.

## Actual Path

The same authored A/B layouts now run through the real GameSession, native
IndexedDB, RpgAgenticaClient, vendored SDK, Agentica WebSocket service, workflow
planner/refinement loop and durable operation store. Layout construction is
shared with the native discovery tests; no second game/executor was introduced.
There is no discovery prelude. Combat is disabled in the fixture only.

The loopback fixture provider receives only the normal planner request. It reads
the scoped current observation, queries `maze.frontiers`, then selects the first
returned nonzero frontier in public page order. It cannot access the authored
variant, browser, generation recipe, hidden destination or canonical map.
The fixture limits each scope to two query/choice pairs and stops the test by
explicit cancellation after the second admission, not invented completion.

Both layouts initially disclose three cells and no chest. The first query/choice
pair approaches row 6, column 2 eastward; two ordinary game moves occur locally.
The first move produces progress with no new planner call. The second produces
a durable decision containing fresh local evidence: the junction at (6,4) is
blocked north in A and east in B. The successor queries again and selects (6,4)
east in A, north in B. Source IDs differ from the original receipt. No loot,
inventory, quest, floor or interaction effect occurs.

This uses four deterministic planner responses: two read requests and two
intention choices. It does not demonstrate four human-like decisions or live
model competence. Agentica reports cumulative providerCalls=4, refinements=2,
continuations=1 for the second admission; these counters are not per-cell steps.
Observed request bodies were about 29-70 kB in this fixture, including planner
instructions, tool catalog and refinement history. This is a local transport
measurement, not a live latency benchmark or a final context-economy claim.

## Repair Found By The New Gate

The restart cohort initially failed after explicit mid-route adoption. Local
travel and the service correctly transferred custody, but `prepareRpgWake`
constructed its later successor with the original run's session epoch and the
new owner's control. The returned service identity therefore failed binding.

The same-epoch wake path now verifies the parent's active epoch and uses the
exact retained decision's epoch for the successor. It still checks current
owner/revision, exact event identity, objective and mode. The original run
binding and old events remain unchanged. This is not permission to silently
adopt an old decision, renew limits, or rewrite history.

The real-service test restarts both browser and service after one move, proves
recovery remains paused without new plans, explicitly adopts, preserves the
deadline/limits/frontier and completes the second step into a new-epoch decision
successor. A native known-destination regression also transfers mid-route,
wakes at a later intermediate destination, and completes its final destination.

An earlier fixture-only comparison incorrectly depended on JSON object key order
for coordinates. It was corrected to compare floor/row/column values, with a
specific Node regression. Neither failed run is counted as a passing gate.

## Evidence And Limits

| Check | Result |
| --- | --- |
| Real-service cohort | 13 PASS: three cold-discovery/restart cases and all ten existing known-destination/recovery cases. |
| Native controller and discovery selection | 25 PASS, including the new transferred-epoch successor regression. |
| Fixture parser and selection guards | Four Node tests PASS, including stale/empty/oversized context, unknown fields, wrong provider, bounded choice sequence and key-order independence. |
| TypeScript and production build | PASS, 2,124 modules; existing 500-kB main-chunk warning remains. |
| Static boundary review | No hidden-world/authority issue found in the scoped frontier path; not runtime qualification by itself. |

Reproduce from the Maze worktree:

```powershell
$env:AGENTICA_FIXTURE_SOURCE='C:\Users\Zythis\.codex\worktrees\maze-operation-stop\Agentica'
node --test scripts/rpg-discovery-provider.node-spec.mjs
node node_modules/@playwright/test/cli.js test --config tests/e2e/rpg-agentica-paired.config.ts
node node_modules/@playwright/test/cli.js test --config tests/e2e/rpg-command.config.ts rpg-command-agentica-client rpg-command-discovery
npm run build
```

Service/provider use exclusive 5092/5093 ports and temporary service storage;
browser fixture origin is 5212. Native tests use 5204. The browser audit rejects
external HTTP/WebSocket requests and records page errors. No paid provider,
credentials, user saves or user preview were used. Evidence is in ignored
`test-results/rpg-paired-report.json` with `discovery-service-proof`,
`discovery-restart-proof` and environment attachments, plus native test results.
Raw public planner contexts, selected inputs and service events are retained.

Remaining A2 runtime work: continue an unambiguous earned corridor within the
original intention/grant, and yield on consequential observations before any
further movement. The current primitive still stops at its selected anchor.
Generated-layout scale, human/tool parity and the complete Q noninterference
matrix need their declared checks; these small service fixtures do not replace
them. A3 explicit ordinary quest collection/return and host completion follow.
