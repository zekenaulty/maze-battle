# R0: combined canonical and 3D integration

2026-10-24. PASS for this bounded provider-free integration. This is not restored
combat, a fresh live-model qualification, production deployment or unlimited play.

## Exact subject

- Canonical baseline `67e4b9190953825e9a0e2e311b046bb0d021b41d`.
- Incoming `2a06eba63010b489e444da7b7c30d6c16312648a` already contains that baseline
  after its author's rebase. The integration candidate fast-forwards to it, rather
  than reapplying the formerly divergent patches or dropping the final Luna fixes.
- Checked candidate `215a11961f680ba2df0a1f420f5d7536470ac900`: runtime/tests and
  dependency manifests are exactly incoming; only the restoration plan is added.
- Isolated `codex/rpg-restoration` checkout. No owner database, Agentica Lab,
  provider setting or original preview was reset. No paid calls.
- Incoming model/stair workshop is isolated behind `?view=models`. Its pure unit
  tests and root build are included; its separate browser workshop suite is not
  claimed here. Physical canonical stair traversal is not implemented by R0.

## Commands and results

All commands run from the isolated candidate. Node 22.13.0; installed Chrome;
versions resolved by the committed lockfile. Browser stores are disposable.

| Check | Result |
| --- | --- |
| `npm ci --ignore-scripts --no-audit --no-fund` | PASS; 131 packages; no manifest/lock changes |
| `node node_modules/vitest/vitest.mjs run --maxWorkers=2 --reporter=json --outputFile=test-results/r0/units.json` | PASS; 5,144 tests; one existing optional skip |
| `node node_modules/typescript/bin/tsc --noEmit` | PASS |
| `node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-3d.tsconfig.json` | PASS |
| `node node_modules/vite/bin/vite.js build` | PASS; existing large-chunk warning remains |
| Playwright `canonical-3d.config.ts` | 11 PASS; desktop/phone, DPR 1/2, camera/fog continuity, movement, materials, explicit chest, stairs, reload and graphics recovery |
| Playwright `canonical-app.config.ts` | 16 PASS; manual/Auto interruption, named saves, town/portal/party, retained depth, recovery and ownership |
| Playwright `canonical-controller-parity.config.ts` | 14 PASS; 13 assertion checks plus one real three-controller chest/receipt/reload comparison |
| Playwright `canonical-corpus.config.ts` | 10 PASS; A/B earned disclosure, scoped queries, collection/return, refusal, work/capacity boundaries |
| Playwright `canonical-agentica-actions.config.ts` | 24 PASS; SDK scoped actions, original-attempt replay, lifetime/ownership fences and unavailable/unknown targets |
| Playwright `canonical-corpus-ui.config.ts` | 2 PASS; desktop/phone actual-App A/B pixels and controls remain equal before earned sight diverges |

Use `node node_modules/@playwright/test/cli.js test --config tests/e2e/<config>`
for each browser row. Total: 77 browser-run cases, not 77 full gameplay journeys.
Existing config reporter/output directories retain results, traces and images.

First aggregate attempt used `npm test -- --maxWorkers=2`. This environment's npm
dropped the intended worker option (reported unknown CLI config), and one retained
legacy `autopilot.v2` case exceeded its existing 60-second timeout: 5,143 passed,
one failed, one skipped. No source or timeout was changed. The direct bounded
runner above reran the complete suite and passed. Do not relabel the first run.

## Assets and visual inspection

Copied the existing local `dungeon-occult-01` manifest and only `stone_bricks`,
`cobblestone`, `basalt`, `bookshelf`, `chest` texture directories, plus the curated
`character-skins/local` catalog. Seven stage image and six skin SHA-256 values
match their pinned manifests. Total 16 files / 16,792,618 bytes. Other manifest
entries remain unused by this stage; no glowstone frames or new generated output
were imported. Assets stay ignored; Git publication alone does not provision them.

Inspected captured phone 3D first-person and actual-App 2D images: textured,
nonblank, controls/text fit, no incoherent overlap. Canvas/pixel and desktop/mobile
interaction assertions are in the browser cohorts. Local twenty-cell motion
sample: 995 frames, RAF p95 17 ms, maximum 30 ms, zero stopped pending frames.
This is one local profile, not hardware-independent performance proof. Intentional
graphics recovery emits the existing WebGL context-extension warning.

## Preserved boundaries and remaining work

One GameSession/store remains authoritative. No renderer-owned chest effects or
hidden map navigation was introduced. Existing Agentica production fixes and
provider-free boundaries remain present. Fresh live service/provider, full
historical Q, new workshop browser coverage and actual endless descent were not
rerun and are not required claims of this integration.

Next: R1 surface repairs and R2/R3 canonical battle/skills/reward reconnection.
Do not mistake the retained legacy combat unit passes for a playable battle path.
