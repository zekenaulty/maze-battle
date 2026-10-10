# Browser-owned planning adapters

Status: browser-owned boundary and provider-free cross-runtime first-chest proof
qualified. See [recorded evidence](evidence/agentica-fixture-2026-10-09.json) and
[reproduction instructions](agentica-qualification.md). Live-provider status is
**UNKNOWN**; this does not qualify the entire RPG or whole-floor service planning.

Two contracts coexist; they are not interchangeable:

| Surface | Contract | Evidence boundary |
| --- | --- | --- |
| Internal local harness | `maze-planning/1` in `src/services/expedition/planning/` | Same-runtime scripted planner and actual-IDB browser tests |
| Agentica connection | Existing Agentica `HostProtocol.cs`, `protocolVersion: 1`, in `src/services/agentica/` | Real Chromium/IndexedDB, SDK, WebSocket and .NET runner with a streamed provider fixture |

The SDK is vendored without runtime edits from Agentica
`6dc1c6d510dde06aa67c3b0f5118e13894711af5`; see
[`sdk/README.md`](../src/services/agentica/sdk/README.md). Agentica does not consume
the internal `maze-planning/1` envelope. The earlier proposal to require that
envelope on the .NET wire has been superseded by adoption of HostProtocol v1.

## Ownership and scope

Maze Battle owns geometry, visibility, durable knowledge, loot, movement, finite
scope completion, action timing and single-writer control. The service proposes
bounded actions; it never imports a game reducer or mutates IndexedDB directly.
The normal RPG save is not part of this first adapter. Only an existing isolated
`spaces-v2` expedition can be deliberately bound by the browser.

The internal harness repeats its exact binding on every message: sessionId, epoch,
runId, objectiveId, actorId, worldId, floorId and public scopeId. The public scope is
a persisted random UUID. Internal scope identity contains the generator recipe and
MUST NOT cross either adapter boundary, including in observations, checkpoint
copies, errors or observation IDs. The Agentica binding described below maps these
host-owned identities to its existing wire contract, not to a second game model.

Cells have a stable spaceId and zero-based local row/column. North decreases row;
east increases column. Coordinates never refer to viewport pixels. Storage buckets,
camera bounds and room bounds are different concepts.

## Internal harness messages

Browser to service: `start`, `observation`, `action.result`, `action.unresolved`,
`progress.ack`, `outcome`, `error`. Service to browser: `observe`, `progress`,
`action.request`, `action.query`, `outcome`. TypeScript contracts and strict complete
JSON parsing are in `contracts.ts` and `protocol.ts`. Unknown fields are rejected.

Example internal-only action envelope (illustrative IDs, not an executable grant):

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

`PlanningSession` and `repositoryHost.ts` remain useful local gate and projection
fixtures. Their receipt query, progress messages and budgets are not the Agentica
transport API.

## Agentica HostProtocol v1

`openAgenticaClient({ slot, url, objective, onMessage?, onStatus? })` exposes
`start`, `cancel`, `close`, `reconnect`, `reconcile` and current run information.
It uses the generic SDK's browser-initiated WebSocket at `/api/host`; the fixture
policy accepts only loopback `ws:` URLs with a configurable port. Only the explicit
fixture provider is selected, with no credentials or paid-provider fallback.

- `start` / `started` establishes the service-created runId and manifestHash.
  The browser first claims a new durable control epoch. Its persisted public UUID
  supplies sessionId and scopeId; objectiveId is stable per public scope/objective
  kind (`first-chest` or `explore-collect-return`). Initial observations are projected
  before the service run exists; provisional projection IDs are never durable grants.
- The returned binding is validated and persisted before SDK reservation or action
  hooks can proceed, including actions delivered before the start await completes.
  Each action carries runId, sessionId, string sessionEpoch, manifestHash, actionId,
  runnerRunId, stepId, capabilityId, arguments, expectedRevision and deadlineAt.
- The five flat-schema capabilities are `maze.observe`, `maze.move`, `maze.collect`,
  `maze.prepare` and `maze.finish`. Every argument object requires integer
  topologyRevision; move also requires direction and prepare requires frontierId.
- `action.request` / `action.result` dispatches an original attempt;
  `action.reconcile` retrieves or conservatively settles that same identity.
  The SDK's HTTP `/api/recovery` inventory/result exchange reconciles retained
  attempts without executing commands. `resume` / `resumed` validates a retained
  run without claiming a replacement epoch. No automatic new run is created.
- `cancel` fences local admission immediately and attempts durable epoch fencing
  before SDK stop; a failed fence remains unresolved. Both `outcome` and
  `run.terminated` stop further admission. Disconnect or unknown acknowledgement
  retains original custody, not permission to retry under a different identity.

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
- Internal `action.query`: original request identity, read-only receipt lookup.
  Agentica uses `action.reconcile` and recovery instead. Missing evidence alone
  does not prove that a possibly in-flight action had no effect.

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

The internal harness may accompany an original domain result with a separately
read current frame at a later revision. That frame is explicitly separate evidence;
this convenience is internal-only and does not satisfy the Agentica original-result
contract.

Agentica observations are at most 64 KiB and use only the public scope. The full
original result, including observation ID, timestamp, observation contents,
evidence ID and any completion evidence, is generated once and committed in the
same IndexedDB transaction as the game effect, topology/knowledge updates and
domain receipt. A later replay returns that exact result; it never regenerates
the old observation from current state. Projection, validation or quota failure
rolls back the effect/result transaction, leaving the prior pending reservation.

`bindAgenticaRun` durably binds the service manifest; `saveAgenticaAction` creates
pending reservations or confirms an identical completed record, but cannot invent
a completed host result. `executeAgenticaAction` owns atomic execution;
`reconcileAgenticaAction` is read-only original-result lookup.
`settleAgenticaAction` never executes a command. Under the same transaction lock it
may settle an exact pending reservation only when absence of domain/prepare effect
receipts is proven and either a strictly newer control epoch proves revocation or
the action deadline has expired under consistent ownership. It preserves already
completed originals.
Missing or inconsistent ownership, uncertain receipts and storage failure do not
justify settlement. Disconnect or revision drift alone leaves a valid reservation
unresolved. The client tries original lookup before settlement, both on reconciliation
and after execution precheck failure; resolution does not restore an old owner's grant.

Completion is host evidence, not provider prose. Internal explore/collect/return
completion requires the matching committed `finish` receipt and complete checkpoint.
Agentica `first-chest` evidence requires host-verified collected loot;
`explore-collect-return` requires the host-completed finite expedition, including
its finish transition and home return. The result's objective/evidence binding is
retained atomically. Provider exhaustion or a complete streamed proposal is not
objective completion.

## Budgets and intervention

Internal harness default: 128 admitted action attempts, 60 seconds, 128 KiB per frame. Hard
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

The committed Agentica fixture client requests 128 steps, 128 refinements, 64 plan
continuations, a 900-second run timeout and a 45-second action timeout. Its fixture
provider configuration specifies a 131,072-token context and 4,096-token output.
The SDK client retains at most 128 messages and 2,048 action entries, with eight
queued actions. These are distinct from the internal harness limits and from the
database's logical byte quota; none implies unlimited history or a whole-floor
completion guarantee within one run.

Service scheduling (one provider call at a time), normal context compaction, exact-evidence retrieval
and budget enforcement require cross-runtime qualification. Local browser tests
do not establish those gates. Provider reasoning carriers remain private; only
supported summaries may be surfaced as progress.

## Implemented milestones and evidence

- MB-A0 local boundary: `9fafd78`, `23f24d7`, `2634e6f` add projection, bounded
  admission and adversarial ownership/acknowledgement guards. `7288f2d` integrates
  the repository host. Recorded PASS: two actual-IDB browser tests, including 535
  observed-only actions, all seven chests, home return and exact finish recovery
  after reload. This was an internal scripted planner, not an Agentica service.
- MB-A3 saved-map portion: `2077d3c`, `42c3dbb`, `ae38158` integrate public-UUID
  revision-fenced paging and a bounded map panel. Lists return at most 12 saved
  room summaries plus one lookahead; a room read returns only that saved knowledge
  page. Stale views fail explicitly, and superseded UI reads cannot publish.
  This is not historical reconstruction, canonical geometry access or an already
  exposed Agentica map-retrieval capability. The separately saved
  `?expedition=2&level=19` fixture uses slot `streamed-demo-level-19`; its recorded
  local planner evidence is detailed in [the streaming plan](streaming-exploration-plan.md),
  not evidence of an Agentica run at that level.
- MB-A1/MB-A2 browser side: `a503e39`, `61deb13`, `93c6687`, `7ac70ac`, `26dab01`
  integrate HostProtocol v1 helpers, durable start binding, atomic evidence and
  non-executing settlement. IndexedDB/SDK test fixtures are local host tests, not
  external-service qualification. Connection UI and service end-to-end evidence
  must be reported separately from the implemented client API.
- SDK refresh `ba5aa1c` pins Agentica `4291c7f` exactly. Recorded PASS: 53 focused
  client tests with one worker and TypeScript checking. These tests use the real
  SDK/domain with mocked repository and transport; they do not prove service
  interoperability. No client-policy or fixture changes were needed for the refresh.

## Cross-runtime qualification

MB-A4 first-chest gate passes with service `10e14c6`, real host-owned commands and
the provider-free streamed fixture. Normal and lost-acknowledgement cases collect
one chest after three spaces; a deliberately refused move is followed by replanning.
The lost original result is retransmitted exactly, and completion evidence replays
unchanged after browser reload. Browser text deltas are correlated by callId and
sequential provider ordinal and arrive before that call's provider completion.

Human takeover at revision 8 fences further effects; the abandoned original action
settles without execution. A new authorized epoch reprojects 38 offscreen remembered
cells, preserving their original observedAt values. Exact-source retrieval returns
those same entries. This is host-reprojected continuity, not automatic inheritance
of old service hypotheses. Compaction remains enabled and exact-source reads are
verified; direct, receipt-linked current observations avoid redundant map queries.

Still open: service-process restart, incomplete provider streams, slow-display
qualification, full-floor service orchestration and its repeated-run policy;
manual immutable save references and receipt archival; ordinary RPG integration.
Live-provider status is **UNKNOWN**. Authentication, production transport security,
durable native-provider restart and multiplayer remain outside this initial slice.
