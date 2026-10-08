# Refinement integration and verification

This record covers the MB-01 through MB-07 release in `refinement-plan.md`.
The isolated worker review documents describe their checkpoints; this file
records the combined application and supersedes their pending wiring notes.

## Integrated behavior

- New structured-v2 floors use separated bounded rooms and recorded narrow
  doorway connections. Saved v1 floors and classic generation are preserved,
  not regenerated. Same-seed topology captures are produced by
  `scripts/topology-capture.mjs`; the topology worker retained baseline and
  after images under its `test-results/topology` folder.
- Autopilot keeps a target and route, batches chests on its route, attributes
  kills to encounter origin, completes generated floor work before descending,
  and halts with a reason when recovery fails. Paths are shortest paths on the
  grid; target ordering is a bounded priority/distance heuristic, not a claim
  of globally optimal multi-objective routing.
- Automatic town care uses a real portal scroll, equips useful gear from pack
  and stash, sells obsolete equipment, replenishes supplies and returns. The
  toolbar and inventory action share the same scroll service. Entrance stairs
  on floor one remain free. No scroll means an explicit blocked reason, not a
  free portal or deletion of excess inventory.
- Gear recommendations, auto-equip and obsolete-item sale share full-loadout
  evaluation with real damage scaling and explicit loss/compensation guards.
  Approximate gear score is display-only. Rules and limitations are documented
  in `src/domain/items/README.md`. Locked, equipped, quest/non-gear, invalid and
  ambiguous-identity records are protected from automatic disposal.
- Worn equipment remains in the ownership list but consumes no pack slot.
  Purchases, transfers, unequip/move guards, auto town care and UI previews use
  the same validated slot count. Full-pack replacements are allowed; returning
  displaced gear requires space. Existing over-capacity items are never dropped.
- Supply stacks match effect/potency rather than cosmetic floor level. New
  supplies no longer gain meaningless levels. Old stack quantities and total
  resale gold survive merging, use, partial transfer and reload. Town inventory
  exposes Sell One, Sell All and a quantity slider with exact quotes. Equipped,
  locked, quest/non-saleable, ambiguous or malformed records cannot be sold.
- Global stop preserves individual actor preferences but prevents automatic
  combat, travel, waves and town continuation, including after reload. Blocked
  combat also uses this gate. Explicit restart restores automatic work.
- Character sheets provide four compact views, manual/automatic attributes,
  actual skill effects and timers, out-of-combat healing/resurrection/maze
  teleport, gear comparisons, filters, locks and usable inventory actions.
  Teleport is a mana skill and never substitutes for a town portal scroll.
- Native dialogs suspend live automation and isolate keyboard movement. Saves
  return real persistence promises to confirmation/error UI. A serialized,
  debounced autosave replaces per-tick saving and repeated save-list scans.

## Diagnostics and self-play

Open the Activity icon on any game screen. Overview shows progress, resource
changes, waiting/blocked actions and decision cost. Events distinguish manual,
auto and system sources, with objective/reason and grid position. Export
includes the current game snapshot, environment and counter semantics.

Telemetry is stored in a separate IndexedDB database, retaining at most eight
runs and 600 detailed events per run. Totals outlive event pruning. Waiting
auto actions are sampled in the detailed history. A failed history read never
overwrites existing persisted history with an empty log; game saves can still
continue, with diagnostics-storage failure shown in status.

HP and gold counters are explicitly net changes per action, not gross combat
damage/healing or a full transaction ledger. Simultaneous healing/damage or
sales/purchases can offset. `noProgress` includes legitimate cooldown waits
and settings changes. Decision timings measure domain transition cost, not
rendering or browser frame rate. Reports carry these semantics.

The Self-play tab runs a separate fresh expedition without changing the live
save. CLI equivalent:

```powershell
node scripts/self-play.mjs --seed 42 --floors 3 --steps 10000
node scripts/self-play.mjs --seed 7 --floors 3 --rows 31 --columns 37
```

The runner uses normal starting stats, seeded generation/combat/loot RNG, the
same automatic controller and scheduling delays as the app, and bounded steps.
It reports completion, defeat, blockage or exhaustion rather than equating
termination with success. Fixtures use explicitly sized floors, not an assertion
about every possible deep-floor progression. IDs and timestamps are not replay
identities; deterministic counters/outcomes exclude wall-clock performance.

## Acceptance evidence

Final integrated results: production build, 407 unit/component tests, and 21
Playwright cases passed. The ticket board records the qualified scope.
Tests use fresh Playwright contexts and fixture saves, never the user's current
profile. Browser captures are generated under ignored `test-results` paths.

Verified workflows include portal stock/reload, instant stop/reload, paid town
recovery from a 229/36 pack and obsolete stash, skills and owner/stat displays,
manual sale/equip, exact quantity sales, worn capacity, full-pack vendor/transfer
previews, stack value conservation, save confirmation/cancellation and diagnostic
self-play isolation. Layout checks cover desktop, mobile and short landscape,
with canvas pixel checks and inspected screenshots.

Full-controller runs, three floors each, encounters enabled, no boosted stats:

| Seed | Size | Steps | Battles won | Chests | Quests | Early descents |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 9x13 | 472 | 83 | 9 | 12 | 0 |
| 7 | 9x13 | 323 | 52 | 9 | 12 | 0 |
| 42 | 9x13 | 337 | 49 | 9 | 12 | 0 |
| 99 | 9x13 | 457 | 72 | 9 | 12 | 0 |
| 1 | 31x37 | 1023 | 177 | 9 | 12 | 0 |
| 7 | 31x37 | 1105 | 201 | 9 | 12 | 0 |
| 42 | 31x37 | 1308 | 236 | 9 | 12 | 0 |
| 99 | 31x37 | 930 | 150 | 9 | 12 | 0 |

Every run finished with no remaining chests or active quests on cleared floors,
no loss and no blocked state. Local JSON artifacts are under
`test-results/self-play/seed-<seed>-<rows>x<columns>.json`.

## Deliberate limits

- No exhaustive cross-slot gear optimizer or globally optimal quest tour.
- No automatic disposal of ambiguous ownership or quest/non-equipment records.
- No automatic free escape when scrolls and supplies run out; blocked state is
  visible and requires restocking or manual traversal to stairs.
- Existing saves retain their room topology. New geometry appears on newly
  generated floors or a new expedition.
- Generated fetch quest progress is a quest objective, not a physical quest
  item inventory. The protected-item boundary supports future quest records.
- Local qualification is not evidence for all late-game balance, browser
  engines, storage-quota failures on every device, or production deployment.
