# Native App battle recovery qualification

Runtime: `d189639223f33f7a74f5646b6ed24fc5d07c551c`. Test-only extension of
`5ba60e9efc23d7bc04490fa41f851dab4e6f765c`, branch `codex/app-auto-kill-qualification`.
No production edits, provider/service calls, parent checkout changes or owner data.

## Finding first

**P2: stale battle controls remain interactive after ownership transfer.**
`src/App.tsx:52-56` does not pass control availability to BattleView;
`src/components/BattleActions.tsx:69-70` disables Slash only for battle/skill state.
Clicking it in the now-read-only old tab produces an unhandled rejection from
`src/hooks/canonicalManual.ts:15`, `Game control is unavailable.`
The kernel is fenced correctly: full canonical head and party stay unchanged;
the new owner can subsequently cast. This is a UI error-handling/control regression,
not unauthorized combat. The native test retains a strict zero-page-errors assertion
and is **FAIL**, not skipped or marked expected-failure. Runtime repair belongs to parent.

## Cases and boundaries

- **PASS, 12.224s:** loss -> explicit End -> Town -> free Rest -> Dungeon, same position.
  Labelled fixture sets party HP to 1 through `executeCanonical` + validated `saveRoster`.
  Per-actor Auto is disabled through real checkboxes. No raw IDB writes, altered enemies,
  rewards, stats, geometry or teleport. Assert exact HP-only delta, unchanged battle,
  inventory/stash/quests/checkpoint/knowledge root, then reload and actual Round.
  Loss at round 2: HP `0/0/0`; rest `110/50/60`, full MP, gold remains 35.
- **PASS, 14.477s:** actual Saves/New save while battle active and unpaused; victory;
  actual Load/confirmation; same battle/enemies/round/party restored paused; reload;
  second victory and reload. Wallet `35 -> 41 -> restore 35 -> 41`, not 47.
  Six items awarded after the restored victory, unique IDs, no stash copies.
  This is a deliberate named-save rewind, not a claim of low-level receipt replay.
- **FAIL, 12.833s:** second tab initially read-only; explicit Take control; owner epoch
  `1 -> 3`; progressed active battle stays at round 2 and becomes paused/manual.
  Full battle/party/inventory/stash/quests/position preserved. Old Slash has no canonical
  effect; new owner's Slash advances to round 3. Only the unhandled UI rejection fails.
  An ordinary Battle settings dialog suspends the old scheduler during transfer;
  durable battle remains active/unpaused before transfer. This is not an in-flight
  transaction/queued-cast race or an all-controls/viewport matrix.

All cases mount untransformed App in fresh disposable browser contexts/native IndexedDB.
Seed 781, Math.random 0.5 for setup/spawn; named-save victory resolution uses 0.9
for ordinary nonzero gold rolls. UUIDs and real clocks remain unchanged. No party boosts.
Passive transaction-complete capture is shared with the prior journey. Paused stability
checks wait 2300ms, beyond the ordinary configured 2000ms throttle. Only local-origin
HTTP/Vite HMR is permitted. Config uses strict 5496, never listener reuse.

## Commands and retained evidence

From this worktree (Node 22.13.0, npm 11.6.2, system Chrome / Playwright 1.61.0):

```powershell
npx tsc --noEmit -p tests/e2e/canonical-app-battle-recovery.tsconfig.json
npx tsc --noEmit
$env:BATTLE_RECOVERY_OUTPUT = "$PWD/test-results/app-battle-recovery-d189639-final"
npx playwright test -c tests/e2e/canonical-app-battle-recovery.config.ts
```

Both type checks **PASS**. Final native **2 PASS / 1 FAIL**, 43.083s total; no retries/skips.
`test-results/app-battle-recovery-d189639-final/` retains runner log, source identity,
type logs, JSON inline state/receipt/head attachments, screenshots and failing trace.
Attempt1 retains the same takeover error plus an immediate Playwright `.uncheck()`
assertion race; loss fixture now clicks once and awaits both UI and canonical state.
Attempt2 loss-only **1 PASS**, 12.3s. Both earlier evidence directories are retained.
Rested-town and old-owner screenshots inspected. All processes terminal, 5496 released.
Prior fresh Auto journey was unchanged and not rerun. No full-suite qualification claim.
