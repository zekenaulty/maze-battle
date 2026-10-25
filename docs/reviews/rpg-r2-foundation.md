# R2a/R2b: shared turns and bounded battle records

2026-10-24. Checked foundations; canonical battle commands, scheduler, settlement
and App battle screen are not yet connected. No playable-combat claim.

## Shared skill execution

Parent commit `fa1adcf` cherry-picks worker `d337c19`. `executeBattleTurn` takes a
narrow party/battle frame, equipment bonuses, a skill/round intent, host RNG and
time. It returns the owned combat context, status, action flag and only newly
defeated enemies. No maze, floor map, quest list or full GameState is required.

The retained battleEngine adapters call that same core, preserving legacy
compatibility tests rather than maintaining a second effect implementation.
Skill catalog, applySkill, combatant timing, targeting, class AI and reward rules
are unchanged. All 13 IDs have focused effect/timer checks, including charges,
recharge, AoE, healing/resurrection and equipment input. Combat Teleport retains
its existing effect; exploration Teleport remains a separate pending connection.

The caller must not publish a refresh-only context for an idle active turn.
Terminal status can still require handling when no action occurred. Manual
skills retain an enemy response; rounds retain enabled-hero AI then enemy AI.

Parent full root run on `fa1adcf`: **5,198 PASS / one existing optional skip**,
zero failures. Report: `test-results/r2a/units.json`; direct Vitest runner with
`--maxWorkers=2`. This includes the initial R1 repairs. Worker separately checked
156 cases including 38 new core/parity cases. These are not native battle tests.

## Battle state ownership

Parent `1db8827` cherry-picks worker `ec74cb6`. New canonical combat records use
one `combat/current` header and exact per-battle enemy/loot child keys. Existing
v9 saves with no header load as no battle; no reset/migration is required.

The header carries identity, canonical origin, round/wave/status/return mode,
bounded log, pending reward gold, stall count and child IDs. Actor resources and
skill timers remain in roster rows. At most ten total living/defeated enemies,
twenty loot items and twenty log entries are retained. Split rows stay below the
unchanged 64 KiB record cap even at validated maximum metadata/item bounds.

Loading uses at most 31 exact page reads. Saving uses at most 61 exact reads and
61 staged mutations, with no scan. It validates ownership/identity/life/resource/
skill/tag relationships, stale prior state, collisions and missing children
before staging changes, preserves unchanged rows and deletes only retained IDs.
These are page-API work bounds, not exact native IndexedDB request counts.

Parent combat/core plus record tests on `1db8827`: **178 PASS / nine files**;
root TypeScript and diff check PASS. Worker separately checked 311 cases across
24 files, including 82 new record/validation/bounds checks. Records currently use
mock pages; transaction rollback, native reopen, reward settlement and actual-App
combat remain the next qualification boundary.

No hidden-world navigation, new provider tools, paid calls or owner-state changes.
The production battle path remains disabled until its coherent command/UI/recovery
vertical is ready. Durable records alone are not restored gameplay.
