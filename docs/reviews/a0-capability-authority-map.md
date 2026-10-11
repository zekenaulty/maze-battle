# A0 Exact-Head Capability and Authority Map

Date: 2026-10-11. Evidence level: source review and read-only preflight.
Scope: A0 only, in parallel with the parent's D1 qualification. No runtime or
schema implementation, service/browser launch, provider call, push, or goal-state
change. This report does not qualify D1, A1-A3, Q, or live-model competence.

Reviewed direction: `docs/agentic-play-next-slices.md` revision 4,
`docs/two-dungeon-qualification.md` integrated revision 1, and
`docs/ns6-paired-integration.md`, all from the Maze head below. Their earlier
results and future gates are not treated as current execution evidence.

## 1. Source Identity

| Subject | Verified identity |
| --- | --- |
| Maze source under review, denoted `M:` below | `b237160d8810374c781c40bbc61d8d1f61ca12e1` (`perf: bound per-step maze lookup and skip accepted contract searches`) |
| Isolated report branch | `codex/a0-capability-map`, created directly from that commit |
| Isolated worktree | `C:/Users/Zythis/.codex/worktrees/a0-capability-map/maze-battle` |
| Requested parent repository | `C:/Users/Zythis/.codex/worktrees/dungeon-d0/maze-battle`; shared Git common directory verified as `C:/Users/Zythis/source/repos/maze-battle/.git` |
| Paired Agentica source, denoted `A:` below | `1e1a2df3c489d633b62b739b7bd61eba2cfa3c5d`; clean checkout at `C:/Users/Zythis/Documents/Codex/2026-09-30/files-pasted-by-the-user-you/work/agentica-lab-web` |
| SDK paths | `M:src/services/agentica/sdk/agentica-host.mjs` and `A:Agentica.Lab.Web/wwwroot/sdk/agentica-host.mjs` |
| SDK Git blob, both repositories | `64665c24e9a73ebd7dcd97a91fefcd9f0d944a2b` |
| SDK committed bytes | 34,652 bytes; SHA-256 `ef299a90dbebe2ce4db5fb5ed29d078a0d0eefa9a3406a0f5a30530a55a29c96` |
| Maze working SDK bytes | 35,182 bytes, CRLF; SHA-256 `d1b5655225a5c757f109657656b6a386d0c90af721da954213a96c6e8e5716dc`; LF-normalized blob matches |
| Maze SDK declarations / dependency lock blobs | `agentica-host.d.mts`: `2d132f6eac3a35be9157c1812872b2ac32a4fd94`; `package-lock.json`: `01076fd82b0a7d4db3e350eb51cc70170fee0a90` |
| Agentica build prerequisite | `A:global.json:3` pins .NET SDK `10.0.302`, roll-forward disabled; installed SDK and fixture binary provenance were not qualified here |

The parent already had uncommitted D1 measurement work at initial inspection.
Neither it nor the live source checkout was edited. References below name exact
head-relative files and one-based source lines, not moving branch claims. A later
D1 merge requires a delta review, especially of movement, visibility, identities,
generation, and persistence.

## 2. Findings That Block Direct Rebinding

1. **Navigation wrappers bundle unrelated effects.** `moveManually` opens the
   arrival chest and may start combat (`M:src/hooks/useGameLoop.ts:14`). Even
   `moveActive` calls `syncGuildQuests`, potentially accepts/completes/pays quests,
   and by default changes floor or enters town at stairs
   (`M:src/domain/gameFactory.ts:229`). `triggerStairs: false` suppresses stairs,
   not guild effects. Neither wrapper is an already-safe travel-only command.
2. **Auto and guild exposure are privileged.** Auto enumerates every active
   quest target and unopened floor chest, then ranks using full-maze shortest
   paths (`M:src/domain/automation/autopilotPlanning.ts:54`, `:76`). Guild
   contracts enumerate hidden rooms and filter treasure contracts using hidden
   reachability; visibility changes their status, not their inclusion
   (`M:src/domain/guild/contracts.ts:85`). Constructor/normalization and movement
   synchronize these quests. Filtering only `TownGuild` or hiding coordinates
   cannot repair the target/count/title/reward/refusal side channels.
3. **The RPG has no historical connection receipt ledger.** Its exploration
   persistence is `visited` and `visibility.explored` coordinates
   (`M:src/domain/types.ts:93`). Current geometry can reconstruct possible links,
   but cannot prove when an actor learned a connection, object, or blockage.
   Legacy explored coordinates must not be relabeled as historical observations.
4. **The durable host is real, but is bound to another save model.** NS-6 stores
   positions, travel, knowledge, actions and events in the topology/streamed
   database, not the actual RPG's `maze-battle` save. Its collection increments
   `collectedChests`; it does not award RPG inventory or quests
   (`M:src/domain/expedition/streaming/transition.ts:39`). Do not copy the RPG
   into a streamed slot and make that second world authoritative.
5. **Existing fetch is not carry-and-return.** Opening any matching-room chest
   satisfies fetch and automatically pays guild rewards
   (`M:src/domain/quests/quests.ts:80`, `:150`, `:195`). No quest task identifies
   a carried item or required return endpoint (`M:src/domain/types.ts:278`).
   A chest-open flag, inspection, inventory count, or claimed fetch quest cannot
   certify retrieval of the survey seal and return to the entrance.
6. **RPG custody is not yet original-action custody.** `updateOwnedGame` commits
   the save and owner/epoch/revision together, but accepts an anonymous reducer
   and stores no action fingerprint/result/outbox. `GameSession.transition`
   returns `void`; telemetry is saved afterward. These are useful ownership
   foundations, not a crash-safe Agentica effect receipt API.
7. **Encounter-off is narrower than combat-off.** `randomBattles=false` blocks
   random encounters, but Auto's kill-quest branch and Waves call `startBattle`
   independently (`M:src/domain/automation/autopilot.ts:35`,
   `M:src/domain/automation/autoPlay.ts:36`). Q needs an explicit noncombat test
   policy, no active battle/Waves, and no forced-combat capability or objective.

## 3. Controller and Capability Matrix

The URL switches select different applications; they are not alternate
controllers over one save today (`M:src/main.tsx:6`).

| Controller / entrypoint | Actual execution and authority | Reuse / missing integration |
| --- | --- | --- |
| Manual RPG: default `App`, keyboard and movement buttons | `src/App.tsx:20` -> `src/hooks/useGameCommands.ts:13` / `src/hooks/useGameLoop.ts:44` -> `GameSession.transition` -> `updateOwnedGame`; writes actual `GameState` | Reuse domain rules and save fencing. Separate travel from chest, quest synchronization, stairs and encounters before binding an agent. There is no explicit open-chest command in `useGameCommands` today. |
| Auto RPG: toggle Auto and timer | `src/hooks/useGameLoop.ts:31` -> `advanceAutomaticPlay` -> `advanceAutopilot`; same `GameSession` save path | Reuse shared effects, not `deriveAutoTargets`, full-map ranking, implicit collection, forced fights or town-care policy. Stop currently pauses RPG automation, not a separate streamed Agentica epoch. |
| Directed UI: `?expedition=3` | `src/components/directed/DirectedPlayApp.tsx:11` -> `src/hooks/useDirectedPlay.ts:19` -> `src/persistence/directed/repository.ts:28`; creates `createDirectedFixture`, executes `applyDirectedCommand` | Reusable known-graph navigation, perception/memory/source presentation, receipts and recovery patterns. Its `DirectedWorld` is a fixture, not `GameState`. |
| Local streamed destination executor | `src/services/expedition/directed/executor.ts:10`, `navigate`, `step`, `cancel`; `src/persistence/directedStreamRepository.ts:45`, `:75`, `:99`, `:138` | Reusable prepare/execute/settle operation semantics and budgets. Concrete repository/cache/geometry dependencies need an actual-RPG binding, not a second canonical checkpoint. |
| Legacy Agentica fixture client | `src/services/agentica/client.ts:22`; `mazeCapabilities()` binds `observe`, per-cell `move`, `collect`, `prepare`, `finish` | `src/persistence/agenticaExecution.ts:19` executes streamed commands. Keep as regression fixture; neither its per-cell activation pattern nor its counter-based collection implements A1/A3. |
| NS-6 directed Agentica client | `src/services/agentica/directed/client.ts:30`; `start`, `tick`, `recover`, `adopt`, `cancel`; capabilities at `src/services/agentica/directed/capabilities.ts:3` | Binds `observe`, `room`, `map`, `inspect`, `navigate` only. `navigate` must equal the host-designated known destination (`src/persistence/directedAgentica/actions.ts:68`). Status/cancel/adopt are host controls, not model tools in this manifest. No frontier-choice or real-chest tool is bound. |
| Agentica launcher: `?agentica=1` | `src/services/agentica/launch/session.ts:85` creates a fresh `lab-*` slot; `src/services/agentica/launch/scenario.ts:24` prepares known destinations; then uses `DirectedAgenticaClient` | Useful known-destination regression. Preparation is not a cold unknown-world test. Do not attach its setup/discovery prelude to Q. |

Unless explicitly prefixed `A:`, all files in these matrices belong to `M:`.
The ordinary expedition (`?expedition=1`) and streamed expedition
(`?expedition=2`) are also separate surfaces, not RPG-save adapters.

### RPG Owners and Effect Entrypoints

| Owner | Verified boundary | Consequence for binding |
| --- | --- | --- |
| Canonical game | `src/domain/types.ts:312`: `GameState` owns active maze, saved floors, party, inventory/stash, chests, quests, battle and modes | Keep this state authoritative. `maze` and its floor snapshot are updated together by existing domain functions; do not maintain independent actor positions in fixture stores. |
| Durable game save | `src/persistence/saveRepository.ts:7`: IndexedDB `maze-battle`, version 2, stores `saves`, `meta`, `telemetry`; active slot `auto` | Host knowledge/intentions/receipts must be transactionally associated with this save, not with `maze-battle-topology-v2`. |
| Custody | `src/persistence/gameCustody.ts:16`, `:40`; `src/persistence/saveControl.ts:24` checks exact owner, epoch and revision within the write transaction | `src/services/game/BrowserSaveLock.ts:1` explicitly treats Web Locks as a presence hint. Preserve the durable fence, queued-action checks and same-tab controller arbitration. |
| Session | `src/services/game/GameSession.ts:95`, `:102`, `:112`, `:153` serializes control, effects and save replacement; bounds pending Auto ticks | Add an awaited, receipted command path inside this boundary. Do not equate UI publication or `flush()` with a specific Agentica action result. |
| Movement / floors | `src/domain/gameFactory.ts:229`, `:524`, `:590`, `:652`; `src/domain/maze/movement.ts:4` | Physics may read truth. Selection/planning may not. Preserve existing saved cells, roles, connections and floor transitions; do not regenerate from a newer recipe. |
| Chest / inventory | `src/domain/items/chests.ts:64` -> `rollLoot` -> `addItemsToInventory` -> `recordFetchQuestProgress` | Share this domain path after separating authority and adding the objective-specific item award. Existing `opened` guard prevents a second opening, but does not replay an original action receipt. |
| Inventory / equipment | `src/domain/items/inventory.ts:51` preserves awarded overflow and may auto-equip; `src/domain/items/inventoryTrade.ts:31`, `:75` respect item locks; `src/domain/items/inventoryPolicy.ts:34` can toggle locks | Account for auto-equip and overflow in effect equivalence. A user-toggleable lock alone is not quest-item custody protection. Broad inventory/town bindings remain out of A1-A3. |
| Quest / rewards | `src/domain/quests/quests.ts:28`, `:80`, `:115`, `:150` | Existing legacy lifecycle is immediate acceptance/progress/payment. New return semantics must be explicit and opt-in, not silently imposed on old quests. |
| Town / portal | `src/hooks/useGameCommands.ts:27` routes to `domain/town/town.ts`; inventory consumables reuse `domain/town/portal.ts` | Do not grant town-care, selling, teleport or portal authority as an accidental consequence of navigation. |
| Diagnostics | `src/services/game/GameSession.ts:127`, `:133`; activity logs are trimmed (`src/domain/gameFactory.ts:520`) | Telemetry/log prose is not immutable action, observation or completion proof. A telemetry write failure may follow an already-committed game effect. |

Separate fixture databases are explicit in source:
`src/persistence/directed/database.ts:5` (`maze-battle-directed-v1`, DB version 2),
`src/persistence/topology/types.ts:28` and `src/persistence/topology/database.ts:35`
(`maze-battle-topology-v2`, DB version 5), and
`src/persistence/expeditionDatabase.ts:13` (`maze-battle-expeditions`, version 2).
IndexedDB transactions in these repositories do not encompass the RPG database.

## 4. Knowledge, Source Evidence and Privileged Reads

Keep four layers distinct: game truth -> lawful observation -> retained actor
knowledge -> selected delivered context. Only physics, authorized effects and
offline auditing may consult hidden truth. A pure/query API is not automatically
safe to expose: derived route costs, errors, counts and target ranking matter.

| Surface | Source evidence and observation policy | Limit / privileged read to exclude |
| --- | --- | --- |
| RPG local perception | `src/domain/maze/visibility.ts:16`, `:43`: default radius 7 by linked-path BFS; `revealMazeVisibility` merges explored coordinates | This is the current game rule, not visual raycasting and not the Directed fixture's richer perception profiles. Freeze its version/radius in Q; place the junction beyond initial sight. Record observations when earned. |
| RPG fog / display | `src/viewModels/mazeViewModel.ts:11` passes the full maze and chest list to the renderer; `src/components/maze/drawMaze.ts:199`, `:1123` filter chest pixels by explored cells | Fog is not a data boundary. `src/components/maze/drawMaze.ts:276`, `:321`, `:337` also reads layout/main-path/role overlays. Shared perception projections must drive Q UI and tools; do not advertise full view models, ideal paths, room roles or unseen counts. |
| Guild display / quest list | `src/domain/guild/contracts.ts:91` picks origin/candidates from full layout; `:96` computes full-maze reachability; `:133` labels visibility. `src/components/screens/TownGuild.tsx:11` filters accepted IDs, not unseen contracts | Even posted contracts retain room-derived IDs, names, objective types and rewards. `createNewGameState`/`normalizeGameState` also import them into quest state. Q needs a lawful public objective projection before selection or serialization, not merely hidden coordinates. |
| Streamed known routing | `src/services/expedition/directed/knowledge.ts:8` follows learned endpoints via point reads; `src/domain/expedition/streaming/directed/knowledge.ts:49` validates pages and caps aggregate residency at 512 cells | Reuse the actor-only graph and refusal semantics. No topology enumeration or hidden shortest-path fallback when a known route is missing or over budget. Existing finite residency is not proof of arbitrary world-scale navigation. |
| NS-6 map / room / cell | `src/services/agentica/directed/capabilities.ts:12`; `src/services/agentica/directed/mapView.ts:14` caps scheduled page reads (depth <=3, limit <=12); `src/services/agentica/directed/roomView.ts:9` pages <=32 remembered cells; `src/persistence/directedAgentica/actions.ts:83` uses saved knowledge | Room storage/validators assume bounded local coordinates and <=225 cells (`src/persistence/directedAgentica/contextEvidence.ts:15`). Actual RPG global coordinates and legacy layouts need an explicit adapter, not casts into `StreamKnowledgePage`. Preserve observation age and unknown results. |
| NS-6 observe / operation | `src/services/agentica/directed/observation.ts:16` emits compact operation state by default; `src/services/agentica/directed/scope.ts:5` limits visible detail to 24 cells plus remembered landmarks | The 24-cell limit is output detail, not a whole-action read count. `src/persistence/directedAgentica/actions.ts:114` calls `snapshotAt`; `src/persistence/streamRepository.ts:21` loads/validates/materializes the current room even for a remote query's envelope. Remote lookup itself uses saved pages and does not load unknown remote geometry. Measure both costs separately. |
| Directed source archive | `src/persistence/directed/observationSources.ts:10` verifies scope, identity and witnesses; `src/persistence/directed/contexts.ts:64` captures exact source context; `src/domain/directed/sourceContext.ts:6`, `:45` allowlists public fields | At most 8 source IDs / 65,536 bytes; audit-only `sourceWorldRevision` is excluded. Checkpoint-mode reads are indexed; legacy mode scans a bounded journal. These are fixture implementations, not existing RPG history. |
| Agentica service evidence | `A:Agentica.Lab.Web/Context/HostContextTools.cs:11`: `lab.evidence.read`, `lab.knowledge.query`, hypothesis tools; `A:Agentica.Lab.Web/Context/HostContextStore.cs:32` scopes by host/session/epoch/scope/perspective | Exact observation reads optionally bind a content hash; knowledge pages max 32. The service trusts host-delivered observations to be lawful. Never upload audit truth and rely on compact context to hide it from evidence retrieval. Hypotheses are not canonical truth or completion. |
| Service retention / operator view | `A:Agentica.Lab.Web/Context/HostContextSession.cs:11`, `:123`, `:137`: bounded retained observations/facts, source availability and pruning; `A:Agentica.Lab.Web/LabWebApplication.cs:69` exposes run/operation/recovery APIs | Service context is not the durable RPG knowledge archive. Operator snapshots, raw saves, recipe seeds, hidden geometry, privileged solvability diagnostics and custody inventories must stay outside actor tools and fixture-provider input. |

Historical inspection does not refresh unseen state or implement active
examination. No current RPG observation receipt proves a historical wall/link.
For legacy adoption, preserve existing fog while marking its coordinate coverage
as imported, unreceipted history; bootstrap current lawful observations at the
current checkpoint. Unknown historical links require re-observation, not an
invented past source event. Any stronger import policy needs explicit semantics
and tests, and cannot qualify Q's cold start.

## 5. Durable Interfaces Already Implemented

Reuse the paired protocol rather than replacing it with a new workflow engine:

| Interface | Exact source | Established implementation boundary |
| --- | --- | --- |
| HostProtocol v1 | `A:Agentica.Lab.Web/Contracts/HostProtocol.cs:9`, `:23`, `:56`, `:69`; `A:Agentica.Lab.Web/Contracts/HostOperations.cs:6` | Deliberate capabilities, manifest-bound action with expected revision/deadline, immutable result, separate operation admission/event/completion and cumulative run usage. No game simulation belongs in Agentica. |
| SDK action custody | `M:src/services/agentica/sdk/agentica-host.mjs:92`, `:298`, `:398`, `:432` | `actionKey`/`actionFingerprint`; durable `loadAction`, `saveAction`, `reconcileAction`; pending/unresolved originals are reconciled, not reinvoked; resolved results replay. Transport failure does not prove absence of effect. |
| Maze admission | `M:src/persistence/directedAgentica/actions.ts:19`, `:44`, `:125` | One topology transaction stores the original result, operation and grant linkage. Replay is checked before current execution fences/deadline. Pending-only settlement is safe here because effect/result publication is atomic. |
| Local travel | `M:src/persistence/directedStreamRepository.ts:75`, `:99`; `src/persistence/directedStreamRecords.ts:26` | Persist exact pending move before execution, settle original receipt, fence stop/adoption; use pure destination operation logic and learned routing. Runtime executor remains tied to stream persistence. |
| Outbox / control | `M:src/persistence/directedAgentica/events.ts:25`, `:77`; `src/persistence/directedAgentica/control.ts:11`, `:26` | One retained immutable in-flight event, exact acknowledgment, adoption+transfer, cancellation barrier before network success. Final move and event publication can be reconciled without moving again. |
| Service custody / park / wake | `A:Agentica.Lab.Web/Runtime/HostRun.cs:187`, `:465`; `A:Agentica.Lab.Web/Runtime/ActionCustodyStore.cs:77`; `A:Agentica.Lab.Web/Runtime/HostOperationStore.cs:68`, `:93`, `:191`; `A:Agentica.Lab.Web/Runtime/HostRunRegistry.cs:64` | Durable reservation/admission, progress without cognition, a persisted successor identity only for decision wake, cumulative usage and original-custody checks. A prior-process interrupted wake is not automatically replayed. |
| Completion evaluator | `A:Agentica.Lab.Web/Runtime/HostRun.cs:642` | Unresolved host actions block completion; completion requires the host objective artifact. The host still must prove the actual domain predicate. A model report is insufficient. |

Current default journey grant is 64 steps, 4 replans, 120,000 ms
(`M:src/domain/directed/destinationLimits.ts:8`). Explicit finite values and
`none`/`unlimited` configuration already exist (`M:src/config/directedTravel.ts:7`).
The duration is a real elapsed-time hard ceiling, including suspension. Preserve
target, start time, limits and usage across adoption. An expired admission action
does not invalidate already-admitted travel, but a hard journey limit cannot be
silently renewed as a technical window. Routine local steps must not request the
model; a persisted consequential decision may deliberately wake it once.

## 6. Smallest Actual-Game Binding Plan (Proposed, Not Implemented)

### A1: Known Travel on the RPG Save

1. Keep `GameSession` / `gameCustody` as the sole effect entrypoint. Add an awaited
   command/result path and transactional metadata for original requests, results,
   intentions, observation references and outbox delivery in the **same RPG
   database**. Reuse the NS-6 identities and transition algorithms. Do not dual
   write RPG state and a topology fixture, and do not maintain a second position,
   chest collection counter or quest truth. Schema allocation belongs to the
   integrating implementation lane; A0 makes no schema change.
2. Factor the existing movement calculation into a shared travel-only domain
   operation: preserve collision, facing, active position, visited/visibility
   and floor snapshot updates; explicitly control guild synchronization, stairs,
   encounters and collection outside that primitive. Preserve legacy Manual/Auto
   convenience behavior through their wrappers. The agent must not call
   `moveManually`, `advanceAutopilot`, or unqualified `moveActive`. Admission also
   validates game/floor, mode, party viability, actor knowledge and effect scope.
3. Adapt actual RPG observation receipts into the existing actor navigation graph
   and destination-operation logic. D1 `structured-v3` supplies room IDs and
   global door/path coordinates (`src/domain/maze/moduleGenerate.ts:38`); those are world
   truth, not earned connections. Map global cells and module-local addresses
   explicitly, including passages and overlapping/sparse legacy layouts. Never
   regenerate a floor to recover a room graph or relabel every room as a new save.
4. Bind observation, known-destination travel, bounded room/map/cell recall and
   host status/cancel/adopt. Follow known multi-cell paths locally under one
   admitted intention. Preserve `recover` paused behavior and explicit adoption.
   Manual movement/Auto takeover, save load/new game, Stop and cross-tab takeover
   must revoke/fence old agent execution in the same canonical transaction.

Gate: known-route and doorway arrival leaves chests/items/rewards untouched;
reload/Stop/takeover/lost acknowledgment retain original identity; expired
technical action window does not become a fresh grant. Do not infer A1 from
existing streamed tests or D1's successful manual traversal.

### A2: Earned Frontier Choices

Add a bounded exploration intention to the actual-game binding, not a generic
per-cell model loop. Offer only observed frontier affordances; execute a forced
corridor locally within its grant; persist the new legal observation and decision
reason at the consequential junction; wake a successor to choose the continuation.
The current directed manifest has no such capability, and its fixed destination
equality check must not be removed without replacing it with explicit host scope.

Ordinary RPG floors already contain the relevant cells. Unseen RPG space does
not require calling streamed `prepareNext`, regenerating hidden topology or
creating a new canonical world. Source known costs, reachable proposals, warnings,
refusals, scheduling and tools from actor knowledge, never from Auto's oracle.
Share the same legal perception/remembered-state projection with the human UI.
Keep small room detail, bounded graph summaries and deliberate distant retrieval;
measure actual reads as well as serialized context. The current monolithic RPG
save read/write and 512-cell routing ceiling remain explicit scaling constraints.

### A3: Real Chest, Protected Item, Return Predicate

Selected integration path: extend `domain/items/chests.ts`'s ordinary chest-open
path, use `domain/items/inventory.ts:addItemsToInventory` and existing ownership /
capacity rules, and add a narrowly versioned retrieve-and-return objective in
`domain/quests/quests.ts` / `domain/types.ts`. No harness-only seal flag or inventory.

The missing shared primitive must bind the source chest and objective to one
stable survey-item identity, award it to the actual pack on explicit opening,
and prove possession plus return to the admitted entrance. Existing random loot
and already-open chest semantics need an explicit deterministic objective-item
award extension; setting `ChestState.loot` beforehand is not enough, because
`openChestAtActivePosition` currently rolls new loot. Keep ordinary loot behavior
and old fetch auto-payment unchanged for legacy objectives.

Use an explicit protected quest-item semantic, not a renamed generic consumable
or a toggleable lock alone. Preserve it through normalization, stack handling,
overflow, reload and save copies; do not allow sale, consumption, auto-equipping
or auto-stashing to destroy the carried objective. Do not report a stashed or
missing item as carried. The reward/turn-in transition must be exactly-once and
separate from arrival; decide and record whether the item is retained or consumed
at turn-in. For the minimal Q endpoint, arrival at the floor-1 entrance is tested
before any automatic town/stair transition, using the shared travel-only command.

Commit chest state, item custody, quest progress/reward and the exact host receipt
atomically under RPG ownership. Explicit collect is separately authorized from
approach/navigation. Compare Manual, Auto and Agentica delivery of this same
authorized command from equivalent saves, not their different high-level target
policies. A returned receipt or `quest.status` alone is not final completion:
the host checks source effect, carried item, return endpoint and objective lineage.

### Save Compatibility

`src/domain/gameFactory.ts:524` reuses stored target floors; `:590` preserves saved cells and
rejects a versioned layout missing its cells; `:652` generates modules only for
new floors. Keep those boundaries. Do not upgrade old geometry, infer historical
observations, reset rewards or run new maintenance during load. New objective
semantics and agent metadata require versioned opt-in and preservation tests.
Save replacement/copy needs an explicit execution lineage: loading an old game
snapshot cannot resurrect an old live grant or detach deduplication receipts from
the state they certify. Reconcile/fence the old attempt before activating a new
save lineage. Existing save-load behavior alone does not implement that policy.

## 7. Original-Attempt Reconciliation Contract

These are required RPG binding obligations, modeled on the existing NS-6 code:

| Failure boundary | Required behavior |
| --- | --- |
| Before reservation | No effect; validate scope/manifest, current knowledge, owner/epoch/revision and deadline. Reserve the original request identity and fingerprint durably before dispatch. |
| Reserved but outcome unknown | Read the original action under the canonical transaction lock. Completed result -> replay its original bytes/evidence. Pending-only -> settle as no effect only if atomic game+receipt storage proves that; missing/corrupt evidence -> unresolved, not a fresh attempt. |
| Effect committed, response lost | Return the original receipt, inventory/quest outcome and observation. Do not reroll loot, reopen, repeat payment, move again, or create a new action/provider run to obtain cleaner evidence. |
| Concurrent execution/recovery | Transaction serialization chooses one original result. Changed input under the same ID fails; stale owner may read a historical result but cannot execute a new effect. |
| Progress/completion acknowledgment lost | Deliver the same persisted event ID, sequence and body. Do not rewrite admission as completion or reconstruct old observations from current world state. |
| Stop/takeover while HTTP hangs | Commit the local fence promptly; preserve unresolved original movement/effect and pending event. Network success is not required to stop. New custody does not transfer unsettled effects by assertion. |
| Reload/adoption | Reconcile first and remain paused. Explicitly transfer the same intention with fresh custody, unchanged target/start/grant and accumulated usage. Terminal arrival can publish its missing event without another movement. |
| Decision wake interrupted | Reconcile the exact successor binding and original custody. Do not replace a claimed wake with another provider run. Observation/timer/room changes alone do not authorize repeated activation. |
| Save load/new game | Fence the old controller, retain its historical receipts and define the new active lineage. A rollback of game contents is not rollback of effect history or renewal of an outstanding grant. |

Browser loss or storage corruption may leave an honest unresolved outcome. Source
receipt availability, execution status, objective satisfaction and service delivery
are separate facts. No local log, model narrative, or service status substitutes
for the canonical game effect predicate.

## 8. Verification and Provider-Free Test Manifest

### Executed in A0

| Check | Result / evidence limit |
| --- | --- |
| `git status --short` on parent, isolated worktree and paired Agentica checkout | Parent's in-progress D1 files observed only; isolated base and Agentica clean before report. No parent/live writes. |
| `git rev-parse 'b237160^{commit}'`, isolated `git log -1 --format='%H %s'`, Agentica `git rev-parse HEAD` | PASS: exact heads above. PowerShell requires quoting the commit peel expression; an initial unquoted command failed and was rerun correctly. |
| `git rev-parse --path-format=absolute --git-common-dir` in parent and isolated worktree | PASS: same repository, distinct checkout. |
| `git ls-tree HEAD` for SDK/declaration/lock paths; Node `execFileSync('git', ['show', 'HEAD:'+path])` + SHA-256, compared with working-file bytes | PASS: exact SDK blob and canonical bytes match; working difference is line endings only. |
| Targeted `rg -n`, numbered source reads and the three required plan documents | Source-reviewed findings above. Tests below were inspected, not executed. |
| Node report-reference/ASCII check; `git diff --cached --check`; `git diff --cached --stat` | PASS: 92 explicit file/line references resolve within source bounds, report is ASCII, no whitespace errors, and only this new report is staged. Reference existence is a structural check, not behavioral proof. |
| `node --check src/services/agentica/sdk/agentica-host.mjs` | PASS (exit 0): syntax only, no host/provider invocation. |
| `inspectReadiness` from `scripts/ns6-readiness.mjs`, explicit paired source and isolated Maze roots, compact JSON output | UNKNOWN as designed for drift: `matching_but_unreviewed_sdk`, `source_audit_required`; reports 0 provider calls / services / file writes. The script pins old Agentica `4c481b6...` and SDK `a4228c9...` (`:7`, `:26`, `:148`), so its old missing-handoff prose is not current evidence. This source review verifies the newer handoff; it does not change the script or qualify a binary. |

Read-only preflight reproduction (full JSON; expected UNKNOWN/exit 1 at these pins):

```powershell
node scripts/ns6-readiness.mjs --agentica-source C:/Users/Zythis/Documents/Codex/2026-09-30/files-pasted-by-the-user-you/work/agentica-lab-web --maze-source C:/Users/Zythis/.codex/worktrees/a0-capability-map/maze-battle
```

The executed compact form imported `inspectReadiness`, passed the same roots,
and printed status, effects, SDK identity, audit, continuity and prerequisites;
its wrapper exited 0, **not** a readiness PASS.

### Existing Regression Commands (NOT RUN Here)

Run only from a disposable qualification worktree after dependencies are installed
from the pinned lock. These commands do not qualify the proposed RPG adapter:

```powershell
node node_modules/vitest/vitest.mjs run --maxWorkers=1 src/domain/gameFactory.preservation.test.ts src/domain/quests/quests.test.ts src/domain/maze/visibility.test.ts src/hooks/useGameSession.test.tsx src/domain/expedition/streaming/directed/knowledge.test.ts src/services/agentica/directed/views.test.ts src/services/agentica/directed/commands.test.ts src/services/agentica/directed/client.lifecycle.test.ts
node node_modules/@playwright/test/cli.js test --config tests/e2e/ns6-host.config.ts
node node_modules/@playwright/test/cli.js test --config tests/e2e/d1-rpg-playwright.config.ts
npm run build
```

`ns6-host.config.ts` uses one worker, port 5183 by default (`NS6_HOST_TEST_PORT`
can change it), separate fixture pages and no service provider.
`d1-rpg-playwright.config.ts` uses disposable browser contexts, real `App` /
IndexedDB fixtures at exclusive port 5199 and desktop/mobile-emulation projects.
Its seeder refuses a non-fixture database (`tests/e2e/d1-rpg-fixture.tsx:23`).
The parent owns D1 evidence; do not race its ports, output files or qualification.

For NS-6 cross-runtime regression, first verify a Release fixture assembly built
from the exact Agentica pin, including its binary hash and build receipt. The
source pin alone cannot certify an existing DLL. Then, from the qualification
worktree with .NET SDK 10.0.302 selected:

```powershell
$env:AGENTICA_FIXTURE_SOURCE = 'C:/Users/Zythis/Documents/Codex/2026-09-30/files-pasted-by-the-user-you/work/agentica-lab-web'
$env:AGENTICA_DOTNET = (Get-Command dotnet).Source
$env:AGENTICA_FIXTURE_ASSEMBLY = 'artifacts/durable-handoff-fixture/Agentica.Lab.Web.FixtureHost.dll'
node node_modules/@playwright/test/cli.js test --config tests/e2e/ns6-paired.config.ts
```

Manifest: `tests/e2e/ns6-paired.spec.ts`, 12 declared scenarios, one worker, no
existing-server reuse; service 5085, deterministic fixture provider 5086, Vite
5185; disposable disk service store retained across its restart test; journey
limits 256 steps / 16 replans / 120,000 ms from the config. The launcher executes
the DLL, not a fresh source build (`scripts/ns6-paired-host.mjs:8`).
`A:samples/Agentica.Lab.Web.FixtureHost/LoopbackFixturePlannerFactory.cs:30`, `:39`
requires loopback HTTP and `fixture` / `fixture-model`, disables proxy/redirects,
and uses a fixed dummy credential. No live API key or paid endpoint is needed.
Historical NS-6 counts in its integration document are not rerun results for
`b237160` and not ordinary-RPG parity evidence.

### Required New A1-A3 / Q Proof (Missing, NOT RUN)

| Gate | Required observation and source identity |
| --- | --- |
| A1 shared authority | Actual RPG command tests plus native IndexedDB: identical command effects across controllers, no implicit chest/payment/stairs; known multi-cell/doorway travel without per-cell provider calls; stale revision/epoch refusal. |
| A2 information integrity | Fixed-action A/B replay with equal actor genesis/tools/grants/public clocks until the junction. Compare observations, contexts, recall, UI/fog, routes, costs, refusals, schemas, counters, wake reasons and public work hints. Retain raw bytes; normalize only enumerated nonsemantic IDs/timestamps/storage keys with consistent mapping, never coordinates, costs, missing facts or decision order. |
| A3 real objective | Explicit open -> one real protected survey item and quest receipt -> known return -> host predicate. Duplicate, lost acknowledgment, overflow, reload, reward replay and item protection must preserve actual custody. Existing fetch tests intentionally assert immediate payment and therefore do not establish this gate. |
| Q authored A/B | New actual-game fixture, revision/hash and normalization allowlist still required. Same ordinary stats/start and limited entrance/corridor observation; A reveals north blocked/east viable, B the reverse. No discovery prelude or oracle-sized grants. Separate observation-driven continuation choices, explicit collect and real return. |
| Recovery | Pause/reload before and after admission/movement/collection/return; lost result and event acknowledgments; service restart; duplicate action/progress; cross-tab and manual takeover; quota/transaction rollback and corrupted/missing receipt fail-closed behavior. Preserve original attempts and cumulative usage. |
| Scaling / compatibility | Pin generation/layout version, seeds and D1 candidate separately. Grow total topology while bounding room detail, knowledge page reads and route residency; include legacy classic/v1/v2/v3 save preservation. No all-world read followed by sliced JSON presented as bounded retrieval. |
| Cross-runtime / UI | After domain and Chromium/IndexedDB gates, run deterministic SDK/.NET fixtures against the same RPG host. Capture desktop/mobile projection equivalence. Scripted selection proves wiring, not model competence. |

Before these runs the integrator must record exact Maze/Agentica/SDK/assembly
identities, authored A/B fixture hash, generated-layout seeds, actor and knowledge
genesis, perception policy/radius, objective and item identity, admitted tools and
effects, custody lineage, journey limits, test origin/ports and command/environment.
Audit-only seeds, hidden answers and solver paths must not enter actor evidence,
frontier ranking or grants. Combat is disabled by explicit test policy; no paid
calls. Record local moves, simulation ticks, source observations, exact delivered
context/tool bytes, provider-fixture call count, cumulative usage and failures;
separate setup, execution, storage and transport timing. Unmeasured timing and
unimplemented tests remain UNKNOWN/NOT RUN, not assumed equal.

## 9. Handoff Status

- Source pins and SDK identity: PASS at source level.
- Capability/authority mapping: complete as this report; parent review pending.
- Durable NS-6 reuse: implemented in the pinned fixture host/service, not newly
  runtime-qualified here and not yet bound to RPG saves.
- A1-A3 / Q actual-game integration, carry-and-return, information-boundary and
  recovery acceptance: NOT RUN; missing prerequisites are explicit above.
- Live competence, deployment, merge and paid-provider qualification: NOT RUN
  and outside this authorization.

Next bounded work is A1's canonical RPG transaction/observation/movement binding
after the parent's D1 acceptance and this map's review. Do not rebuild HostProtocol,
reuse Auto's hidden target policy, promote fixture stores to canonical RPG state,
or count the first known destination as completion of the retrieval objective.
