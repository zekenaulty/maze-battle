# AP-03 Directed Storage

Import the facade from `src/persistence/directed/index.ts`. All methods return
caller-owned snapshots and use only `maze-battle-directed-v1` (schema version 1).
There is no reset, delete, migration, provider, or legacy-database path.

## API

- `createDirectedSave(slot): Promise<DirectedSession>` creates once from the domain
  fixture, including its prelude observations/events and every derived projection.
  Repeated calls return the current save, not a fresh fixture.
- `readDirectedSave(slot): Promise<DirectedSession | undefined>` reads durable state.
- `claimDirectedSave(slot, owner): Promise<DirectedSession>` reads and writes within
  one transaction. Same-owner claims are no-ops. Different owners advance epoch and
  session revision, cancel a running operation, and clear its remaining route.
- `executeDirectedRequest(slot, request, now): Promise<DirectedReceipt>` checks the
  original attempt before fences. Exact structural payload retries return the
  original receipt regardless of later ownership/revision. Different payloads under
  the same attempt ID throw. Property order does not affect payload equality.
- `reconcileDirectedRequest(slot, request): Promise<DirectedReceipt | undefined>`
  never invokes a transition. It can recover an old owner's committed attempt.
- `captureDirectedContext(slot, id, purpose): Promise<PresentedContext>` captures
  exact domain-presented bytes. Repeating an ID/purpose returns its original bytes,
  even after newer knowledge exists. A different purpose under that ID throws.
- `auditDirectedSave(slot)` is **host-only**, returning `{ session, world,
  observations, projections, events, contexts, receipts }`. World and session world
  are independent clones. This envelope includes undisclosed truth; do not expose
  it to actors or providers. Audit checks every historical projection against its
  immutable observation sources without replacing any stored presentation.

Malformed input, corrupt checkpoints, missing saves for mutating APIs, quota
exhaustion, and identity conflicts throw. A fresh stale owner/epoch/revision request
returns an unjournaled `refused` receipt (`stale-owner`, `stale-epoch`, or
`stale-revision`) and does not reserve the attempt ID. Domain refusals are journaled
with unchanged state/revision; applied commands must advance revision exactly once.
The repository never increments a domain transition's revision a second time.

## Persistence Rules

The single transaction locks all seven stores: `saves`, `worlds`, `observations`,
`projections`, `events`, `contexts`, and `receipts`. Every append-only record uses
IndexedDB `add`, including original receipts. A rejected write aborts all effects.
There are at most 4096 entries per journal, including the revision-zero projection.
The repository never evicts sources, contexts, or receipts. Full effect journals
reject before invoking the pure domain transition; batch growth is checked before
staging writes. Original-attempt replay remains available when full.

Every recorded navigate operation ID remains reserved, including a navigate
refusal, through the bounded original-request journal. Claims never erase it.
Checkpoint reads validate current scope, version, journal counts, and independent
world/latest-projection agreement. Full audit additionally validates historical
keys, sequences, evidence links, and domain-rederived historical projections.
This is shape/lineage validation, not cryptographic tamper evidence.

## Integration

Required domain exports:

- `fixture.createDirectedFixture(): { session, observations, events }`
- `knowledge.emptyDirectedKnowledge(worldId, observerId)`
- `knowledge.rememberDirected(knowledge, observation)`
- `context.presentDirected(session, id, purpose)`
- `transition.applyDirectedCommand(session, command, now): DirectedTransition`

Run in the integrated checkout only, with port 5176 free:

```powershell
npx playwright test --config tests/e2e/directed-storage.config.ts
```

The dedicated config owns port 5176 with `strictPort` and no server reuse. Coordinate
with the lead preview before running. Fixtures use new browser contexts and fresh
slots, forbid opening any other database, and forbid database deletion. The browser
suite covers rollback, exact retry, reconciliation, takeover, contention, operation
IDs, cancellation, immutable presentations, corruption, and journal exhaustion.
No provider or installed-runtime qualification is claimed by these fixtures.
