# Issue 11: Canonical Agentica Adoption Audit

2026-10-13. Read-only source audit of **36966a29dc0d28584a8accebf15a4196bc8c0539**.
Contract below is proposed, not implemented. Parent Auto and James's
canonical/navigation are outside scope. No service calls or production edits.
Paths `rpg/` and `canonical/` mean `src/services/agentica/rpg/` and
`src/persistence/canonical/` respectively.

## Findings

1. **Do not reconnect the retired adapter to GameSession.** `rpg/session.ts`
   describes the obsolete contract. `persistence/rpgAgentica/transaction.ts`
   opens old save/travel stores; its callers read full auto-saves and legacy memory.
   App intentionally exposes an unavailable notice, not this adapter.
2. **Wire revision cannot simply equal the latest canonical head revision.**
   `canonical/transaction.ts` increments revision for every bookkeeping write.
   SDK `_validateResult` requires applied/refused results to start at
   `action.expectedRevision`, and read-only results to leave that revision unchanged.
   Saving SDK `pending`, binding a run, or acknowledging an event would otherwise
   stale the action before its effect or fabricate a read-only world change.
3. **Quota recovery is not an ordinary outbox write.** Kernel cancel/acknowledge
   permit no callback; adopt requires normal capacity and ready custody. Legacy
   `markRpgLaunch`, event staging and acknowledgement are separate ordinary writes.
   Porting that sequence would make Stop or acknowledgement fail at normal quota.
4. **Lost start is not retryable through the current SDK.** `start()` creates a
   fresh request ID, not a durable launch-key retry. Empty inventory does not prove
   an unannounced start never ran. Preserve unresolved custody, not a replacement
   paid start. Old transport already refuses recovery without a binding.
5. **Old addresses and evidence are incompatible.** `rpg/capabilities.ts` and
   `domain/agentic/knowledge/shared.ts` reject negative coordinates. Old views use
   observation-node IDs and full-save memory; canonical cells use signed world
   coordinates plus `{level, cell:{spaceId,row,column}}` and source receipts.

## Contract: Smallest First Slice

Reuse vendored `AgenticaHost` unchanged (SDK README: upstream `d65fb5b`, blob
`e192c113`, not claimed as upstream main). Initially advertise only `maze.observe`,
`maze.inspect`, and `maze.navigate` to an explicitly selected earned destination
on one floor. Defer quest/frontier/corridor/chest/combat/stairs capabilities.
Navigation admission is not arrival; arrival never interacts.

Use GameSession's writer queue/fence, never another game or legacy adapter.
Start cancels competing Auto/manual execution through canonical controls.
Reload/reconnect stays paused even if GameSession regains custody.

### Records and Bounds

Protocol records live in canonical **execution**; kernel operations, receipts and
allocations own custody/capacity. Use one active-launch pointer and bounded reads.
Hash keys but retain/validate full SDK identities: raw `actionKey()` can exceed
the canonical 384-character key bound.

| Record | Minimum retained contract |
| --- | --- |
| Launch | ID, generation/game, scope/session/objective, endpoint, exact start payload/manifest inputs, earned target/source, limits, owner/epoch, funded guard ID; append-only dispatch/announcement/stop/wake refs. Dispatch intent is not acceptance. |
| Run | Launch/parent-decision refs, run ID/hash/service binding, immutable initial grant. Adoption is a separate record; announcement grants no effects. |
| Action | Full SDK key/fingerprint/action, run/publication refs, stable canonical request/attempt identities; pending or immutable original result ref. |
| Event | Operation/action/run lineage, sequence/event ID, exact wire payload, original sources, cumulative usage, terminal receipt ref. One ordinary unacknowledged event per operation; no replacement of originals. |
| Wake/adoption | Exact old decision/adoption payload, separate explicit grant, dispatch state, successor claim/announcement/ACK refs. Never regenerate evidence under an existing ID. |

Proposed caps: one launch, incoming action and navigation operation; context
<=32 cells/48 KiB. Split large start/results into records: stored record <=64 KiB,
kernel request/result <=16 KiB, binding <=4 KiB. Receipts use compact validated
refs/digests. Retain source history at quota. Kernel permits 16 funded operations,
each with 128 KiB-4 MiB terminal +16 KiB ACK allowance; budget COW paths and
receipts as well as payloads.

### Publication and Action Boundary

Map each wire revision to a host-retained canonical snapshot/grant. Use canonical
revisions as publication tokens, unchanged by bookkeeping or read-only results.
Before effects compare world/knowledge roots, checkpoint, generation and owner/
epoch with that publication; transact with the **current full canonical fence**.
Execution-root-only changes are harmless; game changes conflict. Keep actual
commit revisions separately. This mapping is protocol metadata, not another game
revision authority; never substitute fresh evidence into an old publication.

Canonical SDK hooks, to be implemented through that one queue:

- `loadAction(key)`: validated original SDK record or null; missing referenced
  evidence is corruption, not an absent action.
- `saveAction(key, pending)`: persist the original before `onAction`; duplicate
  identical pending is idempotent. This SDK reservation is **not** a kernel
  capacity reservation. At quota, failed admission permits no effect.
- `onAction(action)`: recheck grant, deadline, publication and cancellation gate.
  Queries persist exact bounded results; navigation calls James's transaction-level
  admission and writes the SDK result in **that same funded admission transaction**.
  Do not call `GameSession.execute` and save the result in a second transaction.
- `saveAction(key, completed)`: verify the original, never manufacture completion.
  `reconcileAction` returns the original or unresolved, never executes pending work.
  Cancellation plus verified absence of an effect can prove unavailable; absence
  alone cannot.

Use captured canonical knowledge/evidence: 1x1 `readCanonicalRegion` for global
lookup or bounded `readKnownCells`. Preserve source sequence/ID/time and edge
provenance. Resolve signed world coordinates only through earned index entries,
not hidden room origins. `maze.observe` reads evidence, not `look`.

James owns admission/step/adopt/cancel and completion proof. Required API:
contribute action-result/event writes inside his transactions and consume retained
source/usage/terminal refs. Use his funded operation ID, not a second travel ledger;
do not settle navigation just to return its admission result. If the composable
API is absent, integration waits.

### Retry, Park, Wake and Adoption

1. Fund a launch-guard operation and retain the exact start payload before any
   network dispatch. Persist dispatch intent first. Accept a `started` announcement
   only against the original scope/objective/epoch; validate run/hash before binding.
   Unresolved start blocks replacement launch. No automatic start retry.
2. Canonical exact retry uses the same attempt ID, fence, input and deadline;
   committed receipts replay before present-custody/deadline checks. A changed
   fence is a new attempt, never an exact retry. Reload reconciles retained action
   keys, kernel operations and receipts before considering new work.
3. `resume`, `recover`, and `listOperations` attach/reconcile, not adopt or wake.
   Compare service admission with the original host result. Confirm the service
   parked the admitted operation before navigation starts. Local routine steps
   and `signalOperation` progress do not activate cognition.
4. Retain each event before delivery and compare the returned latest event with
   the exact original. A decision settles one bounded execution window, not the
   objective. Persist wake intent and fund required successor recovery capacity
   before `wakeOperation`; retain objective/target/budgets/usage. Only pre-admission `connection.busy`
   refusal permits retry of the same decision; timeout means reconcile first.
5. Lost wake response: match parent action/admission, event, active epoch, adoption
   and `wakeRunId` in inventory; resume only that proven successor. Do not start a
   replacement. A decision from an earlier owner uses explicit `adoptDecision`
   with a separate current observation; the old decision stays byte-identical.
6. A still-admitted local operation uses kernel `adopt` under explicit current
   custody, then a retained transfer event before more steps. A settled decision
   cannot use kernel `adopt`: adopt its continuation grant and reserve the successor
   instead. Adoption/continuation needs normal capacity; never replenish deadlines,
   step/replan limits or provider usage through reconnect.

### Stop and Quota

Keep the launch guard funded until the objective's remote terminal state is
reconciled, including while a decision is parked. Check its live state before
every effect/wake; snapshot views alone cannot establish control. A current
`liveOperation` read followed by an exact head-fenced write closes the race.
Historical snapshot reads must not call `liveOperation`.

Stop first revokes in-memory work, then cancels the launch guard and admitted
navigation using kernel `cancel` with current host custody. A cancelled guard
disables execution even if the later navigation cancellation is interrupted.
This works after global Stop/takeover at normal quota; no new admission/adoption.
Do not require `markLaunchStopped` or any ordinary write to succeed first.

Because kernel cancel has no callback, define cancellation event/result bytes as
a versioned deterministic projection of the validated cancellation receipt plus
already retained action/source/usage refs. IDs, sequence and timestamp must be
stable; never use a fresh UUID/time or the later owner's observation on reread.
Provide a bounded host-only validated receipt reader if needed: the audited
`CanonicalQuery` exposes `liveOperation`, not a general receipt lookup. Do not add
a parallel recovery store. Preserve pending progress; stop local work immediately
and deliver retained events in order before the cancellation event.

Deliver ordinary terminals via `signalOperation`; cancel a parked decision with
`stopDecision`, never a wake. A live successor may need `stop(runId)` first, then
the exact decision-stop receipt. A matching service receipt permits kernel
`acknowledge` of the exact terminal attempt, releasing its funded ACK allowance;
no extra outbox write is required at quota. A settled decision is not cancellable
again: its original is reconciled while the launch guard carries the stop intent.
Reservations do not guarantee physical disk space or remote availability; show
pending cancellation/delivery honestly. Save/load must not restore custody;
reset is not proof that remote paid work stopped.

## Reuse and Retirement

- **Keep:** vendored SDK and declarations/provenance; `directed/wire.ts` exact-wire
  comparison; `rpg/network.ts` bounded administrative fetch; endpoint policy and
  deferred helper (extract narrowly from `clientPolicy.ts` if needed).
- **Port semantics, not storage:** `rpg/lifecycle.ts` binding/status checks,
  `decisionStop.ts`, client/transport reconnect and wake ordering, strict shape
  checks, immutable action/event identity, source-preserving observation formatting,
  pure destination limits. Rewrite `contracts.ts`/`validation.ts` for canonical
  fences/publications and signed coordinates. Do not retain their legacy imports.
- **Retire when canonical replacements are qualified:** all
  `persistence/rpgAgentica/*`; `rpg/session.ts`; old `client.ts`, `transport.ts`,
  `journey.ts`, `views.ts`; `hooks/useAgenticPlay.ts` old-store orchestration.
  Adapt the dialog to canonical state instead of preserving the old session API.
  Quest predicates/interaction proof are a later canonical content binding, not
  permission to retain `GameState` or expose hidden placements.
- **Tests:** port identity/reconnect/decision-stop assertions; replace old-store
  fixtures in `rpg-command-agentica-*`, `rpg-agentica-*` and protocol UI suites.
  Keep App's offline-boundary test until deliberate activation. Old fixture passes
  do not qualify canonical delivery. Do not bulk-delete shared `rpgMemory/tree*`:
  canonical pages/types still import them. General expedition/Agentica stores,
  shared domain rules and their consumers need a separate retirement audit.

## Acceptance Before Activation

Fixture-only native gates: lost start/wake/effect/result/ACK; changed/duplicate
action IDs; read-only revision stability; takeover with pending events; reload
without execution; signed coordinates and unchanged unseen geometry; original
sources and cumulative limits; cancel/ACK at normal quota; physical write failures.
Replay must return identical originals without effects. Parked-decision Stop must
make zero cognition calls. Test every transaction/network boundary.

Evidence here is source inspection only. No runtime, native, paired-service, Auto
or navigation qualification is claimed; no tests or paid calls were run.
