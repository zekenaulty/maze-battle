# Canonical Game Persistence

Issue: [#11](https://github.com/zekenaulty/maze-battle/issues/11). Revision 36,
2026-10-20. Status: the actual App now uses canonical storage for the checked
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
original publication, with bounded pack/stash custody readers. It is a foundation,
not mounted objective inspection or host completion. Those operations and a
nonzero actual-App return proof remain next; no reward claim is implied.

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
- **P3 Agentica, remaining:** sustained coverage/remembered off-window return,
  observation-driven intention revision and the integrated ordinary quest loop.
  Bind an explicit quest objective to carried-item evidence and an earned return
  destination, then qualify nonzero return and explicit guild reward claims.
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
  movement checks pass. Final multi-controller/revisit/capacity and two-dungeon
  qualification remain mandatory, not inferred from focused passes.

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
quest item is now checked; the integrated objective/return/completion loop and
full multi-controller depth/revisit/Q
remain mandatory. The actual-App execution/recovery proofs do not qualify those
remaining flows or full RPG parity.
Pending-action recovery now has exact durable rediscovery
proof, not arbitrary session cleanup or permission for automatic continuation.
The service page response is bounded, but its capped ledger is still read as a
whole; this is not a history-independent service-I/O claim. No paid-model test is included
without separate limits/authorization. Issue #11 is not complete.
