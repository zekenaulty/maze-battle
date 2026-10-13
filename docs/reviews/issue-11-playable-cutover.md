# Issue 11: Manual Play Cutover

2026-10-13. Branch `codex/agentic-game-a1`. Issue and umbrella goal remain open.

## Implemented

- Actual `App` and `GameSession` now use canonical v9 commands and bounded views.
  The old whole-GameState reducer/session writer is removed from the playable path.
- Ordinary refresh reads the compact head; unchanged revisions do not hydrate
  roster/world. Movement reuses the bounded roster projection and reads local
  observation/current-floor quest pages, never historical floor arrays.
- Fresh startup durably prepares and qualifies generation in bounded batches.
  Floor transitions prepare only the requested next floor. Existing anchors are
  required, not regenerated as missing-data recovery.
- Map regions use only earned spatial index and immutable evidence, at most 1024
  cells. Click travel uses a smaller earned region and a 64-step local window.
  Negative world coordinates work. Manual movement never opens chests.
- Town, inventory, equipment, guild, portal resource, camp skills and manual
  save/load are connected to shared canonical commands. Sixteen named saves store
  roots, not copied worlds. Restore excludes custody, execution ledger and quotas.
  Live allocations refuse save/create rather than being rolled back.
- Startup/restore stop saved Auto intent. Stop during pending startup cannot
  issue a follow-on takeover/look. A stopped foreign owner can be explicitly
  claimed using normal quota, without repeatedly consuming emergency reserve.
- Broken evidence shows Retry and Reset, including after the reproduced missing
  observation. The old malformed v7 save is discarded, not normalized or imported.
- `?agentica=1` and all `?expedition=` routes now mount the same App.

## Qualification

Parent reruns, provider-free:

| Gate | Result |
| --- | --- |
| Focused canonical, session, input, screen and recovery unit suites | 419 passed, 26 files |
| Main native canonical suite, port 5209 | 177 passed |
| Native named saves, replay, corruption, custody and capacity, port 5222 | 59 passed |
| Actual App browser suite, port 5223 | 6 passed |
| `npm run build` (full TypeScript + Vite) | Passed |

The six App cases exercise startup/move/reload, actual town/portal/party and named
restore, damaged evidence/reset, one-game routing/no service requests, two-tab
takeover, and destructive old-schema initialization. Desktop 1440x900, mobile
390x844 and tablet 820x1180 were pixel-checked and screenshots inspected. Resize
checks wait for fresh perception and animation frames, not stale canvas pixels.

Reports are in `test-results/canonical-app/results.json`,
`test-results/canonical/results.json` and
`test-results/canonical-manual-saves/results.json`. An initial aggregate run
incorrectly collected port-5222 fixtures under port 5209 and failed their host
guard; suite routing was corrected and both suites rerun above. No guard weakened.

Native exploration-command sample with the new earned spatial index:

| Retained floors | Reads | Writes | Logical written bytes | Elapsed ms | Browser usage before/after |
| --- | ---: | ---: | ---: | ---: | --- |
| 1 | 194 | 59 | 97,312 | 111.7 | 536,576 / 593,920 |
| 16 | 196 | 59 | 97,339 | 91.4 | 6,782,976 / 6,840,320 |

No historical-floor read/write or whole-store scan occurred. These are single
instrumented command samples, not complete App-frame cost, physical disk writes,
or latency percentiles. Immutable history remains under the enforced 256 MiB
logical quota; indefinite play/history compaction is not claimed.

## Still Required

1. P3 bounded Auto controller: preserve objective ranking, explicit authorized
   chest/quest/care actions, persisted waypoints and cancellation. Work is isolated;
   Auto is visibly disabled in this intermediate manual-play preview.
2. Canonical Agentica admission/travel/effects/wake/acknowledgement. The old adapter
   is unmounted, not wrapped around the new writer. Its temporary type contract
   exists for protocol regressions only and must be removed/replaced in P4.
3. Remove the retired persistence modules, parallel test shells, old-only tests
   and obsolete Maze-owned databases. Their former URLs no longer select them,
   but source/data cleanup is not complete.
4. Qualify multi-floor play and all controller paths end to end; add full App-level
   cost sampling and finish sustainable-history/capacity qualification. Combat and
   paid-provider qualification remain outside this checked vertical.

Preview: `http://127.0.0.1:5198/`. This intentionally discards old-schema saves.
