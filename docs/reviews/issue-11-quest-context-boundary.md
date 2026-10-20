# Issue 11: Quest Context and Return Boundary

Source review at `2bb0315ab897515e536accfc00aa9a94c2c13f29`, 2026-10-20.
Design only: no runtime edits, tests, services or providers executed. The parent's
integration qualification is separate. Issue #11 supersedes **all old-save
compatibility**, not protection of current unresolved funded obligations.

## Findings and Current Source

1. **Accepted quest state exists, but no current agent quest query exists.**
   `QuestState`, `QuestTaskState`, `QuestStatus` in `src/domain/types.ts:281`
   distinguish `active`, `complete`, `claimed`; completion is task progress,
   not return, payment or host-objective satisfaction.
   `src/domain/quests/questRules.ts:4` owns creation/progress/claim rules.
   `src/persistence/canonical/content/types.ts:21` adds `StoredQuest.award`
   independently of current item ownership. `content/records.ts:10` stores
   `world:quest/<id>`, `world:contract/<id>` and indexes
   `quests/floor/<floor>/<status>/<id>`,
   `quests/target/<floor>/<room>/<status>/<id>`, `contracts/<floor>/<id>`.
   These are internal keys, not tool identifiers.

2. **The manual facade is broader than a safe agent grant.**
   `src/hooks/useGameCommands.ts` calls `GameSession.execute('content', ...)`
   with `ContentCommand` (`open-chest`, `accept-quest`, `claim-quest`).
   `src/persistence/canonical/game/contentCommand.ts:25` invokes
   `acceptQuest`/`claimReward` in `content/questActions.ts:12`, or
   `openStoredChest` in `content/openChest.ts:15`, saving roster/checkpoint
   atomically. Acceptance checks floor, duplicate acceptance and unopened fetch
   chest; **neither acceptance nor claim requires town mode there**.
   `claimQuest` only requires a completed guild quest. A new agent "guild claim"
   must enforce town at admission and effect time; the present shared command
   alone cannot prove a return. Claim adds gold once, does not consume the
   collectible, and cannot serve as evidence that it was carried home.

3. **Public town acceptance is useful disclosure, not spatial omniscience.**
   `src/persistence/canonical/game/projection.ts:17`
   (`projectGameSnapshot`) supplies current-floor quests, at most 16 per status,
   and offers only in town, at most 16; it rejects a remaining page rather than
   paginating the UI. `GameView` in `src/services/game/GameView.ts:9` contains
   raw `QuestState[]`/`GuildContract[]` for local callbacks.
   `src/components/screens/TownGuild.tsx` renders title, floor, description,
   task count/noun, status, reward; accepted rows also show target display name
   and progress. Accept/Claim callbacks carry internal IDs.
   `src/domain/guild/contractFactory.ts:97` deliberately posts target names and
   a task description; canonical preparation uses the default posted
   "Unmapped room" description (`content/preparation.ts:67`).
   `guildContractId` at line 121 encodes origin and target room IDs, and
   `questItems.ts` derives collectible IDs from it. **Do not serialize the UI
   object, its IDs, item IDs, indexes or a base64 encoding of them.**
   This UI projection is current-floor only, even though TownGuild can render
   supplied prior-floor fixtures.

4. **Quest queries need a different narrow reader, not a relaxed map reader.**
   `src/services/agentica/game/capabilities.ts:4` grants only
   `maze.observe`, `maze.inspect`, `maze.navigate`, `maze.explore`, `maze.interact`.
   `context.ts:36` validates publication equivalence and bounds perception;
   its wrapper forbids world reads. `observation.ts:20` publishes actor/source
   only; `inspectMaze` at line 96 reads earned cells/rooms/frontiers.
   Do not feed `GameView`, activity logs, a quest list or inventory into launch,
   every observation, progress event or successor context.
   Also do not directly reuse `content/queries.ts:31`: `listFloorQuests`
   calls `loadContract`/`loadAcceptedQuest`, which traverse authoritative target
   room content and awarded chest loot (`content/records.ts`). The analogous
   offer reader filters using target chest state. Those are valid internal
   integrity paths, not hidden-world discovery paths for a context tool.

5. **Existing evidence supports collection/custody, not meaningful return.**
   `tests/e2e/canonical-start-service.app-chest.spec.ts` explicitly specifies
   manual preacceptance, current-tile inspect/open, then Continue to that same
   tile with `steps: 0`. Its setup helper
   `canonical-start-service.chest-fixture.ts:32` enters town with ordinary
   stairs, accepts a public-board fetch, leaves town, and walks earned cells.
   Setup uses the local board object's target ID for matching; that object is
   not a safe provider DTO. The case's oracle checks the real item/award and
   ordinary `complete` quest. It does not prove agent acceptance, return travel,
   guild claim or host completion. No fresh PASS is claimed here.
   `src/services/agentica/game/playController.ts:24` has no typed completion
   predicate; a remote outcome explicitly does not establish host completion.

## Proposed Bounded Query

Add one explicitly selected **read-only `quest.context`** capability with strict
discriminated scopes; names below are proposed, not implemented APIs:

| Scope | Input and disclosure |
| --- | --- |
| `accepted` | Current floor plus exactly one `QuestStatus`, optional cursor. Up to four summaries: opaque selector, title, task/progress, status, reward. No implicit all-status/all-floor scan. |
| `detail` | One selector from a retained query page. Accepted title/description, target **display label**, floor, task/item display specification, progress, reward and status. Optional bounded pack/stash counts for this quest, not a full inventory. |
| `returns` | One accepted selector; current cell, an explicitly supplied earned cell, or the objective's already-bound return anchor. Report source-backed stairs/arrival, town claim eligibility, and separately qualified portal eligibility. No search for a hidden entrance, guild room or quest target. |

Use a new `src/services/agentica/game/questContext.ts` adapter and a narrowly
restricted canonical accepted-state reader, routed through `capabilities.ts`,
`actionContract.ts:actionGrant` and `actionExecution.ts:executeGameAction`.
Keep the existing perception wrapper unchanged. The reader may scan only the
chosen accepted-quest index at the publication's world root, validate
`storedQuest`, key/index ownership and exact accepted contract fields with
point reads of `quest/<id>` and `contract/<id>`. Factor that validation out of
the target/chest traversal; missing, mismatched or malformed sources fail closed.
Never call `loadWorldRoom`, `loadRoomContent`, `loadChest`, preparation, look or
target-index search to answer the query. Command-time award verification stays
in the existing authoritative command path.

`GameCheckpoint` (`game/checkpoint.ts:12`) remains a <=4096-byte cursor:
position/knowledge/mode/facing/wave/times/log, not quest or inventory storage.
`rosterContext` supplies contextual fields; `roster/records.ts:13` stores items
under `world:roster/item/<id>` with ownership and
`roster/quest-items/<questId>/<itemId>` indexes. Use that exact bounded index for
selected-quest counts, validate `StoredItem`/ownership and `matchesQuestItem`;
never infer carried stock from `award` or "chest opened".
`ownedQuestItemCount` (`src/domain/quests/questItems.ts:13`) counts pack **and**
stash for ordinary progress. Report those separately for a carry-return goal.
Portal eligibility must share `src/domain/town/portal.ts` rules: unlocked,
unambiguous pack stock, living party, eligible mode, no active battle.
An explicitly budgeted roster read is acceptable here; no scan of quest/world
history. Unavailable/budget-exhausted is not an invented zero count.

### Pagination, Identity and Replay

- Start with four scanned candidates/four summaries or one detail,
  <=2800-byte observation and <=4096-byte
  `AgenticaResult` including tokens; retain the existing 768-byte actor context.
  Apply UTF-8 limits and, initially, the canonical `DEFAULT_WORK_LIMITS` ceiling
  of 2048 reads/512 writes/4 MiB per query transaction, including evidence work
  and execution-record retention. No automatic page-draining loop.
  Stop before overflow and retain continuation after the last returned row;
  an oversized single row is an explicit bounded failure, never silent loss.
  Empty pages may have a continuation when internal filtering consumed rows.
- Raw index `after` values contain quest IDs. Keep them **host-only** in a small
  immutable page witness attached to the original canonical action-result
  record, with publication, normalized scope/status, row keys/record IDs and
  resume position. Extend `ActionResult`/its strict reader deliberately; this
  is protocol evidence in `execution`, not another quest database or authority.
  Fit the complete record/receipt witness within existing record/proof budgets.
- A wire cursor/selector can identify the originating query action's hashed
  storage key, result source attempt and row ordinal, plus publication.
  Resolve it only through that exact immutable result and receipt, not arbitrary
  caller-supplied world keys. This avoids a self-referential result-record ID.
  Validate generation/game, owner/epoch, publication, query, membership, ordinal,
  size and capability before reading private rows. A selector is disclosure,
  never an effect grant; encoding a raw quest ID is not opacity.
- Reuse `agentica/publication.ts:14` (`retainPublication`, `readPublication`,
  `assertPublicationCurrent`): pinned world/knowledge roots plus checkpoint and
  custody. `pages.ts:savedSnapshot` and `agentica/validation.source.ts:21`
  authenticate the exact creation receipt/witness. Use that snapshot, never
  whichever head is newest. Fresh queries require current publication authority;
  completed originals replay unchanged even after state/custody changes.
- `agentica/actions.original.ts:7`, `actions.result.ts:14` and
  `actions.ts:reconcileAction` already validate original identity, fingerprint,
  publication, result and source receipts. Preserve the exact serialized query
  result/selector/cursor through this path. Never regenerate a lost response from
  new progress or sight. Distinguish publication state revision from the later
  execution receipt revision; quest-state time is not the older sight timestamp.
  Corrupt/missing referenced evidence is an error, not an empty quest list.

Accepted text is deliberately public quest knowledge, not permission to locate
its target. `knowledge/types.ts:ObservedCell`/`KnownRoom` currently contain
addresses/sources, not target display names. Do not manufacture name-to-address
links. Any spatial association must start with a separately earned cell/source;
private identity comparison may classify that disclosed cell, never discover
another one. Unseen-world changes must not alter a query at unchanged roots.

## Smallest Useful Return Vertical

1. **Query first.** Manual/public town acceptance is sufficient initial setup;
   agent acceptance is not required. Supply the same ordinary quest details
   through the explicit query, without adding them to persistent model context.
   Defer agent offer browsing: it needs a separately receipted public-board
   disclosure, town-only scope and bounded paging, not remote use of the current
   authoritative `listFloorContracts`.
2. **Bind one typed host objective.** Retain an explicit, host-authorized
   accepted single-item fetch selection, expected item specification and an
   already-observed same-floor entrance cell with `CellSource`. Use canonical
   `execution` evidence, not free-text inference or a provider-chosen hidden ID.
   Source the entrance from `RememberedCell.stairs`/original observation, never
   `WorldFloor.entry` or the contract's `originRoomId`. For the smallest proof,
   choose floor 1 with a known `town` stair and a collectible elsewhere.
3. **Reuse earned navigation.** `knowledge/queries.ts:14`, `knowledge/navigation.ts:33`
   and `navigation/planner.ts:13` already validate remembered cells and
   reciprocal observed edges: <=512-cell window, <=64-step route computation,
   <=16 retained route steps. `navigation/commands.ts` executes shared movement
   with `triggerStairs: false`; the engine checks legality, not route choice.
   Unknown/unreachable/out-of-scope return routes remain blocked, not guessed.
4. **Prove only the named completion.** A proposed host
   `retrieve-and-return-to-known-entrance` predicate requires the selected
   ordinary quest complete (or already claimed), matching physical item in
   the **pack**, party at the exact bound earned entrance, and same
   generation/objective identity. Retain the evidence atomically with its
   fenced completion decision, including source quest/item records, position,
   publication and final navigation receipt. New source-backed reads may
   revalidate current host-owned state, but must not rediscover a hidden target.
   Actual proof must show nonzero post-collection travel from a different tile;
   this is a qualification criterion, not an artificial rule preventing a
   legitimate already-at-entrance objective from being satisfied.
5. **Name the remaining gap.** Entrance return is not guild delivery/payment.
   Full guild completion adds a deliberate floor-1 stair-up or portal effect,
   durable proof of `mode: 'town'`, then a separately authorized claim and
   receipt proving the once-only reward delta/`claimed` transition.
   `game/explorationCommand.ts:33`/`world/residency.ts:resolveFloorTravel`
   own stairs; `game/rosterCommand.ts:19` owns portal consumption.
   `interaction/types.ts:InteractionBinding` currently supports only
   `ContentCommand`; `interaction/commands.ts` can host a guarded claim, but
   stairs/portal need an explicit bounded effect extension, not a fake navigation.
   New starts/adoptions are currently dungeon-only (`playController.ts`,
   `App.tsx`); town continuation/recovery needs explicit policy before shipping
   automated guild claim. Do not broaden all town commands.

Use the existing operation/service-custody, decision publication, explicit
Continue, Stop and original-attempt reconciliation paths for every new effect.
No acceptance, loot, portal use or claim inside a read/route planner. Do not turn
the new completion predicate into automatic reserve release: provider outcome,
host objective satisfaction and exact terminal acknowledgement are different.

## Retention and Acceptance Gates

Retain publication roots, query originals/results/private page witnesses, source
receipts, objective/return anchors and operation lineage while referenced or
unresolved. No new archive, alternate DB, compactor or compatibility importer.
At quota exhaustion, stop new work and preserve funded cleanup; do not evict
evidence to make a successful response. `resetGuard.ts:requireResetClearance`
rejects unresolved verified-host obligations, `operations.ts` owns reservations,
and `pages.ts:restoreSnapshot`/`game/manualSaves.ts` fence restoration/save
admission. Keep these protections despite the removal of old-save support.

Proposed focused acceptance tests, **not executed by this review**:

| Gate | Concrete assertion |
| --- | --- |
| Player parity | Accept a real posted fetch via `GameSession.execute` in town, leave town, then query. Match rendered TownGuild fields/progress/reward; initial/renewed actor context contains none of the quest list. Unaccepted offers do not appear in accepted scope. |
| No hidden lookup | Query reader spies throw on target room/chest/topology reads and on the target index. Mutate unseen geometry/chest state: pinned results remain identical. Return to an unknown address refuses without materialization or look. |
| No identifier leaks | Use IDs encoding distinctive origin/target markers. Inspect results, cursor/token strings, errors, summaries, progress and wire frames: none contain raw quest/item/index identities or reversible encodings. Public target display text is intentionally allowed. |
| Bounded paging | More than four accepted rows; long/multibyte text; exact byte boundary; empty filtered page; final page. Traverse without skips/duplicates, advancing only through retained cursors. Reject cross-status/publication/game/generation, tampered ordinal and oversized tokens; assert read/scan/byte ceilings. |
| Exact replay | Lose query reply, mutate quest/roster, reload or take over, retry original. Same original observation/handles, no re-query and no new effect. Missing publication/result receipt, mismatched witness, altered fingerprint or private mapping fails closed. New action against stale publication refuses. |
| Ordinary item semantics | Collection through the existing current-tile chest command creates one item and award. Pack/stash counts match ordinary ownership; stash-only may complete the ordinary quest but must fail the carry-return predicate. Claimed status without the item cannot pass it. |
| Meaningful return | After collection, explicit Continue queries details/return source and chooses an already-earned entrance. Record >0 return steps and final position/item/quest evidence. A chest-tile zero-step successor, remote outcome or navigation arrival without the item does not prove this objective. |
| Guild effects, later | Arrival at entrance alone is not town; stair/portal uses its ordinary command once. Locked/stashed/absent portal stock refuses. Claim outside town refuses even though the old internal command permits it. Lost return/claim replies replay originals; reward is paid once and the collectible is not invented or silently consumed. |
| Custody/retention | Admission is effect-free until confirmed service custody; stale owner, withdrawn grant, Stop, deadline, quota and reload never auto-reissue a return/claim. Unknown attempts reconcile first. Current unresolved funded work still blocks reset/restore and remains recoverable. |

Implementation order: (1) accepted/detail queries with opaque pagination and
replay tests; (2) typed, host-proven single-fetch entrance return using existing
navigation and explicit Continue; (3) separately scoped town return/claim.
Only the relevant actual-App offline case should later qualify each new slice.
Do not rerun or duplicate the parent's full integration campaign for this report.
