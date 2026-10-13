# Interim Ordinary-Game Recovery

This prerequisite reset clears every store in the existing `maze-battle` IndexedDB
database and seeds a new ordinary RPG game, observation root, control identity,
and telemetry in one transaction. It does not clear separate expedition databases,
legacy storage, or other Maze Battle databases. Their destructive retirement is
pending the parent's canonical persistence cutover; this is not a global data reset.
Startup no longer imports legacy localStorage saves.

Follower claims validate a referenced observation head and its immediate predecessor
using the same validators as append. They do not create, repair, or rebuild evidence.
An absent head retains its existing headless semantics. Failed claims remain in
explicit recovery until retry or reset, rather than being adopted by periodic refresh.

## Native Checks

Run from the checkout being qualified:

```powershell
node node_modules/@playwright/test/cli.js test --config tests/e2e/game-reset.config.ts --list
node node_modules/@playwright/test/cli.js test --config tests/e2e/game-reset.config.ts
```

The dedicated config discovers exactly six native IndexedDB tests. It starts this
checkout's Vite server on port 5197 without reusing another server; set
`MAZE_RECOVERY_TEST_PORT` to an unused port when needed. The tests cover corrupt
history/control for follower and owner claims, rollback at three seed-write points,
and a queued stale writer. Listing tests is not browser execution or atomicity proof.
## Integrated Verification

2026-10-13, integrated through `2d64490` plus the actual-App fixture below:

- Combined unit suite: 2,672 tests / 169 files passed in 200.77 seconds after
  reset and importer removal. The subsequent follower-validation change passed
  44 focused custody/session/App tests; that change did not rerun the full unit suite.
- Native reset suite: 6/6 passed in 10.2 seconds. This executed the rollback and
  stale-writer checks above, rather than merely discovering them.
- Actual-App desktop and Pixel 7 suite: 18/18 passed, including four corrupt
  history/control recovery cases. Cancel preserves all saved values; confirm
  produces a new owner/game and source head; reload restores the new game. Canvas
  pixel diversity checks and screenshots show rendered floors/walls/player.
- Native RPG command suite: 196/196 passed, including unchanged Agentica SDK
  dispatch, travel, source parity, exact replay, quotas/failure injections and custody.
  This suite still includes historical schema tests pending the actual cutover;
  it is regression evidence, not qualification of a new canonical schema.
- Production TypeScript/build and click/storage fixture TypeScript checks passed.
  Main bundle is 550.99 kB; the existing >500 kB warning remains.
- No model/provider calls or paired live-service tests were run.

The first actual-App run had 14 passes and four failures because the new test
incorrectly selected a canvas as `role=img`. The failing snapshots already showed
the recovered game. Correcting the selector to its existing `Dungeon map` label
retained, rather than weakened, the source and pixel assertions; all 18 then passed.
Initial results remain in `test-results/issue-11-recovery-initial-browser-results.json`.

The owner's 5198 preview was reloaded and visibly exposed `Retry` and
`Reset and start new game` beside the original load error. No reset was performed
against the owner's browser data; the destructive final confirmation is left to
the owner. Native/App tests use isolated origins and disposable fixtures.

This closes P0 in [the replacement plan](../canonical-persistence-plan.md), not
issue #11. Whole-history saves and the separate expedition authorities remain
until the coordinated cutover.
