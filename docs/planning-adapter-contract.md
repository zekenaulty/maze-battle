# Browser planning adapter: MB-A0

Protocol: `maze-planning/1`. Status: local implementation and qualification;
not yet an Agentica service or a live-provider integration.

## Ownership and scope

Maze Battle owns geometry, visibility, durable knowledge, loot, movement, finite
scope completion, action timing and single-writer control. The service proposes
bounded actions; it never imports a game reducer or mutates IndexedDB directly.
The normal RPG save is not part of this first adapter. Only an existing isolated
`spaces-v2` expedition can be deliberately bound by the browser.

Every message repeats an exact binding: sessionId, epoch, runId, objectiveId,
actorId, worldId, floorId and public scopeId. The public scope is a persisted random
UUID. Internal scope identity contains the generator recipe and MUST NOT cross the
wire, including in observations, checkpoint copies, errors or observation IDs.
Current source routes are `src/services/expedition/planning/` and the separately
versioned `src/persistence/stream*` repositories.

Cells have a stable spaceId and zero-based local row/column. North decreases row;
east increases column. Coordinates never refer to viewport pixels. Storage buckets,
camera bounds and room bounds are different concepts.

## Messages

Browser to service: `start`, `observation`, `action.result`, `action.unresolved`,
`progress.ack`, `outcome`, `error`. Service to browser: `observe`, `progress`,
`action.request`, `action.query`, `outcome`. TypeScript contracts and strict complete
JSON parsing are in `contracts.ts` and `protocol.ts`. Unknown fields are rejected.

Example complete action envelope (illustrative IDs, not an executable grant):

```json
{
  "protocol": "maze-planning/1",
  "binding": {
    "sessionId": "browser-owned-session",
    "epoch": 3,
    "runId": "bounded-run-4",
    "objectiveId": "explore-floor",
    "actorId": "party",
    "worldId": "streamed-demo",
    "floorId": "floor-1",
    "scopeId": "fe6fd22e-70fb-4181-965f-7d7d92cbd23b"
  },
  "type": "action.request",
  "actionId": "original-attempt-17",
  "expectedRevision": 23,
  "expectedTopologyRevision": 2,
  "command": { "type": "move", "direction": "north" }
}
```

The later .NET host must consume this contract, not silently invent a parallel
command model. Transport will use one browser-initiated WebSocket; implementing
the schema and local gate does not establish that a network host exists.

## Command semantics

- `move(direction)`: one local cell or reciprocal committed doorway crossing.
  Does not prepare topology, collect a chest or start combat in this fixture.
- `collect`: collect the unopened chest at the current cell, exactly once.
- `prepare(frontierId)`: requires a currently visible known frontier. Advances
  at most one canonical generation step, atomically with gameplay and its receipt.
  Does not move or disclose other generated rooms. The requested frontier may
  still need preparation after this step.
- `finish`: only at home with the finite topology sealed and all room-local
  exploration, loot and return-travel obligations complete.
- `observe`: bounded current visible view and saved knowledge of the current room.
- `action.query`: original request identity, read-only receipt lookup. Missing is
  unresolved, not evidence that a possibly in-flight action had no effect.

Both gameplay and topology revisions are checked by the browser's transaction.
An action ID plus its exact semantic request is immutable. Duplicate deliveries
return the original durable result; changed-input reuse fails. Refusals are durable;
unadmitted ownership/revision conflicts are not fabricated as applied actions.

## Observation and evidence

Frames explicitly copy allowlisted fields, never spread a canonical room, recipe
or topology root. They contain one remembered room page with original observedAt
revisions, current visible cells/interactions, a compact gameplay checkpoint and
an opaque-scope observation ID. Hidden targets, placement coordinates, socket
reservations, seeds, future room budgets and oracle distances are absent.

A duplicate action result is original evidence. An accompanying current frame is
separate evidence and may have a later revision; it does not imply a second effect.
An external completion claim requires the matching committed `finish` receipt and
the current complete game checkpoint. Provider exhaustion or a complete streamed
proposal does not establish objective completion.

## Budgets and intervention

Default run: 128 admitted action attempts, 60 seconds, 128 KiB per frame. Hard
limits: 4,096 attempts and 15 minutes. A run deadline applies before every new
dispatch; an atomic action already dispatched may commit after cancellation or
deadline. Receipt reconciliation remains available afterward. Incoming complete
JSON messages are at most 16 KiB. Progress is observational: a 16-entry buffer,
monotonic sequence and explicit gap/eviction count; it cannot execute embedded text.

One mutating action is in flight. Identical concurrent deliveries share the same
attempt; another action is not admitted. The browser claims a durable epoch for
service control. Human takeover fences future effects. Cancel does not imply that
an outstanding effect was rolled back; query the original attempt. A service
restart does not automatically resume a runner or create a replacement attempt.

The service must also enforce one provider call at a time, token/context/refinement
budgets and frame provenance. These service gates are not implemented by the local
browser adapter. Provider reasoning carriers are private; only supported summaries
may be surfaced as progress.

## Remaining integration packets

1. MB-A0: adversarial local gate tests, actual-IDB receipt recovery, reviewed
   opaque-scope map paging and matching TypeScript/.NET payload fixtures.
2. MB-A1: isolated Agentica service host using existing AgenticaRunner, awaited
   ITool implementations, PlanningFrame projection and completion evaluator.
3. MB-A2: browser connection controls, explicit takeover, independent telemetry
   display and reliable request/result transport; keep local movement responsive.
4. MB-A3: bounded observed-map/evidence retrieval with provenance. Hypotheses remain
   separate from canonical knowledge; no implicit canonical-world refresh.
5. MB-A4: cross-runtime fake-provider tests: multi-call/blocked-action recovery,
   incomplete streams, slow display, disconnect-after-commit, restart and budgets.

Only after those gates should ordinary RPG capabilities be added incrementally.
Live-provider status remains UNKNOWN. Authentication, production transport security,
durable native-provider restart and multiplayer remain outside this initial slice.
