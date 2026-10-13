# Canonical Game Persistence

Issue: [#11](https://github.com/zekenaulty/maze-battle/issues/11). Revision 2,
2026-10-13. Status: P0 and the P1a storage kernel checked; canonical gameplay
cutover NOT implemented or qualified. This is the next active engineering slice,
ahead of further room-map/Agentic Play feature work.

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
Manual save/load still needs game-level operation cancellation and checkpoint
validation before it can be exposed on the new schema.

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
P1 is PARTIAL; P2-P5 remain unimplemented/unqualified. Neither P0 nor P1a changes
ordinary-game movement payload scaling yet.

P1 is split at the real remaining boundary:

- **P1a, checked:** incompatible schema initialization, immutable record/root
  storage, compact heads, atomic command receipts, snapshot-scoped reads,
  generation/owner/revision fencing, per-operation work limits, logical quotas,
  one bounded Stop/takeover using reserved capacity, and destructive reset.
- **P1b, next:** durable admission and explicit capacity reservations for
  already-admitted operation settlement/cancellation. Bind the original attempt,
  owner epoch, reserved allowance and terminal receipt atomically. The emergency
  Stop path in P1a is NOT proof that Agentica operations can settle at capacity.
- Then **P2/P3** adopt floor/space/mutation and party/item/quest records through
  actual game-owned commands. Wire the new opener only at that coherent cutover;
  do not add a second playable entrypoint, old-state adapter or dual writer.

The target database is `maze-battle` version 8 with `meta`, `heads`, `records`,
`nodes` and `receipts`. The opener discards earlier store layouts without reading
their values. Until P2/P3 adoption, only isolated native fixtures invoke it. The
existing preview is intentionally not upgraded by importing the kernel.

Normal command admission stops before the logical reserve. A host-only Stop or
takeover fences the old epoch and enters `stopped`; repeated emergency actions
cannot consume reserve indefinitely. Resume must pass normal admission again.
Default accounting limits are 256 MiB total / 8 MiB reserve; all history remains
immutable until explicit reset. These are logical charges, not physical disk
capacity guarantees. Browser quota errors must still abort every staged effect.

Each checked slice is committed/pushed. P1-P4 are a coordinated replacement,
not permanent transitional adapters or a second runnable game. Do not declare
the issue solved while any normal step still clones historical floors.

## Reset Boundary

The immediate recovery action clears and seeds **only the current `maze-battle`
database** in one transaction, using a new game and owner identity. It does not
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

## Acceptance Not Yet Met

The existing 2,667-unit/196-native/14-App evidence qualifies the prior build only.
P0/P1a tests do not establish actual-game depth scaling, retirement of all old
databases, stream/RPG unification, game-level manual save/load, admitted-operation
settlement capacity or the full Q matrix.
These remain mandatory gates for #11, separate from any future live-model trial.
