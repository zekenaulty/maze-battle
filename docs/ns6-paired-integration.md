# NS-6 Paired Integration

10 October 2026. Maze branch: `codex/ns6-integration`, based on merged PR #1.
This supersedes the preparation-only status recorded at `7cdea05`.

## Runtime Boundary

`DirectedAgenticaClient` binds the real streamed destination executor to Agentica
HostProtocol v1. It is separate from the legacy per-cell fixture client; existing
game saves, the ordinary RPG UI and existing preview servers are not replaced.

- `maze.navigate` admits a host-designated known destination. One atomic IndexedDB
  commit retains its original request, immutable admission, travel grant and link.
  Admission contains no completion claim. The browser's `tick()` executes routine
  known-path movement, including previously discovered doorways, without cognition.
- `maze.observe` projects the actor's current room. `maze.inspect` retrieves a
  specified cell's retained observations, not unseen authoritative state. It does
  not pretend to implement the richer directed-fixture perception skill.
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
node node_modules/vitest/vitest.mjs run --maxWorkers=2
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

The JSON reporter retains scenario outcomes and the first journey's local-step /
provider-call evidence in `test-results/ns6-paired-report.json`.

Native storage tests additionally cover atomic admission/reconciliation races,
quota rollback, changed-input replay, unknown inspection, refused destinations
without orphan intentions and immutable budgets across adoption.

This is provider-free cross-runtime qualification, not evidence of live-model
competence, token pricing, production deployment or ordinary-RPG feature completion.
