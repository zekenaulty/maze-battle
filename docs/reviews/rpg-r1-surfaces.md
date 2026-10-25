# R1: initial playable-surface repairs

2026-10-24. Checked repair batch, not completion of R1 or RPG restoration.

Runtime commits: `d06285e` (click/stairs), `b3ec66f` (skill clock and policy
inputs), `43f1029` (shared reserve bounds). The isolated worker originals are
`6ee42cd` and `3354e55`; parent reviewed and cherry-picked those exact changes.

## Restored behavior

- A completed click route permits the game's ordinary stair effect only on its
  final selected tile. Intermediate crossings and partial bounded route windows
  still suppress stairs; navigation never chooses voluntary chest interactions.
  A floor/town transition ends that local walking intention, including when floor
  preparation publishes beyond the initial movement receipt.
- Character Skills uses its existing local display clock again. Expiry updates
  the buttons without a GameSession publication or automatic skill cast. Closing
  or leaving Skills removes the timer. This clock is not a combat scheduler.
- Town and inventory policy controls reject invalid reserve inputs before any
  command dispatch. Canonical validation remains strict. All five consumers use
  one readonly `INVENTORY_RESERVE_BOUNDS` definition: health/mana 0-20, portal 1-5.
  Existing normalization/defaults and command error behavior remain unchanged.

## Evidence and limits

- Initial worker reproductions: 7 FAIL / 3 PASS before its UI fix; retained at
  `rpg-restoration-r1/maze-battle/test-results/r1-2a06eba`.
- Parent combined focused set on `b3ec66f`: 111 PASS / seven files. Includes the
  33-case click-route suite, App-mounted skill-clock regression, roster commands,
  town/character navigation and reserve-input controls. Skill-clock App tests use
  a mocked session, not a native persisted combat scenario.
- Parent after shared bounds: 116 PASS / six selected files, including roster
  codec/commands, item policy/Auto inventory, skills UI and click-route checks.
- Native actual-App cohort on `b3ec66f`: 17 PASS, including the new clicked-entrance
  return. It reaches town and returns to the retained dungeon without consuming a
  portal scroll. Existing manual/Auto/custody/save/depth checks remain intact.
- Native final policy cases on `43f1029`: 2 PASS. Both actual town/inventory panels
  reject 0/6 portal, 21 health and fractional mana without changing the revision
  or losing control; a valid portal reserve of 5 saves in exactly one command.
- Root types and production bundle PASS before shared bounds; final root/fixture
  types and bundle are checked again with the committed batch. The existing
  large-chunk warning remains.

First stairs-browser attempt reached town, then failed because the fixture used
the nonexistent return-button label `Return to dungeon`. Changed only that label
to the actual `Dungeon` button; corrected single case and full 17-case cohort
passed. Original failure retained in `test-results/r1-first-stairs-fixture`.

Commands: direct `node node_modules/vitest/vitest.mjs run <selected paths>
--maxWorkers=2`; `node node_modules/@playwright/test/cli.js test --config
tests/e2e/canonical-app.config.ts` (full 17 cases before adding the two separate
policy cases), then the same command filtered to `canonical-app.policy.spec.ts`.
The fixture type project is `canonical-app-restoration.tsconfig.json`.

Cross-floor guild/history, exploration Teleport, pack-overflow design and canonical
combat/Auto/Waves remain pending. Neither this batch nor retained combat unit
tests claim those are playable. No providers or owner-data resets.
