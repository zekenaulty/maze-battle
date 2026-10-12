# A1 First Sub-slice: Explicit Interaction and Click Travel

2026-10-11. Implementation: `e0be2f1573e868d0490fe0939434ce00bf2c6d8d`,
including controls integration `4961a56` (isolated agent source `c5198c7`).
Branch: `codex/agentic-game-a1`, cumulative from D1 `e0616f4`.
Status: PASS at ordinary RPG domain/UI/native-save level; A1 remains partial.

## Delivered

- Mouse click and touch tap select a currently visible reachable tile. The shared
  solver runs on visible reciprocal edges only. Local execution uses the actual
  GameSession movement path, waits for each persisted state publication, and
  stops for manual input, dialogs, battle, custody loss, obstruction or deadline.
  WASD/arrows, the touch D-pad, camera drag and zoom remain available. E opens an
  eligible chest, M toggles the map, I opens party/inventory, T uses the existing
  shared portal-scroll command. Repeated action keys and editing/modifier keys
  are excluded. Escape cancels click travel.
- Manual movement and teleport do not open chests. A visible Open chest action
  and E submit the exact chest ID to the same game-owned eligibility/loot service
  used deliberately by Auto. Arriving through click travel also does not activate
  stairs. Existing keyboard/D-pad stairs remain unchanged.
- Creation, normalization/loading, portal travel and floor movement no longer
  run Auto's quest acceptance/payment policy. Accepted objectives still record
  progress from movement, loot and defeated enemies. Completion is unpaid until
  an explicit claim or Auto's deliberate policy boundary. Existing active,
  complete and claimed save records retain their status across normalization.
- Auto retains automatic chest collection and guild acceptance/turn-in through
  its controller. No new inventory, world, quest or save store was introduced.

See the agent's [controls report](click-navigation-qualification.md) for exact
route bounds, coordinate handling and its independently checked source scope.
That report describes the pre-integration parent code; this report supersedes
its pending quest/teleport and D1 regression notes, not its evidence history.

## Integrated Verification

All commands ran in the integrator worktree against the implementation above.
No retries, provider calls, production deployment or merge. Chromium mobile
tests use device emulation, not a physical phone.

| Check | Result |
| --- | --- |
| Full Vitest suite, `--maxWorkers=2` | PASS: 1,904 tests / 137 files, 188.74s |
| `tests/e2e/click-navigation.config.ts` | PASS: 8 desktop/Pixel 7 real-App cases, 39.3s |
| `tests/e2e/d1-rpg-playwright.config.ts` | PASS: 14 new/legacy/safe-room real-App cases, 2.3m |
| `tests/e2e/d1-regression.config.ts` | PASS: 33 custody/import/inventory/gameplay/capacity/native-scale cases, 1.1m |
| `tests/e2e/resize-playwright.config.ts` | PASS: 2 same-session resize/DPR cases, 1.3m |
| `npm run build` | PASS: TypeScript and Vite production build, 2,073 modules |
| Visual check | Desktop and mobile closed-chest arrival screenshots inspected; no control overlap |

The 57 browser cases include real IndexedDB saves, manual chest opening exactly
once through E/button and reload, click arrival without loot, Auto collection,
accepted legacy fetch completion without payment, explicit Guild claim and
reload, shared portal stock, cross-tab takeover and safe-room encounters with
encounters enabled. D1's older chest-on-arrival expectation is deliberately
replaced by closed-on-arrival then explicit-open assertions. Legacy v1/v2
fixtures explicitly contain an accepted fetch contract rather than relying on
creation to accept one.

Initial integrated failures are retained here as evidence, not product passes:
the first unit pass exposed two tests relying on implicit initial acceptance or
kill-reward payment; their fixtures/expectations were corrected. The first D1
regression pass was 32/33: its capacity fixture had no accepted/cleared quests
after the policy change, so Auto properly selected new unfinished work instead
of descending. The fixture now explicitly seeds an already-cleared floor; all
original capacity/custody/reload assertions remain and all 33 cases pass.

Ignored local evidence: `test-results/click-navigation`, `d1-rpg-browser`,
`d1-regression`, `d1-resize`. The controls JSON includes page-error/outbound audit
and persisted-effect attachments. Test servers used strict isolated ports
5203/5199/5202/5197; the owner's port 5190 was not changed.

## Remaining A1 Gates

This is NOT a durable Agentica effect or destination-host qualification. The
ordinary RPG still lacks historical observed-edge evidence, durable action
admission/receipt reconciliation, an actual-game Agentica binding, and its
corresponding recovery proof. Click travel intentionally refuses remembered
but currently unseen routes instead of reading their authoritative live edges.
It has 64-step/15-second bounds and is not a durable agent intention.

Next: integrate the actual RPG transaction/observation ledger and game-owned
commands with the existing destination executor/Agentica protocol. Preserve
voluntary effect authority separately from movement; do not promote Auto's
hidden target selection into the agent capability. A2 discovery, A3 protected
survey-item collection/return, and Q two-dungeon cross-runtime qualification
remain NOT RUN. Earlier NS-6 regression evidence is unchanged, not newly rerun
by this sub-slice. No traps/pressure plates were added or newly qualified.

The development preview is `http://127.0.0.1:5198/`, on a separate storage origin
from the owner's existing game. The umbrella goal remains active.

### Subsequent Controls Verification

A separate agent rechecked the controls against integration `690f2b1` after the
command/archive/memory changes: 83 focused unit tests across 9 files, all 8
desktop/Pixel 7 browser cases, and TypeScript passed. No controls defect or
tracked code change was needed. Browser audits had no page errors or outbound
requests, with no skips/retries; screenshots were inspected. This does not
upgrade the separate Agentica host-binding evidence. Local evidence is in the
isolated controls worktree's `test-results/click-navigation-integration-690f2b1`
and `tests/e2e/test-results/click-navigation-integration-690f2b1` directories.
