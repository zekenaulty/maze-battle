# NS2: Streamed Known-Destination Adapter

Base: `049e9bde18f2f9938ee961612ca99ef2fb3190f2`, branch `codex/directed-stream`.
Scope: new files under `src/domain/expedition/streaming/directed/`,
`src/services/expedition/directed/`, and this note. No existing runtime,
persistence, UI, objective policy, or NS4a memory code is changed.

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

## Parent Integration API

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
3. **Needed NS3 host API:** atomically compare-and-swap the operation ID,
   sequence, control, pause/cancel state, checkpoint/topology revisions, and
   deadline, then commit the pending attempt, immediate move, learned updates,
   and operation settlement/receipt together. Recheck the deadline immediately
   before the effect: time can pass after preparation returns. Reject outdated
   asynchronous proposals, including after cancellation. The adapter is pure
   preparation/settlement, not this durable transaction.
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
   destination; it never restarts travel after cancellation or pause.
7. `cancelDirectedStreamTravel` stops future steps while retaining an admitted
   pending attempt for reconciliation. `pauseDirectedStreamTravel(saved)` is
   mandatory on reload/takeover: it clears disposable routes and never resumes
   automatically. Reconcile any pending attempt first; a new explicit intention
   starts new travel. The NS3 parent owns durable cancellation and publication.

The existing `StreamRuntime.dispatch()` alone is insufficient for step custody:
it creates its own action ID and persists no directed operation/sequence. This
adapter intentionally does not modify that runtime or claim durable atomicity.
No prepare/generate/collect/finish methods are exposed to the adapter.

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

Observed results: 33 focused tests passed; the expanded streaming/runtime/shared
lifecycle regression selection passed 102 tests in nine files. TypeScript
`--noEmit` passed. These results precede the separately requested durable
executor integration.

Evidence level: provider-free domain/service qualification. NS3 durable
operation transactions, crash/reload persistence, installed UI, and production
behavior remain the parent's integration work, not qualified by these tests.
