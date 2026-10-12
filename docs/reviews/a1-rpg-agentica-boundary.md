# A1: Actual-Game Agentica Admission And Evidence

2026-10-11. Local, provider-free boundary qualification. A1 remains partial.
Checked implementation: `0716a94d945c95c0442e544735031fc39000a4ca` on
`codex/agentic-game-a1` (wire contracts `7450668`, transaction binding `5805e14`,
SDK repairs `7fa7375`, real-session dispatch `c09c1f8`).

This continues [durable RPG travel](a1-durable-rpg-travel.md). The new adapter
uses the actual `maze-battle` IndexedDB database and `GameSession`. It does not
copy the RPG into the older streamed fixture database. No paid provider was
called. The ordinary-game launch/reconnect UI and a paired Lab run are NOT
qualified by this report.

Follow-through: [ordinary-game controller and paired lifecycle](a1-rpg-controller.md)
records the next checked implementation and the still-failing pending-decision
restart gate. The historical proof limits below remain accurate for this report.

## Implemented

- `services/agentica/rpg` defines the existing SDK envelopes for `maze.observe`,
  `maze.navigate`, `maze.room`, `maze.map` and `maze.inspect`. The SDK itself is
  unchanged. Room pages contain at most 32 remembered cells; map pages at most
  12 remembered room summaries and no room interiors. Only explicit observe
  returns the local cell view. Other replies carry compact position/source
  receipts plus only the requested context. Inspection is remembered-cell
  retrieval, not a new perception/examination mechanic.
- Page cursors require the exact memory snapshot and matching room/map scope.
  Queries read source-validated earned memory, never geometry, legacy fog
  completeness, an unseen chest list, or generator state. Owners/control tokens
  remain host metadata and are absent from the wire observations.
- Schema 7 adds run bindings, SDK action receipts, operation links, an event
  outbox and local-operation receipt links. These are metadata/evidence stores,
  not another authoritative game, inventory or floor store. Schema-six upgrade
  preserves existing save/control/history stores without creating operations.
- SDK action reservation precedes effects. The applied result, travel admission
  and operation link commit in the same transaction as the ordinary save's
  custody revision. A refusal cannot publish a journey or consume a revision.
  Missing-original reconciliation records a no-effect terminal result; it does
  not attempt the original action. Completed originals replay exactly after
  later movement, expiry, takeover or replacement of the active game.
- Navigation may select any earned destination on the bound floor, not just the
  host's completion target. Admission parks an operation; it is never objective
  completion. Arrival at the host-bound known destination produces completion
  evidence. Arrival elsewhere emits `decision`. This is the A1 known-destination
  completion policy, NOT a proof of a quest, survey, inspection or return loop.
- A local step, shared movement result, source observation, travel usage and its
  outbound progress event commit together. One unacknowledged event is retained
  exactly. Replayed local attempts retain their original event, including after
  that event was acknowledged. Technical/cumulative deadline expiry during the
  final write aborts every staged effect and receipt.
- Explicit cancellation stops local travel even with an earlier progress event
  awaiting acknowledgement. Delivery retains that earlier event, then reports
  cancellation. Manual changes fence continuation. New ownership requires
  deliberate adoption and an epoch-transfer event; target, grant, elapsed time
  and cumulative use survive. Nothing renews a grant because a local window ended.
- `GameSession.executeAgenticaAction` and `advanceAgenticaOperation` serialize
  through the same owner queue and publish the actual game to subscribers.
  Real movement also records existing play telemetry without duplicating it on
  receipt replay. These are controller entry points, not a second game loop.

## Proof Level

The native browser proof feeds one action through the unchanged SDK dispatch
path, backed by real GameSession/IndexedDB hooks. Duplicate dispatch produces
the exact original result and invokes the host action once. Four local moves
publish positions 1 through 5, with progress/progress/progress/completed events;
the chest crossed remains unopened. Operation signal payloads pass the SDK's
real validator using a fake HTTP transport. No model or .NET service participates
in this proof. Direct SDK-private dispatch is a test technique, not production
controller integration or a simulated provider-performance result.

Native action tests also validate returned results with the pinned SDK, and
cover unknown targets, insufficient grants, immutable bindings, changed action
fingerprints, reload, replacement, current revision/floor conflicts, missing
originals, explicit scoped queries, and hidden-data sentinels. Event tests cover
pending acknowledgements, cancellation, adoption/transfer, alternate-destination
decision, final target proof, and injected failures at every new effect-bearing
write boundary. Existing ordinary command/archive/memory/travel cases remain in
the same native test cohort.

## Verification

| Check | Result |
| --- | --- |
| Full unit suite before final scope-only repair, explicit two workers | 2,341 tests / 149 files PASS, 210.35s |
| Standalone native event/SDK-dispatch/migration suite | 14 cases PASS, 10.5s |
| Final combined native command/admission/event cohort | 121 cases PASS, 71.70s; no skips or retries |
| Selected existing known-destination regressions | 15 cases PASS, 33.8s |
| Production build | TypeScript + Vite PASS, 2,109 modules |

Commands: `node node_modules/vitest/vitest.mjs run --maxWorkers=2`;
`node node_modules/@playwright/test/cli.js test --config tests/e2e/rpg-command.config.ts`;
`node node_modules/@playwright/test/cli.js test --config tests/e2e/ns6-host.config.ts --grep 'destination|journey|navigate|arrival|adoption'`;
`npm run build`. Dedicated event checks use `rpg-agentica-events.config.ts`.
Ignored local evidence is under `test-results/rpg-commands`,
`test-results/rpg-agentica-events` and `test-results/ns6-host`.

An isolated reviewer found two SDK-invalid replies: a custody conflict without
an observation, and a refusal after a failed route had incremented the revision.
Both were repaired and independently rechecked: 18 native review checks and
126 contract/view tests passed. No new concrete finding was reported on that
recheck. Subsequent admission tests found four context-scope failures from an
unsolicited local-cell view; only observe now includes that view. The initial
event run also failed because its new isolated port was absent from the fixture
allowlist; the fixture now explicitly allows 5204 and 5207. These were corrected,
not waived. The first combined pass had 116 passes and five stale migration
expectations for version 6; the new schema is 7. Those exact-version assertions
were updated while retaining save, source-history and custody preservation
checks. The reviewer used isolated 5298; the existing preview was untouched.

## Remaining A1 Gate

1. Add the actual-game controller and compact UI: explicit connect/start,
   service-admission confirmation before stepping, bounded local scheduling,
   status, Stop, deliberate adoption, and durable reconnection. Wire the existing
   SDK start/resume/recover/wake functions to the new boundary. No dispatch is
   permitted merely because a socket connected or a scope was discovered.
2. Bind a successor after an acknowledged `decision` without changing the
   governing objective/grant. Qualify that start/wake/acknowledgement race with
   the real paired service, not just a direct persistence call. The stored parent
   binding checks are implemented; cross-runtime successor behavior is not yet
   proven. Game replacement fails closed; continuation of the old operation
   after replacing its game is not claimed.
3. Run actual-game known-route/reload/takeover provider-free pairing and keep
   the old known-destination fixture as regression coverage. Paired source was
   reread at `1e1a2df3c489d633b62b739b7bd61eba2cfa3c5d`; it was not modified or
   newly runtime-qualified here. SDK reuse does not establish this pairing.

Then A2 earned-frontier discovery and meaningful choice, A3 explicit ordinary
quest collection/return, and Q Lumina's two-dungeon corpus. Combat stays disabled
in these fixtures; full RPG/controller parity and combat remain later work.
The live-model gate still requires separate authorization and provider limits.

Whole-save write cost and durable receipt retention remain unresolved scaling
limits. JSON corruption witnesses detect accidental record changes; they are
not authentication against a malicious local database editor. No infinite-world,
automatic retention compaction, physical-device mobile, or network-latency
qualification is claimed.
