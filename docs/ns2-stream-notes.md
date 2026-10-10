# NS2: Streamed Known-Destination Adapter

Base: `049e9bde18f2f9938ee961612ca99ef2fb3190f2`, branch `codex/directed-stream`.
Initial module commit: `2d610bd`. Initial scope: new files under `src/domain/expedition/streaming/directed/`,
`src/services/expedition/directed/`, and this note. No existing runtime,
persistence, UI, objective policy, or NS4a memory code is changed.

The subsequent user-authorized durable extension is described below. It adds
`src/persistence/directedStream*.ts`, the concrete executor, native-IDB tests,
and an additive topology database migration. The shared lifecycle remains
unchanged; the parent's deep-clone correction requires no adapter API change.

## Implemented Boundary

- The same `domain/directed/destinationExecution.ts` owns creation, step
  admission, route reconsideration, collision handling, completion, and stops.
  Limits remain 64 successful steps, four replans, and 120 seconds from start.
- `DirectedStreamKnowledge` validates observed pages through `readPlannerPage`,
  copies only learned fields into `KnowledgeProjection`, and uses
  `actorNavigationGraph`, `planKnownDestination`, and `routeHasEdge`. It does
  not substitute a second BFS-only execution implementation.
- The loader point-reads the current page and follows **learned** opening
  destinations. It stops once the selected destination has a known route.
  Unknown opening destinations and unseen local cells are not route nodes.
  It never enumerates topology or asks for a room, seed, layout, or geometry.
- Admission caps the aggregate actor graph at 512 cells, not 512 per room.
  Page reads are serial, the next page is checked against remaining capacity
  before copying, and the endpoint queue is capped at 512 entries. Pages are
  discarded after projection; routes are at most 64 cells. A point-read page
  is transient extra input (itself bounded by the existing 512-cell validator),
  not a retained second world. Diagnostics distinguish learned cells/pages
  from geometry residency, which is always zero inside this adapter.
- A route is shortest within the admitted actor graph. This is not a claim of
  globally shortest routing over all persisted pages. Capacity exhaustion is
  an interruption, never implicit exploration, a partial destination, or a
  request to generate more topology.
- Targets are an observed cell, an observed chest at its remembered address,
  or a doorway at its remembered address. All are explicit user intentions.
  Chest arrival never collects. Doorway `approach` stops on its near cell and
  also permits an observed pending frontier; it cannot prepare it. `cross`
  requires an already learned destination and observed destination cell,
  and uses the selected doorway as the final edge. Already occupying the
  requested far endpoint is arrival without movement.

## Pure Adapter API

The following describes the module boundary. The durable executor below now
implements its transaction/reconciliation requirements; they are no longer an
unimplemented parent dependency.

Import the service functions from `services/expedition/directed/adapter.ts`.

1. Build `DirectedStreamFrame` from the current checkpoint and control token,
   not from `StreamRoom`. Supply `read = id => readStreamKnowledge(slot, id)`.
   Call `startDirectedStreamTravel(frame, { id, target }, read)` only for an
   explicit selected destination. The parent owns replacing/cancelling old
   operations and validating persisted records before restoration.
2. Call `prepareDirectedStreamStep(state, frame,
   { operationId, sequence, actionId }, read, now, current)` for one step.
   Owner/session, epoch, world/floor/scope, position, checkpoint revision,
   topology revision, sequence, pending status, pause, and time are fenced.
   `current` must become false when a local cancellation or takeover invalidates
   a pending asynchronous read. Preparation returns no effect or a state with
   exactly one `pending` move. Capture the exact action ID before dispatch.
3. **Host contract, now implemented by this extension:** atomically compare-and-swap the operation ID,
   sequence, control, pause/cancel state, checkpoint/topology revisions, and
   deadline, then commit the pending attempt, immediate move, learned updates,
   and operation settlement/receipt together. Recheck the deadline immediately
   before the effect: time can pass after preparation returns. Reject outdated
   asynchronous proposals, including after cancellation. The adapter is pure
   preparation/settlement; the repository below owns the durable transaction.
4. The prepared request is a v2 `StreamActionRequest` narrowed to `move`.
   `pending.from`, `pending.to`, and `pending.kind` are the expected immediate
   edge. Host validation may consult authoritative collision/reciprocal doorway
   data for **that edge only**, never to select or change the route. Validate
   the expected endpoint before movement. Do not pass this intention to
   `StreamRuntime.automatic()` or its objective-choosing planner.
5. Feed the exact `StreamActionResult` to `settleDirectedStreamMove`. An
   authoritative *immediate collision* needs a typed host classification passed
   as the third argument, `true`; do not infer it from arbitrary refusal text.
   It remembers only the attempted blocked edge, clears the route, and charges
   the next replan to the shared allowance. No remote obstruction/object
   identity is accepted. Ordinary refusals interrupt; conflicts pause.
6. Unknown acknowledgements must load/reconcile the **same** saved request via
   `loadStreamAction(slot, pending.request)` before any new attempt. Unavailable
   or mismatched results retain the exact pending request and pause. Settlement
   validates receipt identity, both revisions, scope, phase, and the expected
   destination; it never restarts travel after cancellation or pause. Compact
   v2 receipts can supply an actual host checkpoint as the optional fourth
   argument instead of an observation. No observation is manufactured.
7. `cancelDirectedStreamTravel` stops future steps while retaining an admitted
   pending attempt for reconciliation. `pauseDirectedStreamTravel(saved)` is
   mandatory on reload/takeover: it clears disposable routes and never resumes
   automatically. Reconcile any pending attempt first; a new explicit intention
   starts new travel. The durable executor now implements this cancellation;
   the parent owns UI publication and memory integration.

The existing `StreamRuntime.dispatch()` alone is insufficient for step custody:
it creates its own action ID and persists no directed operation/sequence. This
adapter intentionally does not modify that runtime or claim durable atomicity.
No prepare/generate/collect/finish methods are exposed to the adapter.

## Durable Executor

`services/expedition/directed/executor.ts` exposes `DirectedStreamExecutor`:

```ts
const executor = await DirectedStreamExecutor.open(existingSlot);
await executor.navigate(knownTarget); // explicit intention, durable before return
await executor.step();              // at most one move, never another objective
await executor.cancel();            // durable settlement/revocation barrier
const record = executor.record;     // cloned operation, pause and receipt state
const residency = executor.residency;
```

`open` takes stream control and reloads any prior intention paused. It does not
create/reset a stream slot. A new explicit `navigate` is required after reload.
The caller schedules `step` calls while the selected operation is running;
there is no automatic exploration or target policy. Concurrent `step` calls
share the admitted promise. `navigate` rejects while busy or while another
unpaused intention is active. `cancel` first joins an active step/start, then
uses the transaction barrier below before acknowledgement.

Persistence entrypoints in `persistence/directedStreamRepository.ts`:

- `loadDirectedStreamSession`: point-read checkpoint, control, and operation.
- `openDirectedStreamSession`: reconcile, revoke the previous epoch, pause.
- `startDurableDirectedStreamTravel`: actor-known planning and durable intention.
- `prepareDurableDirectedStreamMove`: actor-only page reads in the slot lock,
  record-revision/epoch/checkpoint fencing, and durable original pending request.
- `executeDurableDirectedStreamMove`: only the staged move, using the **existing**
  `executeStreamActionInTransaction`; effect, stream receipt, operation counters,
  and settlement share a transaction. Its endpoint is verified against the
  actual post-effect checkpoint before commit. There are no authoritative
  remote route reads. Late deadline failure rolls the entire transaction back.
- `stopDurableDirectedStreamTravel`: reconcile the exact original receipt,
  revoke the epoch, and cancel/pause under the same lock as every stream effect.

An uncommitted pending request is retained durably until executed or retired.
On reload/cancel it is marked `lastAttempt.outcome = 'revoked'` only in the same
transaction that fences its epoch (or after detecting an already newer epoch).
A late raw `executeStreamAction` of that saved request therefore conflicts.
If its effect already committed, `lastAttempt.outcome = 'settled'` stores the
exact original request and compact result. Reconciliation is allowed before
current ownership checks, but never dispatches a substitute request. Historical
operation records are retained, operation IDs cannot be reused, and quota
accounting includes all added records. No receipt eviction is introduced.

On an execution/storage error the runtime attempts the same durable pause and
revocation barrier; if that cannot commit it remains locally paused and rejects
the call. It never reports successful cancellation after a failed barrier.
Reopen to reconcile before further work. Recovery does not adopt another tab's
owner token. A stale/wrong caller cannot retire a still-authorized pending move.

The only existing persistence file changed is `topology/database.ts`: additive
schema version **4**, adding `directedStreamHeads` and `directedStreamOperations`
to the shared transaction/byte-accounting scope. No existing records or root
identities are rewritten by migration; v3 stream slots remain usable. The
existing `executeStreamActionInTransaction` already existed, so no stream action
extraction or existing runtime edit was necessary. NS4b's separate directed DB,
NS4a memory integration, and the UI are untouched.

## Qualification

New tests use actual `MemoryTopology` generation and observations obtained by
executing the existing stream commands. Automatic exploration is fixture setup
only; the directed phase uses only explicitly selected destinations and moves.

- Three generated seeds: `1`, `55`, `20261008`. Travel crosses three distinct
  discovered rooms plus passages to an initially unloaded target chest. No
  collection, preparation, generation, completion, or extra discovery occurs.
- Host geometry uses the real 512-cell `SpaceResidency` cache; planning causes
  zero geometry loads, and each execution-time room load is for the immediate
  crossing endpoint. Target loading occurs only during traversal.
- Identical learned pages produce identical routes, requests, and states until
  an unseen remote obstruction is actually attempted. One collision then
  becomes actor evidence and prevents silent repeated crossing attempts.
- Exact aggregate 512/513 admission tests, plus a larger generated/explored
  world that fails closed before retaining more than 512 learned cells.
- Shared lifecycle equivalence; initial/remaining step limits; time limits
  before/after async reads; four-replan limit; stale owner/epoch/revisions and
  duplicate sequence rejection; doorway approach/cross distinction; unknown
  destinations; paused reload; cancellation; exact-attempt reconciliation.

Commands (run from the isolated checkout):

```text
npx vitest run src/domain/expedition/streaming/directed src/services/expedition/directed src/domain/directed/destinationExecution.test.ts src/domain/directed/navigation.test.ts
npx tsc --noEmit
```

Initial module results: 33 focused tests passed; the expanded streaming/runtime/shared
lifecycle regression selection passed 102 tests in nine files. TypeScript
`--noEmit` passed. These results precede the separately requested durable
executor integration.

Durable native-browser commands (isolated server on port 5193, no shared Vite
cache or reused server):

```text
npx playwright test --config tests/e2e/directed-stream.config.ts
npx playwright test --config tests/e2e/directed-stream-compat.config.ts
```

The actual Chromium IndexedDB suite covers three generated/observed rooms and
an unloaded target, no route geometry reads, 512-cell geometry residency,
point-read-only access, exact logical byte accounting, staged/committed reload,
lost acknowledgement, original receipt reconciliation, cancellation during an
active step, cross-tab cancellation races, epoch takeover, unrelated-owner
rejection, intervening manual moves, deadline rollback, injected IDB settlement
failure, corrupted non-movement commands, and a real v3-to-v4 upgrade preserving
every prior record. The compatibility selection re-runs existing stream
persistence, race, migration, and failure tests against the same port.

Final observed durable-extension results: **14/14** native directed-stream tests
passed; **11/11** existing stream compatibility tests passed (including the
2,697-command, 15-space completion/reload case); **102/102** expanded
domain/service regression tests passed; `npx tsc --noEmit` passed. Both native
suites used actual Chromium IndexedDB on the isolated port 5193 server.

Evidence level: provider-free domain/service plus actual browser IndexedDB
qualification. Parent combined-tree regression, installed UI, NS4 memory
integration, and production behavior are not claimed by these tests.
