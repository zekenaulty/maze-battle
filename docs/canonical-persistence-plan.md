# Canonical Game Persistence

Issue: [#11](https://github.com/zekenaulty/maze-battle/issues/11). Revision 55,
2026-10-24. Status: the actual App now uses canonical storage for the checked
noncombat manual-play vertical, including earned map, movement, roster/town,
explicit interactions, named checkpoints and load recovery. All former query
routes mount this same App. [Evidence and limits](reviews/issue-11-playable-cutover.md).
P3 Auto now uses that same playable App and canonical commands, with earned
waypoints, explicit collection/guild/care policy, interruption and bounded floor
preparation. [Auto integration evidence](reviews/issue-11-auto-cutover.md).
Retained known-destination execution and atomic host hooks were checked separately
before mounting the initial client below. [Navigation proof](reviews/issue-11-navigation-composition.md).
Actual-App depth-local movement is now measured through 16 retained qualified
floors. [Method and limitations](reviews/issue-11-app-depth.md).
P4 has removed the alternate production writers and disconnected preview UI.
The [retirement map](reviews/issue-11-p4-retirement-map.md) records the earlier
inventory; [final RPG writer retirement](reviews/issue-11-rpg-writer-retirement.md)
closes its remaining source dependency tree without preserving old formats.
Canonical publication/action results now compose atomically with that navigation,
including reviewed corruption/mutation fixes. [Binding evidence and next integration](reviews/issue-11-agentica-records.md).
The [shared GameSession host queue](reviews/issue-11-game-host-queue.md) and
[funded launch/initial-grant primitives](reviews/issue-11-launch-custody.md) now
compose with the actual game under provider-free tests. P4 has removed the
[standalone expedition writer](reviews/issue-11-expedition-store-closure.md) and
[its legacy-only snapshot validators](reviews/issue-11-expedition-validator-followup.md).
The [scoped perception and SDK action boundary](reviews/issue-11-scoped-action-host.md)
now uses that same queue, with exact pending/result reconciliation and atomic
navigation admission. The disconnected [standalone launch journal](reviews/issue-11-standalone-launch-closure.md)
and [directed-v1 store](reviews/issue-11-directed-v1-store-closure.md) are removed.
The checked [service custody and progress increment](reviews/issue-11-service-custody.md)
adds canonical initial transport, ordered events and explicit stopped-owner
capacity recovery. A retained zero-step probe and exact service ACK gate the first
step; inventory admission alone is insufficient. Native driver/recovery tests and
a separate in-process pinned Agentica registry proof pass. Neither is a mounted
client or live browser-to-service qualification.
The [terminal delivery and verified-ACK increment](reviews/issue-11-terminal-delivery.md)
now keeps local Stop independent of ordinary storage, delivers exact retained
event prefixes, reconciles lost replies, and releases navigation reserves only
after verified remote acceptance. Arrival is a decision, not objective completion.
P4 also removed the [general stream Agentica writer](reviews/issue-11-p4-general-stream-agentica-retirement.md).
The earlier [uncertain-start Stop increment](reviews/issue-11-uncertain-start-stop.md)
established local cancellation without treating run inventories as full-request
admission or proof of absence. Its partial discovery path is now superseded by
the durable contract below, not retained as a fallback. P4 additionally removed the
[directed stream Agentica writer](reviews/issue-11-p4-directed-agentica-retirement.md)
and its four obsolete store registrations.
The separate Agentica [durable initial-start contract](https://github.com/zekenaulty/Agentica/blob/602f15a/docs/durable-host-starts.md)
now provides pre-execution admission, exact original-request lookup and explicit
Stop settlement. Its provider-free service/SDK proof is recorded in the
[prerequisite report](reviews/issue-11-durable-start-service.md).
The [canonical durable-start adoption](reviews/issue-11-canonical-start-recovery.md)
now replaces partial run-inventory discovery with the exact retained dispatch
attempt, validated full-request admission, resolved settings and funded verified
Stop settlement. Unit/native and real-service browser checks pass; this does not mount the client or
complete decision/wake. Initial-run publication renewal is now checked below.
P4 has also removed the [remaining stream/topology writer closure](reviews/issue-11-p4-stream-store-closure.md),
including eleven stores and 118 obsolete source/test files.
The [unfinished-navigation transfer](../tests/e2e/canonical-operation-transfer.md)
now requires an exact service ACK and both kernel adoption receipts before movement.
The integrated native fixture checks 24 transfer and 116 original-operation cases;
that fixture is not the real service. The seven-case [real-service action proof](../tests/agentica-start-service/README.md)
separately covers distinct observation identities, exact retry, reload/explicit
transfer before the first step, one local move and funded remote settlement.
The [publication selection and decision evidence increment](reviews/issue-11-decision-checkpoint.md)
now selects immutable grant/publication pairs, fences superseded initial-run
actions, and records an explicit decision intention and exact successor claim.
The service-side wake attachment/replay fix is pushed separately. Native decision
record tests are not browser-to-service wake qualification.
The [successor grant and funded decision-handoff increment](reviews/issue-11-decision-successors.md)
now binds fresh actions to the exact selected successor, uses its effective request,
and validates bounded immediate predecessor evidence. Decision-aware ACK releases
navigation capacity only, with exact Stop/reload reconciliation. Multi-window and
source-deletion native cases pass. The [explicit decision controller](reviews/issue-11-decision-controller.md)
now binds the retained intent, exact wake/adopt, correlated claim and selected
successor grant through the actual GameSession. Eleven provider-free real-service
cases pass, including successor navigation, fast settlement, exact lost-reply
replay and process-restart refusal. Funded granted-root Stop has a separate native
cohort. The [verified-root decision discharge](reviews/issue-11-decision-root-stop.md)
now closes Stop before claim and Stop after child admission but before predecessor
ACK, without creating missing claims or successor authority. Thirteen actual
service cases and 83 native controller cases pass. Historical ACKs stay immutable;
only proven uncommitted stale proofs may be rebuilt. The
[real decision reload and read-only discovery increment](reviews/issue-11-recovery-discovery.md)
adds positive new-owner adoption before intent retention, exact lost-adopt replay,
and explicit recovery after old-intent/terminal-claim/granted-child reload.
Eighteen real-service cases and twenty native discovery cases pass. A retained
old-owner intention remains recovery-only after takeover, not silently continued
or replaced. Adoption-process restart is now checked. The earlier twenty-case
cohort reproduced a pending-ungranted-action reload gap. The
[pregrant recovery increment](reviews/issue-11-pregrant-recovery.md) now closes
that case through retained local cancellation/claim evidence and exact original
service custody, not an inference from missing canonical records. Twenty-two
real-service cases cover no-effect reconciliation, interim unresolved results,
lost replies, restart and funded root/navigation ACKs at ordinary quota.
Scoped local discovery and explicit root Check/Stop are now mounted in the
actual App, including its failed-load screen. Opening recovery never contacts
the service. At that recovery milestone, execution controls remained unmounted;
initial Start is now mounted below. The [navigation/reset increment](reviews/issue-11-navigation-reset-recovery.md)
adds explicit inspected-original Stop/reconciliation in the same App, plus a
transactional reset guard against unresolved current verified-host allocations.
The actual-App quota proof covers local Stop, real remote navigation/root ACKs
and deliberate fresh reset through UI controls. The [pending-action recovery increment](reviews/issue-11-mounted-pending-recovery.md)
now mounts explicit run-page discovery, exact inspection and reconciliation. A
receipt-witnessed active-root claimed-parent reference survives both ACKs, browser
reload and service restart. The 24-case provider-free service cohort includes
actual-App lost-reply rediscovery, with no new planner calls or gameplay effects.
The [initial Start increment](reviews/issue-11-mounted-start.md) now mounts explicit
configured Start, scoped queries, bounded known-destination execution and urgent
Stop in that same App-owned GameSession. No automatic wake, collection, provider
selection or new-game harness. P3 frontier/quest integration and P5 final
qualification remain open. This is not complete feature
parity or closure of #11.
The final 26-case provider-free service cohort includes exact reserved-to-parked
waiting without movement/writes, actual-App Start and urgent Stop, plus the prior
reload/recovery/decision cases. See the linked report for separate unit/build
evidence and environment limits.
The [explicit continuation increment](reviews/issue-11-mounted-continuation.md)
now mounts one same-owner successor window per explicit Continue, using the
retained decision/claim/grant path and a verified predecessor handoff ACK.
The 27-case provider-free service cohort includes this actual-App flow. No
automatic wake, new root start, hidden collection or cold-reload adoption is implied.
The [explicit adoption increment](reviews/issue-11-mounted-adoption.md) now mounts
inspected-original new-owner adoption in the same App. Read-only inspection
discloses retained settings; explicit input revalidates the exact offer after
acquiring control. The canonical decision claim precedes guard adoption and
successor admission. Continue uses validated retained service usage, not a local
counter. Old-owner intentions/claims remain recovery-only; no automatic renewal.
The [earned-frontier approach increment](reviews/issue-11-earned-frontier-approach.md)
adds bounded current-sight frontier inspection and explicit source-bound approach
through the same navigation, GameSession and durable Agentica protocol. It stops
at the selected anchor, not at an invented hidden destination. The newer
[bounded-space increment](reviews/issue-11-bounded-space-exploration.md) adds
explicit current-space continuation and source-bound material decisions. Unit,
native and the complete 31-case provider-free real-service cohort pass, including
the actual-App material stop. The report retains the intermediate fixture
failures. The [explicit chest increment](reviews/issue-11-agentica-chest-interaction.md)
now mounts source-bound interaction through the shared game and durable service
protocol, including an accepted ordinary quest collectible. The integrated
quest-return/completion loop and full qualification corpus remain below.
The [next-boundary source audit](reviews/issue-11-quest-context-boundary.md)
identified hidden-target traversals in the authoritative quest helpers. The
[accepted-journal increment](reviews/issue-11-accepted-quest-context.md) now uses
a separate restricted reader over the same canonical records, explicit paged
`maze.inspect` scopes and source-bound opaque selectors. It does not embed
quests in initial context or authorize collection, return or reward claims.
The ordinary target-validating helpers remain engine-only.
The [owner-bound return objective](reviews/issue-11-return-objective-binding.md)
now retains an explicit selected fetch quest and an earned town entrance in the
original publication, with bounded pack/stash custody readers. The subsequent
[explicit return-completion increment](reviews/issue-11-return-objective-completion.md)
mounts owner selection, on-demand objective inspection and retained host proof.
The actual App collects one ordinary quest item and returns nine local steps
before a separate check establishes completion. This known-return fixture does
not qualify cold-start exploration or the two-dungeon matrix; no reward claim
is implied.
The [canonical cold-start corpus](reviews/issue-11-canonical-corpus.md) now
composes earned-frontier selection, explicit ordinary collection and host-proven
return through the actual App and pinned service in both authored worlds.
On-demand visible-object inspection exposes committed sight only. The same
offline planner follows different disclosed branches; this is affordance-driven
adaptation, not live-model or whole-Q qualification.
The [explicit decision-history query](reviews/issue-11-decision-history-query.md)
now retrieves the original material notice from a successor's immediate
predecessor evidence without refreshing unseen state or expanding initial
context. Same-owner, explicit adoption and one post-transfer actual-service
variants now pass, including changed-sight completed-hook replay. Arbitrary
ancestry and remote replay remain separate qualification boundaries.
The [bounded App revisit qualification](../tests/e2e/canonical-revisit.report.md)
now proves two complete two-floor round trips with real collected content,
reload and explicit tab takeover. A separate keyboard-action measurement holds
history fixed while varying retained depth, then adds 128 ordinary moves at
fixed depth. Neither uses hidden routing or relocates the actor during traversal.
The [corpus quota/reload increment](reviews/issue-11-canonical-corpus.md#quota-and-reload-at-collection-boundaries)
now qualifies settled decisions before/after collection in both authored worlds,
including failed-load recovery, original child/root ACKs and exact game-state
preservation. Seven focused actual-service cases pass with history/adoption.
This does not qualify active-step interruption or the full Q matrix.

## Authority and Supersession

The owner permits destructive disposal of **all pre-existing Maze Battle saves**,
including saves produced by earlier React builds. No migrations, fallback readers,
dual writes, original-save import, or old-format compatibility acceptance remain.
This supersedes contrary preservation/isolation requirements in
`streaming-exploration-plan.md`, `agentic-play-next-slices.md` and the recorded
umbrella goal. Historical reports remain evidence of those earlier builds, not
instructions to preserve their schemas.

Keep gameplay, not storage formats: actual RPG inventory/party/quests, backtracking,
mandatory movement effects, explicit voluntary interactions, earned knowledge,
exact receipts and Agentica admission/settlement/cancellation. No paid-model gate
is authorized here. A database merger alone is not completion.

## Confirmed Problems

- `GameState` includes both `maze` and historical `floors[].maze`. `moveActive`
  filters/sorts the floor array; `updateOwnedGame` reads and writes the entire
  `SaveSlot`. `normalizeGameState` reconstructs historical floors on load.
- `readGameControl` reads the full autosave even when its owner/revision has not
  changed. The React session calls it every 750 ms. History/perception reads also
  fetch this world-sized record before touching bounded evidence records.
- Five runtime entrypoints use different authorities: normal RPG, expedition 1,
  stream expedition 2, directed expedition 3 and the original Lab launch scenario.
  Their stores span `maze-battle`, `maze-battle-expeditions`,
  `maze-battle-topology-v2`, `maze-battle-directed-v1`, `maze-agentica-launch`.
  The old telemetry fallback used another database, `maze-battle-telemetry`.
- Stream slots are floor-specific rather than one multi-floor game; stream chest
  mutations are stored in knowledge pages. Neither is the final shared model.
- The failing ordinary-game startup offers no independent reset path. Its refresh
  can replace a load error with a read-only game whose observation history is still
  invalid. Do not fix this by accepting malformed receipts or synthesizing sight.

Native before-change measurements and their limits are in
[the baseline report](reviews/issue-11-storage-baseline.md).

## Canonical Records

One database, `maze-battle`, one schema and one transaction host. Start the new
schema destructively, not through a SaveSlot compatibility wrapper. The UI and
domain functions consume a bounded resident projection; it is not another store.

| Entity / key | Authoritative content and update boundary |
| --- | --- |
| Game head / game ID | Schema generation UUID, owner/epoch/revision, active floor and space ID, actor position, current mode and bounded counters. No historical-floor list or embedded geometry. |
| Floor / game ID + floor ID | Stable depth, pinned generator/version/seed, entrance and exit connection IDs, generation state. Revisited floors keep their identity. |
| Space / game ID + floor ID + space ID | Immutable bounded geometry page or exact pinned recipe with hash. Room metadata, not actor discovery. |
| Connection / game ID + connection ID | Both reciprocal endpoints, topology revision and generated socket identity. Shared rules govern doors, stairs and portal return. |
| Frontier / game ID + floor ID + socket ID | Engine-only expansion checkpoint, occupancy/bucket membership and bounded generation budget. Not agent knowledge. |
| World mutation / game ID + space ID + entity ID | Chest contents/open state, optional mechanisms, persistent hazards and encounters. Never stored as truth in a knowledge page. |
| Party member / game ID + actor ID | Attributes, equipment references and current combat resources. |
| Item / game ID + item ID | Instance/stack and ownership; indexes by pack, stash, actor and quest. Pack capacities count the correct owner, not all item records. |
| Quest / game ID + quest ID | Acceptance/objective/reward state, target references and item custody. Bounded floor/status indexes, no scan of all completed quests per step. |
| Knowledge / game ID + perspective ID + page ID | Only earned facts and references to immutable source observations. Independent from authoritative mutations and geometry. |
| Evidence / generation + evidence ID | Immutable observation, context and provenance. Bounded keyset/history reads. Retain all sources needed for admitted operations and exact replay. |
| Execution / generation + operation or attempt ID | Original command fingerprint, authority, admission/progress/terminal result, source references and durable delivery/acknowledgement sequence. |
| Save checkpoint / game ID + checkpoint ID | Versioned head and persistent page-root references, not a copied world. Writes branch immutable page roots or use a revisioned overlay with bounded lookup. |

Final indexes must serve these access paths directly: current head; exact space
and reciprocal endpoint; entities within resident spaces; active quests on the
current floor; item ownership; observations by perspective/sequence; original
attempt; operation delivery sequence. No growing manifest in the active head.
Versioned checkpoints use the existing copy-on-write radix index: three bounded
roots reference immutable world, knowledge and execution records. P1a proves
old-root reads and snapshot-scoped pagination after writes/reload without walking
an overlay chain. Host roots are internal references, never provider capabilities.
Named save/load now uses receipt-bound roots and rejects live allocations; it
never restores custody, quota or execution roots. Explicit Agentica Stop,
reconciliation, same-owner continuation and inspected new-owner adoption now
use canonical integration. These controls do not renew authority on load.

## Transaction Contract

1. Look up the exact original attempt by generation and ID. Match its fingerprint;
   return its committed receipt without effects, even after ownership changes.
2. For new work, fence generation, owner/epoch, expected revision and deadline.
   Missing established destination data is corruption, not permission to regenerate.
3. Load the source and destination resident records, local mutations and relevant
   policy. Historical floors are neither enumerated nor deserialized.
4. Apply the same game-owned command for manual, Auto and Agentic Play. Movement
   does not authorize loot, quest acceptance, vending or optional interaction.
5. Stage changed records, actor-permitted observations, operation state, receipt
   and event publication in the **same IndexedDB transaction**. Generation also
   atomically stages reciprocal endpoints and occupancy metadata.
6. Check logical-byte quotas before admission/commit. Reserve explicit headroom
   for already-admitted settlement, Stop, takeover and recovery. Fail closed without
   partial effects; never silently prune replay sources. Compaction is optional
   later and must retain referenced evidence or explicitly retire its replay scope.
7. Publish the resident projection only after commit; send external events from
   the durable outbox. Crash/lost reply reconciles the original attempt.

The existing streamed staged-write/quota machinery is useful code to reuse. Its
slot-scoped types and knowledge-as-mutation semantics are not the final contract.
Do not keep a second implementation after consumers are moved.

## Bounded Implementation Sequence

| Slice | Deliverable | Exit evidence |
| --- | --- | --- |
| P0 recovery / measurement | Explicit clean-start from a failed load; stable errors; remove original importer and telemetry fallback; native before-change cost baseline. | Corrupt history/control, atomic reset rollback, old-owner rejection, real App reset/reload and unchanged controls. This does NOT close #11. |
| P1 canonical authority | New schema, identities, transaction host, quota admission/reserve and compact head. Port useful topology primitives. No old schema reader. | Atomic effect/receipt, replay fingerprint, reset generation, concurrent owner, crash/quota tests. |
| P2 bounded world residency | Floor/space records, indexed sockets, mutations, reciprocal traversal and bounded resident projection; remove `GameState.floors` history from the active path. | Deep repeated ascent/descent, surface/portal/reload, eviction, unchanged-floor hashes, no regeneration on missing known records. |
| P3 actual-game cutover | Party/items/quests and manual/Auto/Agentic commands on the same writer; knowledge and receipt reads use compact heads. Replace normal save/list/load and 750-ms refresh paths. | Native per-step read/write/clone/serialization counts independent of retained floors, plus actual App and command regression. |
| P4 retire parallel persistence | Retarget or remove expedition/direct-mode/old launch consumers; remove obsolete stores/readers and compatibility-only tests/docs. Keep reusable domain algorithms and test fixtures, not playable alternate authorities. | Repository scan finds one production DB opener/transaction family; all supported entrypoints use the same game. |
| P5 qualification | New-schema Q recovery and knowledge matrix plus reproducible storage-growth/limit tests. | Shallow/deep/revisit/native-browser/build gates, exact evidence/replay and cancellation at capacity. Re-run the known-destination and two-dungeon regressions before further integration. |

P0 is checked: [integrated recovery evidence](reviews/issue-11-recovery.md) and
[native before-change baseline](reviews/issue-11-storage-baseline.md). P1a is now
checked: [kernel evidence and limits](reviews/issue-11-canonical-kernel.md).
P1b is also checked at the storage boundary:
[operation-capacity evidence](reviews/issue-11-operation-capacity.md). P2a now has
[bounded structural world evidence](reviews/issue-11-world-residency.md). P2 is
partial; [room-role preparation and P3a roster commands](reviews/issue-11-roster-and-roles.md)
now reuse actual domain rules through canonical records. The next checked increment
adds [floor qualification and explicit chest/quest persistence](reviews/issue-11-content-and-quality.md).
The next increment adds [earned observation, memory and local exploration](reviews/issue-11-earned-exploration.md)
with native per-step cost/recovery evidence independent of retained floor count.
P3 manual and Auto now run in the actual App, including named saves and recovery.
The actual-App native depth test includes session publication and map reads, not
only isolated storage callbacks. P3 Agentica lifecycle and full P5 qualification
remain open; no canonical live-provider claim is made.

P1 storage contracts are split as follows:

- **P1a, checked:** incompatible schema initialization, immutable record/root
  storage, compact heads, atomic command receipts, snapshot-scoped reads,
  generation/owner/revision fencing, per-operation work limits, logical quotas,
  one bounded Stop/takeover using reserved capacity, and destructive reset.
- **P1b, checked:** durable admission and per-operation settlement/cancellation
  and acknowledgement reservations; explicit adoption after takeover; immutable
  original receipts and current control rows fenced by bounded head allocations.
  Native tests prove the storage contract at capacity, not game-level completion.
- **P2a, checked:** persist pinned modules one bounded expansion at a time, sharing
  the existing module step and occupancy logic; separate immutable room geometry,
  ports/connections, frontier/counters, local mutations and reciprocal stairs.
  Native checks cover generation parity, restart, twelve-floor return, corruption
  and local resolver costs through 32 generated floors. Not App qualification.
- **P2b role preparation, checked:** a compact generation-bound cursor reduces
  at most eight rooms per commit through the shared role planner. Completed plans
  preserve existing hub/specialty assignments but do not claim D1 quality or
  content/knowledge readiness.
- **P3a roster boundary, checked:** independent party, item, pack/stash and policy
  records; actual equip, trade, supply, explicit town care and shared portal
  commands with atomic receipts. Worn items have actor ownership and no pack-slot
  charge. No unchanged item/actor or historical floor is rewritten.
- **P2b/P3a content boundary, checked:** shared D1 structural criteria reduced in
  four-room batches, exact topology/scratch namespace witnesses, and two-room
  content-preparation batches. Independently stored chests, posted guild contracts
  and accepted quests; explicit accept/open/claim commands and local visit progress.
  Item ownership, award provenance, quest progress, gold and original receipt commit
  atomically. These commands do not accept or loot merely because the actor moves.
- **P2b/P3 knowledge and local exploration, checked:** bounded shared linked sight,
  immutable source chunks, independently paged remembered cells and known rooms,
  local move/stair/accepted-visit commands, and atomic observation of explicit
  chest effects. Cropped coverage retains earned edges; unchanged memory blocks
  are not rewritten. Source/namespace identities are pinned by the compact head.
- **P3 manual and Auto, checked:** actual GameSession, earned map/rendering,
  roster/content commands, receipt-bound named saves, explicit interactions,
  bounded Auto scheduling and batchwise floor preparation. Reload never resumes
  Auto without a fresh toggle; other tabs need explicit takeover.
- **P3 navigation foundation, checked:** retained earned-route windows with
  cumulative limits, funded cancellation/ACK, explicit adoption and atomic host
  hooks. Protocol record binding is checked on this same transaction
  host; no old session adapter or second playable world is permitted.
- **P3 Agentica foundations, checked:** one funded launch, immutable dispatch/run
  and explicit initial grant; actual GameSession queue, transaction aborts and
  funded same-owner cleanup. Read/reload grants no execution. Ambiguous starts
  block replacements; local cancellation alone cannot release them. No SDK mount is claimed.
- **P3 scoped SDK actions, checked:** earned actor/room/map/cell projections,
  unchanged SDK offline action dispatch, one-shot reservations, atomic navigation
  admission and exact read-only reconciliation through the actual game queue.
  Hooks are fenced to their original publication and GameSession lifetime.
- **P3 Agentica terminal delivery, checked:** exact retained terminal derivation,
  bounded prefix delivery, callback-free local Stop, verified funded ACK/retry and
  decision Stop without cognition. Native SDK/HTTP-fixture and pinned in-process
  registry evidence are separate; no paired application mount is implied.
- **P3 durable initial start, checked:** exact pre-send canonical dispatch,
  full-request service validation, compact frozen admission and funded Stop/ACK.
  Lost replies, service restart and full logical quota have real-service/browser
  proof; missing service evidence remains UNKNOWN and blocks replacement.
- **P3 unfinished-navigation transfer, checked:** immutable intent,
  exact service ACK, separate guard/navigation adoption receipts, and effective
  current-owner authority. Funded Stop works at partial-transfer stages in the
  native contract fixture. A separate real .NET proof covers reload/takeover of
  admitted zero-step navigation, one move and terminal settlement without another
  planner invocation. This is not multi-step or decision-wake qualification.
- **P3 decision persistence, checked:** explicit intention/claim, initial publication
  renewal, atomic successor grant/selection and funded navigation handoff ACK.
  Immediate predecessor evidence is bounded without recursive ancestor loading;
  old grants cannot execute fresh effects, while committed results remain replayable.
- **P3 decision controller, checked:** explicit wake/claim/grant through the
  actual GameSession, independent funded ACK/Stop, and verified-root discharge
  after lost claims or admitted children. Thirteen real-service cases and 83
  integrated native controller cases qualify this bounded increment, not App mounting.
- **P3 recovery discovery, checked:** local bounded inventory and explicit
  single-original inspection, no storage creation/upgrade or remote requests.
  Actual new-owner decision adoption and terminal/granted reload recovery now
  have separate real-service proof. Pending-only remote custody stays unknown.
- **P3 pending-action recovery, checked:** explicit actual-App discovery and
  selection, exact no-effect reconciliation, lost accepted reply and restart.
  Local claimed-parent references are receipt-witnessed, independent of live
  allocations, and grant no authority. Missing proof fails closed; an empty
  remote page never means session clearance. Current claim validation remains
  independent of optional discovery evidence, with no migration or fallback.
- **P3 initial execution, checked:** explicit configured Start and a player-entered
  objective, scoped queries and a serialized local navigation loop in the actual
  App. Stop bypasses pending network work; a manual-control lease excludes mixed
  writers. No model activation per cell, automatic wake, loot or completion claim.
- **P3 same-owner continuation, checked:** explicit Continue publishes earned
  context, retains/correlates intent and claim, selects a successor grant and
  ACKs only the predecessor. The same App/session performs bounded navigation;
  a next decision requires another explicit input. Stop remains immediate.
- **P3 inspected adoption, checked:** local-only disclosure of the exact original,
  explicit new-owner adoption with retained objective/provider/limits, canonical
  claim then guard adoption, and bounded successor navigation. Changed control
  withdraws stale offers. Validated service usage gates further continuation;
  an exhausted allowance is distinguished from its pending read. An old-owner
  intention/claim is not silently replaced with a new one.
- **P3 frontier approach, checked:** bounded current-sight query, exact
  publication/source selection, nonzero earned route, original limits and
  explicit decision on arrival. Missing remembered-neighbor index entries fail
  complete-block integrity checks. No hidden-world selection or incidental loot.
  Older knowledge without integrity evidence requires explicit guarded reset;
  no schema auto-upgrade, migration or silent evidence repair was introduced.
- **P3 local exploration, checked:** explicit `mode: "room"`,
  same-space earned waypoints, material observation decisions and original limits.
  A retained 21x21 window prevents oscillation or target loss during path refills.
  Local scope exhaustion is not a room/floor completion claim. The actual-App
  service case proves four local moves and one source-bound material stop with
  no per-cell planner entry; it does not prove sustained multi-room coverage.
- **P3 explicit chest, checked increment:** inspected current-tile selection,
  effect-free admission, confirmed custody, atomic shared loot/quest effect,
  sanitized event and explicit decision. The 17-case native fixture and complete
  32-case actual-service cohort pass; collection and continuation custody are
  covered, not quest-return completion.
- **P3 accepted journal, bounded increment:** explicit current-floor accepted
  pages/detail, private canonical row witnesses, exact historical replay and
  old/narrow-grant refusal. No hidden geometry/content reads or new persistent
  store. Original launch/result byte limits remain. The service proof queries
  one accepted quest and parks on the original tile; it is not meaningful return.
- **P3 Agentica, checked return boundary:** explicit owner selection, scoped
  objective inspection, shared-game collection, nonzero earned return and
  source-bound host completion. Native replay retains the original answer after
  custody changes; current stash contents do not satisfy a fresh check.
- **P3 Agentica, checked cold-start composition:** both authored canonical worlds
  start without discovery movement, follow earned branches, explicitly collect
  the ordinary item and return under host proof. The actual-service cohort has
  36 cases; the scoped objects query and small offline policy do not establish
  strategic model reasoning or sustained room coverage.
- **P3 Agentica, checked historical query:** on-demand immediate-predecessor
  notice retrieval, retained source proof and no-effect changed-sight replay
  pass for same-owner continuation, inspected adoption and one transferred
  operation's progress source. No persistent context dump or format change.
- **P3 Agentica, remaining:** qualify sustained coverage, broader history
  source/replay combinations, then the complete two-dungeon matrix.
  Explicit guild reward
  tooling is a later RPG workflow, not implied by retrieve-return completion.
  An empty current-sight page is not proof that the floor is fully explored.
  Preserve earned-only room/map/frontier scope and explicit
  voluntary interactions. Keep tested recovery usable during quota failure;
  never equate a navigation/root ACK with clearance of every remote action.
  Admission is not arrival; reconnect is not adoption; navigation is not loot.
- **P4 source retirement, checked:** disconnected preview screens, stale route tests, standalone
  expedition writer and its legacy-format validators, standalone launch journal,
  standalone directed-v1 store, general/directed stream Agentica writers and the
  remaining stream/directed-stream/topology stores removed. The old RPG writer
  and its exclusively dependent adapters/fixtures are now removed too. One
  production database opener remains. Shared domain algorithms and the radix
  tree are retained. Deleting old-path tests does not establish canonical parity.
- **P5 partial:** actual-App desktop/mobile, recovery, Auto and 1/8/16-floor
  movement checks pass. Bounded two-floor revisits/reload/tab takeover preserve
  real content and original evidence; fixed-depth 128-move history growth has
  native per-action I/O measurements. Active Agentica multi-controller/capacity
  composition and the complete two-dungeon matrix remain mandatory, not inferred
  from these small samples or the prior isolated recovery passes.

Earlier integrated check (`0ca7fb9`, 2026-10-15): **2,734 unit PASS / one optional
probe SKIP; 65 manual-save, 14 actual-App and seven real-service native cases
PASS; production build PASS**. Earlier in this increment, 24 transfer and 116
original-operation native cases passed. The actual save UI now exposes its
16-slot limit without withdrawing control; loading a malformed candidate validates
its bounded projection inside the transaction before replacing healthy roots.
No paid calls or end-to-end mounted Agentic Play claim. Earlier retirement test
counts are historical; removed legacy-only tests are not counted as current proof.

The target database is `maze-battle` version 9 with `meta`, `heads`, `records`,
`nodes`, `receipts` and `operations`. The opener discards earlier store layouts without reading
their values. The actual App now uses this opener; all former query routes mount
that same App. Retired stores are never used as fallback readers.

P2a keys in the world area are `dungeon` (world identity/deepest generated level),
`dungeon/<level>` (pinned recipe and bounded generation counters), and independent
`space/<id>`, `ports/<id>`, `connection/<id>`, `join/<id>`, `frontier/<sequence>`,
`bucket/<row,column>`, `mutation/<space>/<entity>` and `stairs` records beneath
that level. Space recipes pin `stone-room-v1`; generated links are separate from
the immutable geometry. A growing room's pending sockets are not openings.
The space loader reads one room and at most four connections. A doorway resolver
loads at most its two endpoints; no floor history, room list or full grid is built.
Generation prefetches at most 25 occupancy bins, independent of retained depth.
Missing established geometry/endpoints are errors, never new-generation requests.
These are internal authoritative reads; they are not player/agent observations.

Room roles occupy `dungeon/<level>/roles`, with pinned generation identity and
bounded preparation progress. Roster keys and current limits are in the
[entity evidence report](reviews/issue-11-roster-and-roles.md). Item membership
uses snapshot-specific indexes and stable insertion order; those indexes must
resolve to the same primary record version. Item effects reuse the actual domain
reducers on a bounded projection, never a fake maze or old-save conversion.

Floor qualification lives under `dungeon/<level>/quality` with bounded progress
and separately addressed per-room reductions. A primary radix-prefix witness pins
the immutable space/ports/join/connection namespaces and current scratch namespace.
Changing any of those records invalidates the proof; unrelated item, content or
other-floor writes do not. This is copy-on-write record identity, not a new
cryptographic disk-integrity claim. Scratch costs O(rooms), retained under the same
explicit logical quota; no pruning/replay-source deletion is introduced.

Pinned room content uses `dungeon/<level>/content/<spaceId>` plus a compact
preparation cursor and `dungeon/<level>/chest/<chestId>`. Each treasure room has
one cache on its walkable center. The new module content policy does not reconstruct
the old full-grid scatter pass. Guild templates/rewards and ordinary loot generation
are shared with the actual game. `contract/<id>` records posted offers and explicit
acceptance; `quest/<id>` stores progress, claim state and award-source identity.
Indexes bound queries by floor/status/target. An opened cache no longer offers a
new fetch quest. Posted engine metadata is NOT an earned observation or a provider
capability. A separate disclosure projection is still required at P3 adoption.

Transaction-local immutable node/record caches avoid repeatedly fetching the same
radix branches for a valid large pack. They are bounded by the transaction's native
read/byte allowance, never shared between transactions, and never republished as
changed world data.

Earned observations live under `perception/observation/<sequence>` in knowledge,
with at most eight sixteen-cell chunks per radius-seven receipt. Remembered 4x4
blocks and first-observed room membership use independent `perception/cell/` and
`perception/room/` records. The game checkpoint pins their primary namespace plus
the latest source ID/sequence. Detail queries read 1-64 requested cells; room
queries page at most sixteen observed identities. Neither reads world truth.
Complete bounded sight receipts still grow per action under the enforced quota;
unchanged remembered blocks do not. This is not infinite retention or compaction.

Normal command admission stops before the logical reserve. A host-only Stop or
takeover fences the old epoch and enters `stopped`; repeated emergency actions
cannot consume reserve indefinitely. Resume must pass normal admission again.
Default accounting limits are 256 MiB total / 8 MiB reserve; all history remains
immutable until explicit reset. These are logical charges, not physical disk
capacity guarantees. Browser quota errors must still abort every staged effect.

Admission additionally reserves 128 KiB-4 MiB of terminal allowance and 16 KiB
for acknowledgement, with at most 16 outstanding reservations. Normal commands
cannot consume these funds. A terminal commit releases only its own allowance;
its actual retained-byte growth must fit that allowance. Cancellation and
acknowledgement cannot carry world callbacks and remain available while stopped.
Agent-linked operations pin `verified-host` acknowledgement policy in admission
and the operation row. Their ACK retains one compact proof in the immutable request,
verified using bounded execution/source reads only. Generic ACK cannot release
these reserves. Retry-only reads cannot create an ACK; a failed uncommitted original
requires its verifier again. Historical receipt validation enforces the same policy.
Completion after takeover requires explicit adoption and normal admission.
Operation control remains live across historical world reads; loading old world
roots must never rewind custody. The bounded head allocation map independently
anchors each funded operation's revision and remaining bytes. Immutable source
receipts must validate completely before release, including their original inputs.
Game-level delivery, manual-load cancellation and Agentica bindings remain P3/P5.

Each checked slice is committed/pushed. P1-P4 are a coordinated replacement,
not permanent transitional adapters or a second runnable game. Do not declare
the issue solved while any normal step still clones historical floors.

## Reset Boundary

The recovery action clears and seeds **only the current `maze-battle`
database** in one transaction, using a new game and owner identity. Before any
seed/clear, that same transaction validates the compact current head and exact
funded operation/receipt witnesses. Any unresolved `verified-host` allocation,
including terminal-but-unacknowledged work, refuses reset. An ambiguous current
ledger also refuses; damaged observation history alone does not prevent reset.
This is a bounded current-obligation guard, not a scan or preservation of old
saves, nor proof of arbitrary remote-session clearance. Obsolete schemas are
still disposed without reading their values. The action does not
claim to perform the final incompatible-schema cutover or delete the separate
experiment databases. No generic `localStorage.clear()` or origin-wide deletion.

At cutover, use an exact allowlist of the six database names above. The retired
original importer stored markers in `maze-battle.meta`, not a seventh database.
Close handles and handle blocked deletions visibly. The original localStorage
namespace was `DC-GAME-SAVE-SLOTS` and `DC-GAME-` plus an uppercase save-slot name;
restrict cleanup to verified game-owned keys, never generic storage clearing.
No reads of those values may seed a new game. New-schema startup
must deliberately offer/reset incompatible own schemas; it must not silently
repair arbitrary corrupt data or touch unrelated applications on the same origin.

The [explicit interaction operation prerequisite](reviews/issue-11-explicit-interaction-operation.md)
now composes one-shot shared quest acceptance, chest loot and reward claiming with
canonical operation custody, atomic host evidence and effect-preserving recovery.
Its chest path is now a [mounted Agentica capability](reviews/issue-11-agentica-chest-interaction.md):
disclosed target binding, verified service custody, sanitized results and fresh
decision publication use the actual game. Quest acceptance/reward capabilities
remain unmounted; their disclosure and location policy must not inherit Auto's
automation authority. Navigation still does not authorize voluntary interaction.

## Acceptance Not Yet Met

The historical 2,667-unit/196-native/14-App evidence qualifies the prior build
only. Current manual/Auto and depth samples are documented above, not extrapolated
to arbitrary history. Initial canonical Agentica execution, explicit same-owner
continuation, inspected new-owner adoption and source-bound frontier approach
are now mounted; explicit local exploration/material decisions have runtime,
native and actual-service proof. Explicit collection of a preaccepted ordinary
quest item, nonzero earned return and a separate host completion check are now
checked, including the small authored cold-start A/B composition. The full
cross-surface knowledge/recovery matrix and multi-controller depth/revisit/Q
remain mandatory. The actual-App
execution/recovery proofs do not qualify those remaining flows or full RPG parity.
Pending-action recovery now has exact durable rediscovery
proof, not arbitrary session cleanup or permission for automatic continuation.
The service page response is bounded, but its capped ledger is still read as a
whole; this is not a history-independent service-I/O claim. No paid-model test is included
without separate limits/authorization. Issue #11 is not complete.

## Finite Goal Closeout

2026-10-23 progress checkpoint: **Sprints 1, 3 and 4 are complete at their declared
bounded evidence levels**; Sprints 2, 5 and 6 remain open. Independent
reconciliation at `bbdadf1` found no additional Sprint-1-specific claim; the
[S3 matrix audit](reviews/issue-11-recovery-matrix.md) accounts for its eight
distinct new recovery cuts and retained takeover/duplicate/cleanup proofs.
The [capacity kernel increment](reviews/issue-11-capacity-kernel-integration.md)
now has local generation-allocation binding through `0755438`. The reproduced
authored A/B quota defect passes at the shared threshold and its two neighbors;
this is not whole-S4 qualification. Current local evidence is 127 focused unit
passes, 21 native capacity passes and one paired threshold test. The first two
runs tested the working integration subsequently committed at `f90567e`; the
threshold run records `0755438`. These are separate cohorts, not a final suite.
Artifacts: `test-results/private-preparation-parent-first.json`,
`test-results/private-preparation-native-first/results.json`, and
`test-results/private-allocation-corpus-first/results.json`.
That planning checkpoint was published at `1d00fff`. The subsequent
[preparation and restore integration](reviews/issue-11-private-preparation-integration.md)
qualifies next-floor allocation and adds receipt-bound restored-world identities.
Completed saves can generate later floors with new funding while earlier charges
remain retained; unfinished current-floor saves explicitly refuse. Full units
now pass 5,017 with the same existing optional skip, and both focused actual-App
cold-start service journeys pass. The subsequent
[command-work qualification](reviews/issue-11-command-work-qualification.md)
closes the declared S4 read/write/byte thresholds, diagnostics and controller
cohort. Generated endurance and frozen final qualification remain open.
The [S2 integration](reviews/issue-11-s2-integration.md) now closes the bounded
wire/consumer gate, including independently bound original deadlines and explicit
source-supported delivery correspondence. The
[generated endurance cohort](reviews/issue-11-generated-endurance.md) adds retained
depths 1/8/16, 1,024-command histories for two seeds, paged earned-room returns,
and actual-App offline takeover/adoption. Child evidence passes; parent combined
qualification is underway on frozen source `585f507` in a fresh checkout.
The remaining range is now **10-20 focused hours**: S5 integration 2-4h and S6
8-16h. This credits checked S2 and generated fixture work, not final acceptance.
There is no production change in these last S2/S5 increments; runtime remains
the checked `5125cbe` lineage. Retained failed attempts and exact limits remain
in the linked reports and the [S6 rolling ledger](reviews/issue-11-s6-qualification.md).
The original planning checkpoints and their uncertainty remain below.
No native >64-step proof
or impossibility theorem is implied: the declared alternative is the retained
128-seed representability search and its explicit limitation.
[Earned room/connection queries](reviews/issue-11-earned-graph.md) add
source-bound room-only pages and explicit space-link reads; the subsequent
room-map and sustained-journey increments are recorded below. A native
160-move case exposed a real evidence-read-budget failure. The
[selective-proof repair](../tests/e2e/canonical-exploration-prefix.budget-report.md#parent-integration-qualification)
now passes that original native case, retaining integrity checks, the original
journey and the 256-read/1 MiB limits. Full units pass with two workers; this
increment does not establish the missing >64-step route or complete Sprint 1.
The frozen parent `96facb3` now passes the full **43-case real-service** cohort
(986.771s), with pinned Agentica source and the explicitly alternate SDK10.0.401.
The [room-map integration](reviews/issue-11-room-map-integration.md) now combines
passage collapse, public `connections` tools, mandatory accumulated-memory proofs
and explicit room-map/recall UI. Native checks cover the unchanged 160-move case,
memory-proof rollback with funded custody, an earned connection query/replay,
paged UI recall/resize, paired corpus and actual-App revisits. Missing older
edges refuse rather than appearing unexplored. At frozen `3e04e91`, integrated full units pass
**4,747 / one existing optional skip** and the full actual-App/pinned-Agentica
service cohort passes **43/43** (1,006.146s), using the separately labeled
SDK10.0.401 environment. The integration report retains exact provenance and
intermediate failures. Desktop/phone production preview smoke also passes on
isolated port 5199; the owner's existing preview/data remain untouched.
The [actual-App room journey](../tests/e2e/canonical-start-service.room-journey.md#parent-integration-2026-10-22)
now composes later-page off-window room choice with a 22-step retained journey,
explicit collection, earned return and host/service completion in both authored
worlds. Frozen parent `6f5508f` passes **45/45 actual-service cases** (1,452.803s),
including B's arrived-boundary reload/adoption and exact replay. This crosses the
16-step prefix, not a native >64-step route. Generated topology/paging and active
step recovery remain separately bounded requirements, not claims from that run.
The [paired actual-App UI checks](../tests/e2e/canonical-corpus-ui.report.md)
pass desktop/portrait dungeon, room map and fog comparisons before lawful sight
divergence, plus zero-write DB checks. Parent dedicated UI **2/2** and affected
native corpus **8/8** pass; complete planner frames have their separate gate below.
[Controlled A/B query evidence](../tests/e2e/canonical-corpus.disclosure.report.md)
does not finish the all-surface information gate. The
[clean locked install repair](reviews/issue-11-clean-locked-install.md) qualifies
that prerequisite only, not the frozen final candidate. Issue #11 and the goal
remain open. Its owner-approved disposable-old-save boundary supersedes the
original goal's legacy-save preservation wording; no silent owner reset is allowed.

2026-10-20 planning checkpoint, independently reviewed against candidate
`316212d`. Remaining estimate: **40-80 focused engineering hours**, roughly
**5-10 working days**, with **10-15 days** contingency for newly demonstrated
runtime defects. These are planning ranges, not a promised completion time or
an extrapolation from test duration. The active goal remains incomplete.

Planning-checkpoint baseline: full units at `316212d` **4,485 PASS / one existing
optional SKIP**; **101 native** frontier/exploration/known-route regressions;
production/fixture types and isolated build; full actual-App/pinned-service
cohort at `16279ff` **43/43 PASS** (1,065.74s). Intermediate failures and the
test-only fixes are retained in the linked reports. No paid provider was used.

The six bounded sprints below replace an open-ended interpretation of "full
matrix." Do not run every fault at every checkpoint. Use a declared set whose
cases collectively cover the listed invariants, preserving failed attempts.
Parallel fixture/review lanes are appropriate; integrate and qualify one immutable
candidate at a time. Checked increments continue to be committed and pushed.

| Sprint | Deliverable and exit gate | Remaining estimate |
| --- | --- | ---: |
| 1. Sustained exploration: COMPLETE (bounded) | Earned room/connection scopes, separate paged desktop/mobile recall, and actual-App off-window selection followed by 22-step travel, explicit collection and earned return pass. Original 160-move setup/refill proof is repaired under unchanged limits. The finite 128-seed search documents >64 not found, not impossible; abstract >64 units are not native qualification. Multi-page generated connection endurance remains Sprint 5. | Complete |
| 2. Information boundaries: COMPLETE (bounded) | Scoped queries, history, UI and complete planner frames pass at their recorded levels. Wire comparison through the first lawful A/B difference retains strict ordered failures, checks exact original custody/deadlines, and permits only source-supported ACK/status/dispatch correspondence. Actual SDK consumers qualify those orders and terminal controls; independent review closes the deadline finding. Final combined rerun remains S6. | Complete |
| 3. Active-work recovery: COMPLETE (bounded) | The independent matrix reconciliation accounts for outbound/return, pre-ACK/transfer, accepted/unaccepted collection/completion, takeover, duplicates, capacity and funded cleanup. These are incremental retained proofs, not an arbitrary-crash claim. The final combined rerun belongs to Sprint 6. | Complete |
| 4. Capacity, work and controller parity: COMPLETE (bounded) | Allocation binding, index guards, next-floor preparation, restored-world fresh funding, atomic rollback/replay, App/service composition, authored read/write/byte threshold neighbors, diagnostic checks and Manual/Auto/Agentica effect parity pass at their recorded levels. Final integrated rerun remains S6; generated-world bounds remain S5. | Complete |
| 5. Generated-world endurance: INTEGRATION | Seven declared native cases now cover two generated seeds, retained depths 1/8/16, two separate 1,024-command histories, paged off-window recall/returns, and offline active two-tab recovery. Original observations/receipts and admission/work limits are retained. Parent combined run remains; these are separate bounded samples, not played deep descent, arbitrary histories, or live-service custody. | 2-4h |
| 6. Frozen-candidate qualification | Clean locked dependency installation, full units, production/fixture types and isolated build; complete real-service regression plus new cases; affected native suites and known-destination regression; desktop/mobile checks; source/runtime hashes and a gate-by-gate PASS/FAIL/NOT RUN report. Include review/fix/rerun allowance, not only runner duration. | 8-16h |

Execution order: S2 and S4's bounded gates are complete. Integrate S5 and qualify
frozen source `585f507` in an isolated checkout with its own locked dependencies.
S6 records a deduplicated discovered manifest before execution. Parallel review/fixtures can shorten the
critical path, but dependency-sensitive integration and shared-port suites remain
serialized. Do not replace these gates with another unrestricted test matrix.

### Delivery Forecast And Sprint Handoffs

The remaining 10-20 hours are focused engineering, integration and review effort,
not a wall-clock countdown or a sum of runner durations. Plan on **2-3 eight-hour
workdays**, with **4-6 workdays as a contingency envelope** if new defects are
demonstrated. This is not an overnight completion promise. Parallel work reduces
waiting where dependencies permit, but does not remove the serial S5 -> S6
critical path. Re-estimate after the frozen-candidate gates or a newly demonstrated
runtime defect, not after every green focused test.

| Milestone | Lane and concrete handoff | Completion decision |
| --- | --- | --- |
| M1: information and capacity qualified (bounded complete) | S2/S4 integration and independent deadline review pass at their recorded levels. Preserve raw strict failures, source correspondence, allocation/work-bound evidence and reports. | S6 still reruns required integration on the frozen candidate. |
| M2: generated endurance qualified | Use the same App, canonical store and existing offline Agentica service. Freeze a small deterministic cohort before running; isolate topology growth from history growth. Publish raw I/O, graph paging, revisit and active-owner recovery results. | S5 passes its declared limits without hidden routing, fixture teleportation during measured journeys, whole-history scans or altered admission bounds. |
| M3: provider-free candidate qualified | Freeze Maze and Agentica source, dependencies, SDK and the deduplicated test manifest. Run S6, review failures, and rerun affected gates after repairs. Push the exact candidate and acceptance report. | All mandatory provider-free gates pass on compatible recorded identities. Earlier partial runs do not substitute for the final combined result. |
| M4: separately authorized live qualification | After M3, obtain model, cumulative call/token/cost/time limits and stop rules; run the two-dungeon live gate and report choices, tools, usage, latency and completion separately. | Actual provider evidence, not the offline planner, decides this gate. No paid run is currently authorized. |

Initial bounded S5 manifest: two deterministic generated seeds, retained-depth
samples at 1/8/16 floors, and one fixed-depth 1,024-action history sample (versus
the existing 128-action check). Select and record the seeds before measurement.
Add one generated graph case spanning at least two room and connection pages,
two outward/surface-return cycles, and one active Agentica two-tab takeover.
These are separate targeted checks, not the full Cartesian product. Preserve
the already-earned topology and original receipts; measure native object-store
operations, serialized/logical bytes, database growth and latency distributions.
If the required graph is not representable in the selected cohort, report that
gap and adjust the documented cohort explicitly; do not manufacture disclosure
or silently broaden a search. Existing read/payload/admission limits remain in
force. Sixteen retained floors do not imply sixteen complete played journeys
fit within the same capacity reservation.

S6 freezes the discovered test list, not a promised total count. Include the
48-case historical service baseline plus the newer distinct recovery cases,
deduplicating overlaps; full units; affected native persistence, capacity,
frontier, corpus, known-destination and actual-App suites; production/fixture
types; clean locked install/build; desktop/portrait resize and controls; and the
eight-cut recovery matrix. Keep the existing optional unit skip explicit.
The previous full service run took about 41 minutes; that is one runner's time,
not the remaining engineering estimate. The current runtime has not yet passed
that entire combined gate. Record the alternate .NET 10.0.401 environment
separately from repository pin 10.0.302 unless the latter is actually tested.

Reserve an additional **2-4 focused hours** for a bounded live-run setup,
execution and report after authorization, excluding any newly discovered repair
work. This is a scheduling allowance, not a provider-spend grant or a latency
benchmark. Full RPG parity, combat ownership, broader quest/town automation and
resource-pressure balancing require separate scoped estimates after this goal;
they are not hidden additions to the 28-56-hour closeout.

Closing reports distinguish: implementation complete, provider-free qualified,
live-model qualified, and owner accepted. Do not mark the umbrella goal complete
merely because M3 passes while a required authorized live gate is still pending;
publish that boundary explicitly. No issue closure, merge, preview replacement,
owner-data reset or production deployment is implied by this forecast.

### Closing Test Manifest

| Gate | Required final observation |
| --- | --- |
| Information | Authored A/B current-room/map/quest/objective/history queries, planner inputs, wire/status/diagnostics and human fog/UI stay equivalent through the common earned prefix; the first difference has legitimate observed evidence. Raw physical timing need not match. |
| Capacity | Actual A/B admission at common threshold neighbors no longer depends on private construction bytes. Initialization/preparation provenance, no double allocation/consumption, exact retry/reload/restore, truthful native byte accounting, invalid-policy refusals and funded Stop/cancel/verified ACK all pass. |
| Shared gameplay | Manual, Auto and agent effects use the same explicit interaction command; movement alone never opens a chest. Existing ordinary quest collection/earned return and known-destination tests remain green, without adding full guild reward or combat policy. |
| Endurance | Fixed generated shallow/deep topology samples, a larger fixed-depth action history, repeated surface returns, multi-page room/connection recall and active two-tab Agentica recovery preserve immutable sources and changed gameplay. Instrument native reads/writes/logical bytes/latency/growth; ordinary moves do not scan or rewrite history. |
| Recovery | Rerun the declared eight-cut collection/navigation/completion matrix plus existing takeover, exact duplicate, quota and funded cleanup regressions on the final build. No new start or duplicated effect may replace original-attempt reconciliation. |
| Build and review | Clean locked installation, full unit suite, production and affected fixture types, production build, affected native suites, full actual-service suite and desktop/portrait UI/controls pass on recorded source/runtime identities. Preserve every failure and explain any existing optional skip. |

The recorded complete service baseline is 48 cases; later focused cuts and the
new capacity fixtures must be collected into the final manifest without adding
overlapping counts. Freeze the exact discovered test list with the candidate.
Do not treat the historical 4,783-unit pass, the current 98-unit/83-native/16-native
passes, or an individual agent's report as that final combined result.

After S6, publish one acceptance report mapping D0/D1, A0-A3 and Q to evidence,
including this issue's normalized persistence, backtracking, bounded local work,
reset and dead-writer-removal requirements. This completes the **provider-free
bounded noncombat vertical** only if every mandatory gate passes. A separately
authorized live-model A/B gate still must measure actual choices, tools, cost,
latency and completion; it cannot be silently replaced by an offline planner.
Combat, full RPG parity, general mechanism causality, compaction and unlimited
world coverage are later goals, not additions to these remaining sprints.

Already checked evidence is reused at its declared level: authored A/B explicit
collection/earned return; before/after-collection settled-boundary quota/reload;
same-owner/adopted/one-transfer history; two-floor manual revisits/takeover;
and separated 1/16-floor plus 128-move App I/O. These do not establish active-step
fault recovery or the complete cross-surface information gate.

Room-detail and known-room/connection map scopes are required operations, not
an always-present map dump; their pagination and distant recall cannot be
substituted by bounded coordinate windows. Unlimited room coverage is a separate
deferred capability, not an excuse to omit these scoped operations.

Sprint 1 source handoff at `16279ff`: existing `KnownRoom` membership and four-node
`map` pages describe observed **spaces**, including passages. There is no earned
adjacency index or sourced room/passage classification. An honest space-link
pager is a useful intermediate, not proof of the requested room-only map.
Store bounded reciprocal links only when ordinary observation earns them,
under the same knowledge witness, with stable endpoint identities and exact
source evidence. Query one known space's links explicitly; never read world
ports or scan historical rooms to answer it. Add earned classification before
collapsing passages into room-level connections; do not infer it from IDs.
Historical replay must return its original receipt without refreshing unseen
facts. Missing/inconsistent provenance refuses rather than becoming an empty
graph. Preserve existing disclosure, transaction and payload limits. UI graph
selection and desktop/mobile parity remain part of the scoped-map exit gate,
not a claim established by backend readers alone.

Each remaining test must name its missing invariant before it is added. A new
unrelated feature, arbitrary ancestry depth, unlimited room coverage or another
scenario without a new required claim does not extend this closeout implicitly.
Keep any demonstrated blocker explicit instead of weakening the acceptance.

Completion means the bounded noncombat vertical and the required canonical
persistence acceptance are qualified on a frozen revision, with evidence links
and remaining limits published. It does not mean combat, full inventory/town
parity, autonomous guild acceptance/rewards, resource-pressure balance, remote
causal mechanisms, compaction or infinite-world performance are complete.
Physical-disk exhaustion and equal real-world network latency are not claimed;
atomic failure handling and truthful work disclosure remain mandatory.

The provider-free report must explicitly distinguish the isolated .NET 10.0.401
environment from Agentica's repository pin 10.0.302. A live-model A/B gate remains
separate: obtain explicit model/cumulative-cost/call/time limits and authorization
first, then report actual choices, usage, latency and outcomes independently.
No paid run, merge, deployment or owner-database reset is authorized by this plan.

### Next Information-Boundary Cohorts

Read-only source reconnaissance at `96facb3` narrows Sprint 2 to three distinct
claims, not another unrestricted matrix. Begin after the room-query contract is
stable so the same scopes are tested once.

1. Extend the existing paired fixed-action collector with `quests`, `quest`,
   `objective` and `decision`, a remembered-address query and an opaque
   unknown-address result. Existing `cell/frontiers/map/links/room/objects` pages already have
   paired common-prefix coverage. Preserve raw output and exact work metrics.
2. Compare one earned movement prefix's admission/progress/terminal/refusal
   outputs, plus camera/overview pixels, fog and visible status at the initial,
   last-equal and first-lawfully-divergent checkpoints. Use fixed clock/camera,
   not hidden-route-derived limits. Existing separate map invariance is not this
   authored A/B composition.
3. Capture bounded actual fixture-planner request context, context frames and
   available tools at `CreatePlanAsync`/`RefinePlanAsync`. Compare initial,
   refinement and first explicit successor inputs. Wire traffic alone does not
   prove the complete planner frame. Captures are evidence only, never input to
   planning; preserve the lawful observation that permits later divergence.

The first cohort now has [native dispatched-query evidence](../tests/e2e/canonical-corpus.queries.report.md):
three paired cases added, eight combined browser cases pass. Exact pre-divergence
frames/work, pending objective, opaque negative probes and selected remembered
cell identity are checked. Integrated room connections now extend the same
paired cases to thirteen actions: select a source from the public map, verify
partial versus earned complete connections, and require identical opaque
unknown/passage refusals. All eight combined native cases pass (78.547s), with
exact pre-divergence frames/work and no domain mutation. Decision history here
is initially unavailable; nonempty successor history and paged connections
remain outside this query cohort. Complete planner frames are checked in the
separate increment below. This is offline admission with real dispatch, not
another actual-service or model test. The separate actual-App
desktop/portrait UI gate now passes without normalization or native writes;
its integration reruns the same eight corpus cases successfully (130.810s).

### Active Recovery Increment

The 45-case journey proof reloads after arrival, not during an unfinished
navigation. Source review finds two distinct mounted gaps: recovery exposes
Stop/reconciliation but does not yet call the existing original-operation
transfer path; after such a transfer, Continue still compares original action
epochs with the new owner rather than validated effective custody. Existing
post-transfer history evidence reloads again and does not close this path.

The [mounted repair](../tests/e2e/canonical-start-service.active-journey.md) now
adds inspected explicit unfinished-operation resume, preserving exact original
action/grant/target/progress/deadline/limits. Later explicit Continue derives
effective custody from the validated transfer/terminal chain. The committed
progress ACK and both kernel adoptions remain mandatory; ordinary epoch checks
are not weakened, and inspection never resumes movement or cognition.
The isolated lane's two actual-App outbound/return cases pass without a second
reload, with exact replay and one pack item. Independent source review found no
actionable defect. The [integrated frozen 48-case service run](reviews/issue-11-active-recovery-integration.md)
passes with no failures, skips or retries (2,459.005s).
The [next integrated recovery increment](reviews/issue-11-preack-capacity-integration.md)
now passes six actual-App/service cases, including native reload before a
committed navigation step's ACK and lost transfer acceptance. Accepted-but-lost
collection/completion deliveries also pass. The [pre-acceptance integration](reviews/issue-11-preacceptance-integration.md)
then passes both earlier delivery cases and both unaccepted delivery cuts on
one frozen candidate. The [independent matrix reconciliation](reviews/issue-11-recovery-matrix.md)
now finds no additional missing cut in declared S3. Final-candidate regression
remains; these focused passes are not all-goal qualification.

[Complete planner input capture](../tests/e2e/canonical-start-service.planner.md)
is an isolated test-only lane, not a new production context store. Its bounded
pre-policy captures include initial, refinement and first explicit successor
windows. Independent review strengthened compact/full reference consistency
and binding to actual service-created run IDs, original admission and wake.
The 13 comparison/wire regression checks and integrated native pair pass. All
16 complete inputs retain raw evidence; the first seven match under declared
metadata allowances, and the eighth differs only in newly earned frontier
evidence. This closes the bounded planner-frame gap, not all exposed-surface
information pairing. Neither increment authorizes provider calls.

### Closing Sequence And Estimate Discipline

2026-10-22 closeout increment: [integrated evidence](reviews/issue-11-corpus-closeout-integration.md)
repairs zero-step custody-probe identity in historical decision reads. The paired
navigation/nonempty-history cohort now passes both native cases, including exact
retained replay and source refusals. Existing payload/query checks pass on the
integrated candidate. The bounded payload claims have evidence; overall
information noninterference is NOT complete because of the capacity defect below.

Two actual-App/service cuts now pass after lost accepted interaction-progress ACK
and lost accepted completion confirmation. Revision 49's integrated six-case
increment additionally closes the declared pre-ACK navigation and lost-transfer
cuts. Revision 50 separately qualifies pre-acceptance interaction/completion
result loss, including exact retained-completion reconciliation after local Stop.
The three-controller chest-effect cohort passes with independent-review repairs
for complete inventory conservation and pre-reload checkpoint/root preservation.
Neither report claims all-controller feature or policy parity.

The [controlled quota characterization](../tests/e2e/canonical-corpus.work.report.md)
changes the remaining S4 work from a suspected threshold channel to a demonstrated
FAIL: identical public state and common capacity admit A's ordinary move but
reject B's due solely to four private world bytes. Full native-store rollback
passes. A green characterization runner is not a green information gate. The
[next capacity repair](reviews/issue-11-private-world-capacity-plan.md) separates
truthful measured occupancy from deterministic private generation allocation;
its first obligation is a useful, source-derived storage bound. No runtime quota,
schema, reserve, SDK or old-save behavior changed in this increment. The next
checked increment adds pure capacity arithmetic and generated-writer bounds,
plus exclusive Auto floor batching; those helpers still have no runtime admission
callers at that revision. Revision 51 adds the checked kernel admission/cleanup
gate, not allocation binding, and closes S3's matrix reconciliation. Raw-I/O
disclosure, domain capacity repair, S5 endurance and S6 qualification stay open.
Do not automatically credit test counts against a demonstrated accounting defect.

The revised 32-64 hours are remaining implementation, review, integration and
debugging effort, not suite runtime or a commitment to unattended wall-clock
completion. Four to eight eight-hour working days is the arithmetic equivalent;
allow eight to twelve working days if the bounded cohorts expose further
integrity/recovery defects. The reduction from the original 40-80 range credits
Sprint 1's bounded completion; partially passing Sprint 2/3 work is not treated
as whole-sprint completion. Confidence is moderate on scope and lower on
defect-driven timing. Revision 50 rebalances, rather than restarts, that range:
S2 2-4h, S3 2-4h, S4 14-28h, S5 6-12h, S6 8-16h. Checked recovery reduces its
remaining allowance; demonstrated capacity failure and separate work-budget
exposure now dominate the risk. Re-estimate when Sprint 4's native admission and
funded-cleanup gates pass, naming any newly discovered defect that changes it.
Do not silently add features or expand the matrix to every possible combination.

2026-10-23 re-estimate after the native kernel gate: **28-56 remaining focused
hours**, comprising S2 2-4h, S4 12-24h, S5 6-12h and S6 8-16h. The 4-8h reduction
from revision 50 credits the completed 2-4h S3 reconciliation and 2-4h kernel
admission/cleanup increment, not unimplemented allocation binding. Plan around
four to eight eight-hour working days; retain eight to twelve working days as
defect contingency. These are engineering effort ranges, not a promise of
unattended overnight completion. Capacity repair is the dominant uncertainty;
re-estimate after its original A/B FAIL becomes PASS and the generated endurance
sample runs. Record any new blocker rather than expanding the finish line.

1. Retain the checked integrated memory/room-map and authored scoped-room journey
   evidence. Close the remaining declared representability/topology boundaries
   without substituting the 160-move prelude or abstract >64-step unit for an
   actual native route. Keep manual recall distinct from service-directed travel.
2. Close the declared information, active-work recovery and controller cohorts.
   Each case must identify its missing invariant. Include actual successor
   history, not only an empty initial history query; keep complete planner-frame
   capture distinct from browser wire traffic.
3. Run the declared generated depth/history/revisit sample with actual IndexedDB
   instrumentation. Record capacity failures and current funded obligations;
   unchanged old records are different from unchanged current knowledge roots.
4. Freeze one source revision after independent review. Clean locked install,
   full units, production and affected fixture types, production build, all
   affected native suites, known-destination regression, full real-service
   cohort plus additions, and desktop/mobile visual/interaction checks must
   qualify that revision. Historical green runs do not substitute for this.
5. Publish the gate matrix, source/runtime hashes, raw evidence locations,
   retained failures and limits. Keep the issue open if any required gate is
   FAIL, UNKNOWN or NOT RUN; do not reset the owner's database to make it pass.
6. Only after separate authorization, run the live-model two-dungeon gate with
   explicit model, call, cumulative cost and time bounds. Report genuine model
   choices, tool use, outcomes, latency and cost separately from the provider-free
   result. This waiting/authorization interval is not included in engineering
   effort above.

The previous runtime baseline at `3e04e91` contains 4,747 passing unit tests
(one existing optional skip); its strengthened journey fixtures at `6f5508f`
pass 45 actual-service cases. The integrated recovery runtime at `0c86d11`
passes 4,783 units with the same optional skip, production/fixture types, build
and paired desktop/portrait UI; the later fixture-only review corrections at
`bbdadf1` pass the frozen 48-case service run. Remaining work is defined by
these acceptance claims, not a promise that a fixed number of additional tests
will finish the goal. Full RPG feature parity, combat, remote mechanisms and
unlimited-world/compaction work remain outside this closeout.
