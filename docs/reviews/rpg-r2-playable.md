# R2/R3: Playable canonical battle vertical

## Scope

Canonical battle commands now own encounter admission, manual skills/rounds,
individual AI, explicit automation, terminal settlement and End. The actual App
uses the retained BattleScreen, not a parallel game. Its small display-clock
wrapper does not apply effects; the scheduler submits revision-fenced intentions
to GameSession. All thirteen existing skill IDs and their existing rules remain.

Battle/header/enemy/loot and party rows are committed atomically. Newly defeated
enemies award XP/levels/auto attributes and accepted origin-room kill progress;
victory credits pending gold and loot once, then removes the battle records.
Equipment evaluation and item stacking reuse the existing roster rules. Gold is
chance-based, including legitimate zero-gold victories. Loss remains inspectable
and End returns to town. Reload/load/takeover pauses battle automation rather
than silently resuming it. Individual actor preferences remain persisted.

Manual Stop cancels both exploration/Waves continuation and battle automation.
Dialogs pause scheduling. A completed battle returns to the selected 2D/3D
projection. Noncombat Agentic Play remains fenced away from battle; no combat
tools or provider calls were added. Existing encounter preference defaults remain
unchanged, with an enabled user toggle and a working Waves command.

## Evidence

- Core/kernel/COW worker: 779 PASS, 62 files, including 63 command cases.
- Parent full root before the subsequent chest guard: 5,364 PASS, one existing
  optional skip (`test-results/r2-full-first.json`).
- Session admission cases: 37 PASS, including stale End/Stop/skill queued behind
  a completed battle without losing custody. Canonical ID validation stays strict.
- Native actual-App/IndexedDB: four PASS (`test-results/r2-battle-3d`): skill
  cooldown display, Stop, exact party/battle reload, victory/one-time persisted
  settlement, dialog pause/fresh resume, and retained 3D projection after End.
  The repeatable victory case controls Math.random; it uses ordinary commands
  and an unmodified starting party. Other cases use generated encounters.
- Inspected desktop/phone battle and post-battle 3D screenshots. No horizontal
  overflow; phone retains member selection, two skill rows and a separate log tab.
- Root/fixture types and production bundle PASS; existing large-chunk warning.

Two fixture defects were corrected without changing game rules: the first run
used a nonexistent settings label (all three cases timed out), and the next run
incorrectly required every battle to award gold (one FAIL/two PASS). Original
traces remain in `r2-battle-first` and `r2-battle-corrected`.

Independent review found and repaired active-battle chest admission; five new
kernel cases protect inventory, quest, observation and chest state and replay.
That isolated worker's focused combat suite has 150 PASS. Native chest/battle
composition, loss, named-save combat, cross-tab battle custody and sustained
Auto/quest/town qualification remain later gates, not claims of these four tests.

## Remaining

R4 Auto kill-objective integration is separate from this vertical. Further work
includes sustained multi-floor play, durable gameplay telemetry, exploration
Teleport and finite-retention qualification. Existing ignored local assets were
copied from the checked R0 selection for visual tests; Git alone does not ship
them. No owner saves, Lab configuration or live-provider runs were touched.
