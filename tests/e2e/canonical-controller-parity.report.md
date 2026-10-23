# S4 Canonical Controller Effect Parity

Base: `07114dc`. Branch: `codex/canonical-controller-parity`. Test-only increment.

## Qualified Boundary

One finite native Chrome/IndexedDB cohort runs three fresh isolated browser contexts against the existing corpus A genesis. No injected sight, checkpoint placement, private map route, new game implementation, or changed domain rules. The public-observation setup uses the real Manual hook to disable auto-equip, visit town, explicitly accept both posted contracts, leave town, discover the unopened chest in 24 moves, and step back twice. These 31 setup receipts are retained. Only current GameView offers and accumulated ordinary sight select the setup route; the separate authoritative audit never feeds any controller.

| Controller composition | Measured authorization and effects |
| --- | --- |
| `useGameCommands` -> `GameSession.execute` | Two explicit earned moves with `triggerStairs:false`, then explicit `openChest`. A second fresh open is unchanged with no loot. |
| `CanonicalAutoController` -> `GameSession.execute('auto')` -> `commitAutoCommand` | Two scheduler ticks select earned-route movement, then one separate tick selects current-tile opening. Actual nested action/reason receipts are asserted. Scheduler pauses between ticks; it receives no target or route from the fixture. |
| `createGameActionHooks` -> `executeGameAction` -> `createGameOperationDriver` -> `GameSession.submitHostCommand` | Explicit known-address navigation, then a separately funded launch that inspects the current cell and uses only its opaque token for interaction. Typed offline admission/custody replies, not a service or SDK transport. |

The shared executors are `game/explorationCommand.ts` and `game/contentCommand.ts`; Agentica's navigation/interaction operations and Auto's selected actions reach those rules. The test compares authorized effects, not selection policies. Auto's guild selection authority is not granted to Agentica. Both contracts are already explicitly accepted and active before measurement, eliminating unrelated Auto acceptance/claim policy steps from this case.

Assertions retain canonical heads, receipts, content record envelopes, floor record, party, pack, stash, policy, contracts and accepted quests. Both approach edges are in the original sight. Each controller reaches the same chest in two actual moves, with no collection, quest changes, reward, town mode, or party/inventory changes during navigation. Manual and Agentica also retain the exact world root during travel; Auto legitimately writes its own progress. Chest opening conserves ordinary loot plus exactly one carried fetch item, completes only the selected fetch, leaves the locate quest active, and does not claim gold. The existing collection rule runs with explicitly disabled auto-equip; random ordinary loot is not byte-compared across contexts.

Original canonical effect requests replay without head/effect changes. Manual/Auto replay the whole request from its retained receipt fingerprint, including fence/deadline; Agentica retries the captured driver apply/advance request. After explicit session shutdown and native reload, Manual/Auto repeat the original request; Agentica verifies completed save/load/onAction/reconcile. Heads and all audited effects remain exact across each replay. Agentica Stop delivers retained event prefixes, acknowledges each child and root using explicitly synthetic replies, and ends both launches with zero reservations. This does not prove remote clearance against an actual service.

## Checked Evidence

- Native: **1 PASS**, three controller runs, 27.968 seconds test / 31.8 seconds total. `test-results/canonical-controller-parity-checked/results.json` retains raw setup/effect/reload attachments and the finite parity summary.
- Focused existing controller units: **63 PASS / 3 files**, 31.42 seconds.
- Root TypeScript and dedicated fixture TypeScript: **PASS**.
- Largest measured Agentica command read work: navigation 372 reads / 557,047 bytes; interaction 371 reads / 424,941 bytes. These are observed maxima, not new limits or universal bounds.
- Starts: 3,055 bytes; largest result: 1,858 bytes; largest observation: 1,469 bytes. Assertions preserve 3,584 / 4,096 / 2,800 byte caps.
- No production, shared service fixture/config, SDK, provider, owner preview, or parent changes. Only port 5466 used; listener released. No full suite or paid calls.

```powershell
$env:MAZE_PARITY_RUN='canonical-controller-parity-checked'
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-controller-parity.config.ts --workers=1 --retries=0
node node_modules/vitest/vitest.mjs run src/hooks/useGameCommands.test.tsx src/services/game/CanonicalAutoController.test.ts src/services/game/GameSession.agentic.test.ts --maxWorkers=2
node node_modules/typescript/bin/tsc --noEmit
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-controller-parity.tsconfig.json
```

Retained failed fixture candidates, not production defects: `canonical-controller-parity-first` assumed collection never auto-equips; corrected with the explicit owner policy command. `canonical-controller-parity-second` asserted progress at the wrong quest field; corrected to `task.progress`. `canonical-controller-parity-final` used property-order-sensitive address lookup in the added edge assertion; corrected to structural address keys. The earlier `canonical-controller-parity-third` passed before the final edge/world-root/payload assertions. Failed native traces and raw attachments remain in those worktree-local directories.

## Review Hardening

Follow-up to `bda149e`, test-only. The original reload check proved replay did not mutate the already-reloaded state, not that reload preserved the stopped state. The original inventory check covered loot-bearing stack bases and total quantity, leaving unrelated-item substitution undetected. The stronger assertions below supersede those two earlier evidence claims; original output and failed candidates remain intact.

- Every controller's stopped pre-reload head must equal the persisted head read before the new session claims ownership. The entire post-start head must then match, including checkpoint position/facing/knowledge and all persisted roots, except the new owner, exactly two epoch/revision increments for takeover/resume, and increased receipt-accounting bytes. All other quota fields remain exact; this is not an independent storage-accounting qualification. Audited content must remain unchanged across reload as well as replay.
- Collection preserves capacity/gold, every preexisting and incoming nonstack item exactly, unique output IDs, and exact aggregate quantities for every stack metadata identity, including bases absent from loot. Legitimate stack merging is allowed without equating unrelated items.
- Thirteen focused assertion cases include eleven negatives: the reported mana-vial removal/health-herb doubling, old nonstack loss/mutation, capacity change, position/facing/knowledge rollback, each persisted root, and a rollback already present before custody claim. Reload negatives deliberately leave before/after replay equal.
- Checked: **14 PASS**, no retries/skips, **24.448 seconds total**. This is **13 assertion checks plus 1 native three-controller case** (20.486 seconds), not fourteen native scenarios. Raw attachments now include the pre-claim persisted snapshot. Evidence: `test-results/canonical-controller-parity-hardening/results.json`.
- Root and dedicated fixture TypeScript: **PASS**. No production changes, provider calls or service runs. Existing scope limits below remain unchanged.

```powershell
$env:MAZE_PARITY_RUN='canonical-controller-parity-hardening'
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-controller-parity.config.ts --workers=1 --retries=0
node node_modules/typescript/bin/tsc --noEmit
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-controller-parity.tsconfig.json
```

## Limits

This is a mounted Manual hook, real Auto scheduler/policy and real Agentica host adapter/operation-driver composition on native IndexedDB, not the complete App UI or actual Agentica service. Navigation and interaction use two explicit offline launches, not a successor decision chain. No policy equivalence, arbitrary-world coverage, long-route coverage, combat, stairs, town effects, reward claims, default auto-equip behavior, or unrestricted inventory coverage is claimed. No runtime defect was found in this slice. The broader active goal remains open.
