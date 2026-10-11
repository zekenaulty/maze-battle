# NS-6 Paired Integration

Maze branch: `codex/ns6-integration`, based on merged PR #1.
This supersedes the preparation-only status recorded at `7cdea05`.

## Runtime Boundary

`DirectedAgenticaClient` binds the real streamed destination executor to Agentica
HostProtocol v1. It is separate from the legacy per-cell fixture client; existing
game saves, the ordinary RPG UI and existing preview servers are not replaced.

- `maze.navigate` admits a host-designated known destination. One atomic IndexedDB
  commit retains its original request, immutable admission, travel grant and link.
  Admission contains no completion claim. The browser's `tick()` executes routine
  known-path movement, including previously discovered doorways, without cognition.
- Context is requested through separate operation, map, room and cell scopes,
  described below. Historical inspection does not pretend to implement the richer
  directed-fixture perception skill.
- Arrival does not collect, open or interact. For an explicit travel-only objective
  it emits a separate completion event. With `inspectOnArrival`, arrival emits a
  persisted decision event instead; `operation.wake` binds the successor run before
  any successor effect, and an explicit inspection supplies completion evidence.
- Progress, transfer, decisions and completion have immutable IDs and a serial
  durable outbox. An uncertain acknowledgement reuses the same bytes and identity.
  Comparisons normalize only typed optional fields and typed timestamps. Historical
  strings and observation data remain exact; admissions are never rewritten.
- `recover(runId)` reconciles custody and stays paused. Explicit `adopt()` fences
  the old owner, reconciles pending movement and transfers the same intention to
  a fresh epoch. Target, start time, limits and cumulative usage survive. Replanning
  consumes the existing grant rather than resetting it. `cancel()` can take control
  after recovery without first resuming travel; its local fence does not wait for
  progress HTTP delivery.
- Ordinary movement, storage, residency, provenance and collision rules remain
  browser-owned. No authoritative graph is sent to the planner and no automatic
  quest, loot or destination-selection policy is inherited.

The host designates the bounded travel objective; this is not yet an unrestricted
natural-language quest policy. Source-history retrieval remains Agentica's existing
bounded evidence API, backed by immutable host observations and receipts.

## Context Scopes

A room contains cells; a map contains known room/space summaries and connections.
Neither view is an always-present map dump. Selecting a view grants no movement,
generation, interaction or discovery, and does not change the destination intention.

| Surface | Payload and bound |
| --- | --- |
| Initial admission and routine operation events | Public checkpoint/position, designated destination, operation status and cumulative usage. No room grid, knowledge page or prior query result is attached. |
| `maze.map(spaceId, depth, limit)` | Known room/space graph around the requested center, at most 3 connection hops and 12 page reads. Room summaries include observation revision, known counts, remembered connections and frontiers, but no internal cells or coordinates. Boundary room IDs support deliberate re-centering. |
| `maze.room(spaceId, offset, limit)` | Row/column-ordered pages of up to 32 remembered cells, with objects on those cells and `nextOffset`. Original observation ages and room-page revision are retained. |
| `maze.observe()` | On-demand current local view: at most 24 nearby visible cells plus remembered landmarks. Coverage counts explicitly distinguish omitted detail from unknown space. |
| `maze.inspect(spaceId, row, column)` | One cell's recorded facts and objects. Does not refresh a remote room or infer hidden facts. |

Queries use actor-known IndexedDB pages, not generated topology. Unknown room IDs
produce an unknown result without loading geometry or expanding the world. Read
bounds apply before fetching additional pages, not just to the final JSON. Every
query result is retained under its original action identity for exact replay; the
next operation event does not keep carrying the query payload. Service-side source
history remains available separately from the current planning projection.

This supplies host tools, not a new UI map or a change to the normal RPG screens.
Streamed passages currently have their own known-space summaries; this does not
invent room labels or collapse passages using unobserved geometry.

## Time and Limits

The admission's technical action deadline and the admitted journey are independent.
The paired test waits past the actual service-issued action deadline, then completes
the original journey without another admission or model call. A technical timeout
does not become arrival or silently reset the journey's hard grant.

The configured journey ceilings retain the owner's requested default/finite/unlimited
behavior. Their snapshot and cumulative usage survive adoption. Current finite
`durationMs` is explicitly a real-time hard ceiling, including suspension, not a
claim of simulation-time accounting. No policy renewal is inferred on adoption.
An exhausted hard grant remains exhausted; a new explicit goal can use a new grant
after terminal evidence is reconciled. None/unlimited never disables epoch fencing,
storage quotas, known-map residency limits or original-effect reconciliation.

## Pinned Service

Agentica source: `1e1a2df3c489d633b62b739b7bd61eba2cfa3c5d`.
Containing main merge: `977d0cab5421fd4e09fd33f1224f241b7e425abe`.
Vendored SDK blob: `64665c24e9a73ebd7dcd97a91fefcd9f0d944a2b`.
The paired cohort executes the qualified Release fixture assembly from that source,
with a fresh disk-backed service store and a deterministic streamed Responses fixture.
It never selects a live provider, consumes an API key or makes a paid model call.

## Repeatable Verification

```powershell
$env:AGENTICA_FIXTURE_SOURCE = 'C:/path/to/qualified/Agentica'
$env:AGENTICA_DOTNET = 'C:/path/to/dotnet-10.0.302/dotnet.exe'
$env:AGENTICA_FIXTURE_ASSEMBLY = 'artifacts/durable-handoff-fixture/Agentica.Lab.Web.FixtureHost.dll'
node node_modules/@playwright/test/cli.js test --config tests/e2e/ns6-paired.config.ts
node node_modules/@playwright/test/cli.js test --config tests/e2e/ns6-host.config.ts
node node_modules/vitest/vitest.mjs run --maxWorkers=1
npm run build
```

The paired cohort owns ports 5085 (service), 5086 (fixture provider) and 5185 (Vite),
refuses already-running servers, and uses separate browser contexts. The launcher
retains the same temporary service store during its restart test. That store is
outside Playwright's output directory and is not deleted during a restart.

Paired scenarios:

1. One admission traverses three known rooms with unchanged provider-call count;
   arrival leaves chest state untouched.
2. Browser and service restart retain admission and intention; movement waits for
   explicit adoption, then continues from the saved checkpoint under a new epoch.
3. Travel completes after its individual admission action deadline has elapsed.
4. A lost progress acknowledgement replays exactly before cancellation.
5. Arrival requiring inspection wakes one successor, preserving the objective and
   avoiding premature completion.
6. Lost completion acknowledgement survives browser and service restart; subsequent
   terminal ticks are read-only.
7. A recovered intention can be cancelled without adopting or moving it.
8. A cancellation fence commits while the progress HTTP request is deliberately hung.
9. Inspection after adoption uses the new epoch; recovering the original run finds
   its retained successor and completed objective.
10. A crash after the final move but before event publication reports completion
    without moving again or requiring adoption of already-completed travel.
11. Cancellation during startup cannot later enable or admit travel.
12. The planner explicitly requests a map, then room detail, then one destination;
    subsequent travel adds no provider calls and carries no room/context dump.

The JSON reporter retains scenario outcomes and the first journey's local-step /
provider-call evidence in `test-results/ns6-paired-report.json`.

Native storage tests additionally cover atomic admission/reconciliation races,
quota rollback, changed-input replay, unknown inspection, refused destinations
without orphan intentions and immutable budgets across adoption.
They also verify pagination, unknown room queries, no query-driven generation or
movement, and exact query replay after the actor moves.

## Qualified Result

Implementation commit: `3e6e7e25cfc702ae212b19d6a2db2b298fdba341`.
The tested working tree was committed unchanged. Final results:

- 1,640 unit tests in 114 files passed with one worker.
- 153 native browser/storage/UI checks passed, including desktop and mobile views.
- 12 paired browser/SDK/service scenarios passed, with no retries or skipped tests.
- TypeScript and production Vite build passed.
- Travel-only proof: 38 local moves, one deterministic planner activation, original
  admission unchanged, no arrival interaction.
- Explicit context-query proof: `maze.map`, then `maze.room`, then `maze.navigate`;
  38 following local moves incurred no further planner activation.

Earlier concurrent runs hit the existing 60-second autopilot stress-test timeout
and a five-second mobile startup assertion. The stress case passed alone, and the
entire unit and browser cohorts then passed separately. Test deadlines and gameplay
behavior were not changed to make those checks pass.

[Machine-readable proof summary](evidence/ns6-paired-proof.json) records the pinned
source/assembly identity, measured fixture calls, payload sizes and evidence limits.
The prompt-byte measurements are fixture HTTP request sizes, not token or price
estimates. Service prompt history and compaction remain separate from the host's
on-demand projection contract.

This is provider-free cross-runtime qualification, not evidence of live-model
competence, token pricing, production deployment or ordinary-RPG feature completion.
