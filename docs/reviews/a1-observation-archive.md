# A1 Snapshot-Bound Observation History

2026-10-11. Implementation `476bf50`, reviewed repair `6bad40e`, validator integration `ffd297d`
(isolated source `88dab7c`, base `35d2fc8`). Branch `codex/agentic-game-a1`.
PASS at the source-validation, canonical-save and native-browser boundaries below.
A1 destination/Agentica binding is still incomplete; this is not a paired runtime
or live-provider qualification.

## Implemented

The ordinary `maze-battle` database upgrades to v4 with an immutable `observations`
store. Each SaveSlot optionally retains an observation head. Appends use the same
transaction as the actual game, control revision and (for receipted commands)
command result. There is no second inventory, position, maze or save database.

Manual/Auto transitions and the internal command resolver capture the same
`observeRpg` policy. Captures contain only current lawful linked-BFS sight and
visible chest state, not chest contents or hidden room metadata. Existing legacy
explored/visited coordinates are not imported as historical evidence. The first
owner claim captures current sight; observer-only claims do not append. Town
keeps prior knowledge without manufacturing a dungeon observation.

Unchanged observation content reuses its original source rather than recording
every timer/save tick. Actor moves, visible topology changes and explicit chest
opening append new evidence; hidden changes and UI/stat-only changes do not
refresh unseen or unchanged source timestamps. This is a change journal, not a
record of every instant at which an unchanged view was visible.

Manual saves copy an immutable head. `loadOwnedGame` reads the selected game and
head in one fenced transaction. Subsequent observations branch from that saved
head, never from later play on the same game ID. Replacement starts a new lineage
even if an internal caller reuses a game ID. Abandoned branches remain available
as source evidence, but cannot be reached through the loaded branch's cursor.
Existing command receipts keep their original optional source-head reference
across replay, reload, takeover and later world changes.

Durable sources are validated before append or use: exact allowlisted fields,
bounded data, source identity, ISO time, unique cells/chests, reciprocal witnessed
edges, actor membership and graph reachability within the observation radius.
Returned receipts are independent frozen copies. Archive nodes validate scope,
depth/index shape, a redundant canonical index witness and causal revision
relationships. Clock corrections do not invalidate increasing revisions; actual
source timestamps are preserved, and indeterminate context ages are null rather
than negative or falsely fresh. These are local
storage-integrity checks, not cryptographic authentication against a user who can
rewrite the authoritative browser database.

Loads/appends check the head and immediate parent before retaining a head,
including unchanged-content and town paths. Deeper records are validated when
accessed. This is deliberately not an unbounded integrity scan of every ancestor
on every save or load.

## Bounded Reads

`readRpgHistory` is an internal evidence API, not a model-facing map dump. It
returns at most 32 records (16 default), with a snapshot-bound continuation.
Skip-ancestor indexes locate a cursor logarithmically; parent reads enumerate
only the requested page. A cursor must identify an ancestor of the selected
save's current head. Changed snapshots, unrelated branches, missing/corrupt
records and invalid budgets fail closed. No `getAll` or full history scan is
required. History is not evicted to satisfy the resident projection's cell cap.

The 257-observation native test enumerated every source exactly once in pages of
seven, at most 14 observation point reads per page, while forbidding `getAll`.
Deep seeks at 17/65/257 records read two records each and returned 741 bytes;
combined head-plus-seek elapsed times were 1.8/1.7/1.8 ms in that run. These use
radius-zero fixtures to isolate index behavior, not a worst-case rendering or
perception benchmark. There is no claim of infinite retention or fixed storage
cost: archive bytes grow with evidence and browser quota still applies.

## Verification

All tests provider-free, native Chromium/IndexedDB on isolated test origins.

| Check | Evidence |
| --- | --- |
| Full Vitest suite at `476bf50`, before review repairs | 2,121 tests / 144 files PASS, 216.22s |
| Focused knowledge suite after repairs | 206 tests / 5 files PASS, 8.24s |
| `rpg-command.config.ts` after repairs | 34 browser cases PASS, 19.8s |
| `d1-regression.config.ts` after repairs | 33 existing gameplay/import/custody/native-scale cases PASS, 1.3m |
| `click-navigation.config.ts` before review repairs | 8 mounted-App desktop/mobile-emulated controls cases PASS, 43.1s |
| Production build | TypeScript + Vite PASS, 2,082 modules |

Browser checks include current-sight-only legacy migration; snapshot load/branch
and reload; same-ID reset through GameSession; unchanged/hidden/town transitions;
original chest/source reconciliation; v2 and v3 upgrades without rewriting old
save records; malformed/missing evidence; and injected quota errors at each of
observations/saves/meta/command stores. Every injected failure preserved the
previous game/head/control and left no partial observation/command.

An independent isolated review reproduced three defects before publication:
backward clock adjustments blocked moves; changing one skip pointer admitted a
source from another legitimate branch; and unchanged-content loading missed a
deleted immediate parent. `6bad40e` fixes these and adds all three browser repros,
plus the null-age unit regression. The first clock test run failed only because
its timestamp assertion assumed a frozen millisecond while the installed test
clock was advancing; the assertion now checks the corrected hour while still
requiring movement, causal projection and preservation of both actual times.

Existing large-save cost remains: the 128-room, 16-floor native fixture wrote
approximately 19.5 MB per save and took 0.74-0.91 seconds per persisted move in
this run. The archive does not solve whole-game serialization. Current v4 code is
required for a migrated origin; this does not claim downgrade compatibility with
an old v2/v3 application. The owner's old preview origin remains untouched.

Local detailed evidence: `test-results/rpg-commands/results.json` and
`test-results/d1-regression`. Source witnesses preserve what was observed; an old
source is not automatically evidence of current truth.

## Remaining Gate

Follow-through: [scoped durable memory](a1-scoped-memory.md) now implements the
bounded derived cache and retrieval described below, through `ba8dc22`. The
following paragraph records the archive-only boundary when this report was
written; the linked report supersedes its pending-cache status, not its evidence.

Next: rebuild/retrieve scoped remembered projections from these sources, with
bounded work and explicit partial/unknown results rather than a hidden-world
fallback or whole-history dump. Durable room/cell retrieval and a projection
cache are not implemented by this archive. The pure resident projection still
has its explicit 2,048-cell bound; that must not become a total world-size cap.

Then adapt the existing DestinationOperation to the actual save/receipted local
steps, preserving target/grant/usage, Stop, reload/adoption and cancellation. Bind
the existing Agentica SDK admission/results/events atomically, not by treating
an internal command receipt as SDK completion. A2 discovery and UI parity, A3
ordinary quest effect/return, Q paired-dungeon recovery/cross-runtime proof and a
separately authorized paid trial remain outstanding. Goal stays active.
