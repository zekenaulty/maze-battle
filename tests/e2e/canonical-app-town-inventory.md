# R5 actual-App town and inventory composition

Candidate: `a2d49d1de3e13c2580241eec18de679c9ce548c0` plus these test-only files,
branch `codex/app-town-inventory-qualification`. Production and existing helpers
are unchanged. Parent uncommitted work is not included.

## Boundary and cases

Three fresh disposable Chromium contexts on strict `http://127.0.0.1:5498`,
actual untransformed App, native IndexedDB, seed 781 / Math.random 0.5. Reuses
the existing passive committed head/receipt capture and read-only canonical
projection. UUIDs and clocks remain real. All actions use visible App controls;
no direct mutation, authored item/gold/HP fixture, transport, provider or service.
Only local HTTP and Vite HMR are permitted. Starting party, 35g, 36 pack slots,
three starter items, empty stash/quests and unchanged throttle are asserted.

1. Consume the actual starter portal, disable Auto equip through Town Care,
   purchase an 8g Rusty Sword, equip/unequip it in Characters, stash it, withdraw
   it through Town Storage, return to the original dungeon position, and reload.
   Exact item identity and party fields are retained. Equipped sword stays in
   inventory while Pack changes 3 -> 2 -> 3; equipped Stash/Sell are disabled.
   Storage changes Pack to 2 then 3 without changing the remaining 27g.
2. Portal, buy four 6g herbs with starting gold, combine with the original herb
   into one five-unit stack, select/sell two units for 8g, then Sell All of the
   remaining three for 12g. Exact gold sequence 35 -> 11 -> 19 -> 31, original
   stack identity/remaining metadata and unrelated item/party/stash are asserted.
   Reload retains the sale; no item is recreated.
3. Portal, set Town Care reserves to 7/4/3, inspect the same values in Characters
   Inventory care, set 0/20/5 there, reload and inspect both panels, then return
   to the dungeon. Exact policy (including unchanged toggles), inventory, party,
   quests and position are asserted. This tests persistence, not Auto restocking.

## Evidence and commands

From the worktree root in PowerShell:

```powershell
$env:TOWN_INVENTORY_OUTPUT = "$PWD/test-results/app-town-inventory-a2d49d1-attempt2"
npx playwright test -c tests/e2e/canonical-app-town-inventory.config.ts
npx tsc --noEmit -p tests/e2e/canonical-app-town-inventory.tsconfig.json
npx tsc --noEmit
```

- Native: **3 PASS**, 0 failed/skipped/retries, **21.939s** runner total;
  case durations 6.399s / 6.056s / 5.726s. Global timeout stays 120s.
- Fixture types: **PASS** (`attempt2/types.log`). Root types: **PASS**
  (`attempt1/root-types.log`; no production changes between runs).
- Retained `attempt2/results.json`, `runner.log`, `source.txt`, fixture SHA-256
  hashes, full state attachments and three inspected 1280x720 screenshots.
- Committed receipt counts before/after reload: 24+2, 23+2, 23+3. Across all
  cases: 3 initialization, 42 preparation, 3 exploration, 23 roster and 6
  control takeover/resume receipts. Capture did not overflow. Each fresh page
  requested one seed; each reload requested zero. Browser errors and denied
  external network attempts are empty in all cases.
- Original `attempt1` is preserved: **1 PASS / 2 FAIL** in 22.4s. Both failures
  were exact test expectations omitting `quantity: 1` on existing consumables
  after vendor merging. `itemStacks.ts` explicitly materializes these values.
  The corrected tests assert that exact post-purchase shape, then compare all
  subsequent item fields without normalization. Initial optional-policy type
  errors and their corrected passing typecheck are also retained there.

All evidence directories above are under this worktree's `test-results/`.
Node 22.13.0 / npm 11.6.2 / Playwright 1.61.0, installed system Chrome.

## Limits

Desktop-only bounded composition, not full R5 qualification or a mobile matrix.
No full-pack admission, bulk obsolete-equipment sale, automatic restock, combat,
earned loot or paid-provider claim. Starting resources suffice for every case;
the potion sale and sword roundtrip are separate fresh games. No runtime defect
was observed. Strict port 5498 is released after the terminal run.
