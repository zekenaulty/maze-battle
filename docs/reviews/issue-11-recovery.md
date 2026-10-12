# Interim Ordinary-Game Recovery

This prerequisite reset clears every store in the existing `maze-battle` IndexedDB
database and seeds a new ordinary RPG game, observation root, control identity,
and telemetry in one transaction. It does not clear separate expedition databases,
legacy storage, or other Maze Battle databases. Their retirement or migration is
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
The parent owns actual-browser integration qualification.
