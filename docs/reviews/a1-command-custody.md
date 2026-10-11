# A1 Internal Command Custody and Earned Knowledge

2026-10-11. Branch `codex/agentic-game-a1`.
Implementation: `58476db`, including earned-knowledge integration `3e49140`
(isolated agent source `217f61e`, base `857447d`).
Status: PASS at the bounded domain/internal-command/native-save levels below.
The actual Agentica destination binding and its completion gate remain incomplete.

## Implemented Boundary

`GameSession.commandRequest` captures the exact game, floor, position, owner,
epoch, revision, deadline, command and original attempt ID. `executeCommand`
returns an awaited durable receipt, unlike the existing anonymous UI transition.
`reconcileCommand` returns the exact original result or settles a missing attempt
without executing it. These are internal browser APIs, not new per-cell model
tools or a replacement for Agentica HostProtocol v1.

The ordinary `maze-battle` IndexedDB database upgrades from v2 to v3 by adding
`gameCommands`. Existing save records are not rewritten by that schema upgrade.
The save, control revision and receipt commit in one transaction. No topology or
fixture database is involved. Read, replay and original settlement fail closed
on changed fingerprints or corrupt receipt fields. The SDK canonical JSON helper
is reused, but these internal receipts are explicitly not SDK action admissions,
operation events or objective completion artifacts.

An original result is checked before current execution fences and deadline.
Thus a lost result can be reconciled after reload, takeover or expiration without
rerunning its effect. A missing original is atomically marked settled before a
late execution can arrive. New stale/expired requests produce terminal no-effect
receipts; they never acquire a newer grant. There is no automatic receipt deletion
or eviction. Browser quota failures abort atomically; archival/page retention
policy and storage-limit qualification beyond injected failures remain future work.

The shared game-owned command resolver implements movement and explicit chest
opening using existing physics, encounter, loot and quest-progress services.
Manual movement now calls that resolver after its existing Auto-takeover policy.
Internal commands do not choose objectives, auto-accept/pay quests or loot on
arrival. Internal movement can explicitly request existing stair behavior; future
Agentic travel must grant travel only and use `triggerStairs: false` unless an
independent transition is authorized. Defeated parties cannot move through this
boundary. Auto remains its existing controller, not an agent capability.

GameSession records ordinary transition telemetry for a newly executed command,
not a replay. Diagnostics remain secondary to the committed effect/receipt, as
with existing UI writes. A post-commit failure must reconcile the original
attempt; it is not evidence that the command did not happen.

## Earned Knowledge

The [isolated domain report](a1-rpg-knowledge.md) records the exact APIs and limits.
Current lawful linked-BFS sight becomes an immutable allowlisted observation.
Projection keeps source identity and age for cells and edges, does not import
historical edges from legacy fog coordinates, and does not refresh unseen facts.
Known routing uses only reciprocal remembered edges. Local room detail and
indexed room pages omit foreign-room internals.

Those functions are integrated and tested but not yet called by the canonical
transaction or human renderer. Durable source archival, persisted-input witness
validation, save-load lineage, known-travel admission/steps/outbox, and the existing
Agentica SDK/service binding are the next A1 implementation work. A pure-domain
hidden-world equality test is not a full host, UI or cross-runtime equality proof.
The 2,048-cell resident projection is a bounded component, not a permanent world
size cap or a substitute for paged memory. Scalable retained evidence needs the
paging/indexed-retrieval follow-through already required by the parent plan.

## Verification

All checks are provider-free. No live service/provider was called; no merge or
deployment was performed. Native tests use strict isolated localhost port 5204
and actual Chromium/IndexedDB, not mocked transactions.

| Command / scope | Result |
| --- | --- |
| `node node_modules/vitest/vitest.mjs run --maxWorkers=2` | PASS: 1,961 tests / 143 files, 189.14s |
| `playwright test --config tests/e2e/rpg-command.config.ts` | PASS: 14 native command/custody/migration cases; final run 7.8s |
| `playwright test --config tests/e2e/d1-regression.config.ts` | PASS: 33 existing native-scale/custody/import/gameplay cases, 1.2m |
| `playwright test --config tests/e2e/click-navigation.config.ts` | PASS: 8 real-App desktop/mobile-emulated controls cases, 37.3s |
| `npm run build` | PASS: TypeScript plus Vite production build, 2,076 modules |

The 14 new browser cases prove: movement does not loot; explicit chest opening
awards real inventory once; exact receipt replay survives expiration/reload/
takeover; changed input cannot reuse an attempt; missing settlement bars late
execution; concurrent duplicates serialize; the GameSession does not refresh a
queued stale request; owner/revision/game replacement/deadline fences hold; quota
failures in each of the three transaction stores roll everything back; a corrupt
receipt never becomes a retry; and the v2 upgrade preserves an old manual save
byte-for-byte at the structured-data level. Current v3 code must be used when
opening a migrated database; this is not a downgrade-to-v2 compatibility claim.

All 45 new knowledge tests passed within the full suite. They include hidden-world
observation/route/context/refusal equality, forbidden-read getters, unchanged
historical sources, observed blockage versus unseen changes, source ages, scope
and budget limits, and bounded room-page point reads. See its report for actual
generator seeds and scan-cost limitations.

Local ignored evidence: `test-results/rpg-commands/results.json` with exact
effect/recovery and outbound/page-error audit attachments, and
`test-results/d1-regression`, `test-results/click-navigation`. The final command
run added an expired-replay assertion after the full unit/build run; runtime code
was unchanged. Earlier NS-6 paired, resize and compositor results are historical,
not reexecuted or newly qualified by this sub-slice.

## Next Exact Integration

1. Archive lawful observation sources with the real save transaction; retain a
   snapshot-bound knowledge head with manual saves/load/new-game lineage. Validate
   stored source witnesses before using remembered routes, without reconstructing
   history from current authoritative cells. Do not copy the game into a fixture.
2. Adapt the existing DestinationOperation executor to that knowledge and the
   receipted local command boundary. Keep its immutable target/grant/usage, Stop,
   reload/adoption and cancellation semantics. One local step is not a model call.
3. Bind the existing Agentica manifest/actions/admission/outbox protocol in the
   same RPG transaction boundary. A GameCommandReceipt alone does not suffice for
   SDK action custody or host-proven objective completion. Reuse exact original
   protocol identity/results rather than wrapping a second mutable game around it.

A2 discovery, A3 protected survey-item collection and return, Q authored A/B
recovery/cross-runtime proof and separately authorized live-model qualification
remain outstanding. The goal remains active.
