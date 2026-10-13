# Issue 11: Earned Exploration Persistence

2026-10-13. Source: `b6b8720`, `b128600`, `5ef1577`, `0559b5b` on
`codex/agentic-game-a1`. **PARTIAL issue delivery.** Native browser qualification
of the canonical game commands; not actual App or Agentica adoption. The preview
on 5198 has not been switched to the canonical writer by this increment.

## Implemented

- Shared synchronous/asynchronous linked-BFS visibility frontier. The existing
  ordinary grid reader and canonical local room reader use the same traversal
  rule. Canonical sight uses radius seven, at most 113 physical cells and sixteen
  resident spaces; those are explicit work bounds, not world-size limits.
- Strict noncombat `look`, `move` and `stairs` commands. One transaction resolves
  local geometry, accepted local scout/locate progress, position/facing, sight,
  remembered facts and original command receipt. It reads bounded party resources,
  not the inventory or historical floors. Moves do not accept, loot or claim.
- Reciprocal room/passage traversal and floor return use the existing canonical
  resolvers. An ungenerated next floor returns a preparation requirement; an
  established destination with missing records fails rather than regenerates.
  Optional `triggerStairs` preserves the ordinary movement control distinction.
- Observations reveal only covered cells, visible chests and visible stairs.
  Open links require both endpoints in coverage. Cropped open exits disclose no
  unseen destination; missing directional coverage is not interpreted as a wall.
  No room extents, names, role tags, generation recipe, quest targets or loot
  contents are copied into the observation.
- Immutable observation headers/chunks and 4x4 remembered-cell blocks in the
  canonical knowledge area. Headers bind owner/epoch/revision, actor, policy,
  previous source and exact chunk record identities. The compact game checkpoint
  pins the latest source and primary perception-namespace identity.
- Known-room pages and 1-64-cell detail queries read only knowledge/evidence.
  The same projection is intended for human and agent callers. They do not consult
  world truth, regenerate geometry or refresh unseen facts. Historical roots keep
  pagination and recalled facts pinned to the selected snapshot.
- Unchanged remembered facts retain their source and are not rewritten merely
  because they are visible again. A fresh observation separately proves current
  visibility. Newly covered edges are learned; subsequently cropped coverage
  retains the old edge and its provenance, rather than erasing or refreshing it.
- Explicit chest opening records changed visible chest state in the same commit
  as actual loot/quest custody. Town suppresses current dungeon visibility; return
  earns a new observation without changing the older evidence.

The checkpoint's `knowledge: null` is an unobserved initialization phase, not an
old-save fallback. Movement requires an initial committed observation. No prior
save reader, migration or parallel playable entrypoint was added.

## Evidence and Bounds

Sources live under `perception/observation/<sequence>` with at most eight
sixteen-cell chunks. Memory blocks and first-seen room membership live under
`perception/cell/` and `perception/room/`; only changed blocks are republished.
Source identities and the namespace witness detect missing or replaced canonical
records. This is immutable copy-on-write provenance, not cryptographic protection
against arbitrary raw database tampering. Reads validate source facts and fail
closed; they do not fabricate a new observation to repair history.

History still consumes the explicit global logical quota. It is not pruned or
compacted. Every step currently retains a complete bounded sight receipt, even
when many observed facts are unchanged. The resulting finite action capacity is
intentional and visible, not a claim of infinite retention. Existing funded
operation cancellation/acknowledgement remains independent of world callbacks.

## Native Cost Samples

Actual IndexedDB get/add/put instrumentation, one eastward floor-one step from
the same initial room, with eight generated/qualified/content-prepared rooms per
retained floor. Initial observation was already committed before metering.

| Retained floors | Native reads | Logical read bytes | Native writes | Logical write bytes | Metered elapsed |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 165 | 186,405 | 43 | 82,166 | 79.7 ms |
| 16 | 167 | 188,640 | 43 | 82,187 | 77.5 ms |

Neither step read another floor's record, called native getAll/getAllKeys, nor
wrote a dungeon record. The measured command writes changed local knowledge,
immutable observation evidence, copy-on-write indexes, compact head and receipt.
No inventory scan occurs. The sample's current room had no pending visit reward.

Browser estimated usage changed 512,000 -> 557,056 bytes and
6,774,784 -> 6,811,648 bytes respectively. These are browser allocation estimates;
JSON/native logical payload measurements are **not physical disk I/O**. They also
do not independently measure all JavaScript cloning/serialization CPU. Single
instrumented timings on this Windows host are not a latency benchmark. The actual
App still uses the old persistence path, so no App-level improvement is claimed.

## Checks

- 499 focused unit tests / 17 files passed: canonical storage, shared visibility,
  existing RPG observation/knowledge and their shared algorithms.
- 171 native canonical tests passed in 123.68 seconds, including fourteen new
  exploration/knowledge/cost cases. Five independent review probes then passed
  against the integrated code, plus one additional coverage-boundary case:
  **177 distinct native cases** across these runs, no skips or failures.
- Independent graph-distance oracle matches sight across direct and passage
  joins, in both travel directions. Known-room pages disclose observed membership
  only and remain pinned across later discoveries.
- Exact historical observation/command replay survives reload and takeover.
  New stale requests are refused; original attempts reconcile without new effects.
- Cancellation after staging and quota failure leave position, memory, sources,
  receipt and game head unchanged. Changed source/cache identities fail closed;
  previous snapshots and committed attempt receipts remain independently readable.
- Shared portal return renews sight; manual and Auto-mode movement across a chest
  does not collect or accept. These are command-mode tests, **not adoption by the
  existing Auto loop or Agentica controller**.
- Project and canonical-fixture TypeScript checks passed. Production Vite build
  passed (2,138 modules); existing 557.67 kB main-chunk warning remains.

Run commands:

```text
node node_modules/vitest/vitest.mjs run --config tests/click-navigation.config.ts --configLoader runner --maxWorkers=2 src/domain/maze/visibility.test.ts src/domain/maze/linkedVision.test.ts src/domain/agentic/knowledge src/persistence/canonical
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical.config.ts
node node_modules/typescript/bin/tsc --noEmit
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical.tsconfig.json
node node_modules/vite/bin/vite.js build --config tests/click-navigation.config.ts --configLoader runner
```

The five independent probes are in `canonical-knowledge-review.spec.ts`; the
coverage-boundary test is in `canonical-knowledge-coverage.spec.ts`. Both now run
in the main canonical config. Native cost JSON is attached to the cost test's
Playwright result; subsequent focused runs replace the generated report directory.

## Remaining Adoption

Next is a coherent P3 cutover, not another playable test shell:

1. Bounded resident/session publication and earned canvas projection; canonical
   startup/preparation/reset, compact refresh, manual checkpoint restore and
   cancellation/adoption of active work. Replace the current GameState reducer
   transition API rather than wrapping it around a reconstructed world.
2. Retarget actual manual/click movement, Auto decisions, town/party/quest UI and
   Agentica tools/execution to the same canonical commands and scoped queries.
   Commands here do not themselves grant provider authority. Known-route planning
   must read knowledge; collision resolution remains authoritative and local.
3. Remove obsolete writers/entrypoints/stores and their compatibility tests.
   Qualify actual desktop/mobile rendering, real-session restart/takeover, deep
   revisits and the known-destination/two-dungeon evidence matrix.

Combat is disabled in this vertical. No new trap, pressure-plate, encounter or
inspection-depth implementation is claimed here. Noncombat commands preserve
implemented stair/visit consequences, not hypothetical mechanics. No paid model
or paired-service gate was run; issue #11 and the umbrella goal remain open.
