# RPG restoration qualification

2026-10-25. R0-R5 restores the bounded existing game on one canonical session,
not full future RPG parity or a new combat design. No paid provider calls or
owner-save resets were used. The original skill catalog, targeting, AI, effects
and GCD/cooldown/charge helpers are unchanged from the pre-restoration line.

## Connected game

- Actual 2D/3D exploration returns from shared battle and town screens.
- Guild offers, accepted objectives, explicit chest collection, quest progress,
  reward claims and on-demand cross-floor accepted journal.
- Shared battle commands, manual skills, enemy turns, individual actor AI,
  Waves, linked Stop, atomic XP/level/attribute/gold/loot/equipment settlement.
- Defeat -> End -> town recovery; active battle reload/save/load/takeover pauses
  automation and preserves the current battle. Stale End/skill/Stop and duplicate
  Start are harmless presentation cancellation, not storage recovery failures.
- Party/equipment/inventory, vendors, stack sales, guild stash, policy reserves,
  portal scroll/button shared stock and ordinary Auto town care remain connected.
- Auto accepts contracts, uses earned routes, explicitly collects chests, fights
  accepted kill objectives, claims rewards and descends after completed work.
- Exploration Teleport is restored with a disclosed current-room/passage range;
  legacy floor-wide selection is not claimed. It uses MP, not portal stock.

## Diagnostics

Diagnostics has Storage and Gameplay tabs. Gameplay reads only on demand, pins
the selected canonical snapshot and exports JSON. It does not feed planners or
Agentic observations. The fixed execution-area trace retains 64 recent combat
and reward facts, atomically with their effects, with strict historical reads.
HP/MP/level/XP before-after values are not mislabelled as gross damage or earned
XP. Actor gold and wallet payouts are distinct. Named world restores preserve
execution chronology, so this is not a lifetime-total counter or replay engine.

## Checked evidence

| Gate | Result and scope |
| --- | --- |
| Final full root | 5,491 PASS; one existing optional skip (`r5-full-final.json`) |
| Types/build | Root and restoration fixture PASS; production bundle PASS; existing large-chunk warning |
| Actual App composition | 30 PASS, including first-floor Auto kill journey, battle loss/save/takeover, town/recovery/depth, Teleport and trace/export (`r5-combined-app`) |
| Town/inventory UI | Three fresh native cases: starting-resource vendor/equip/stash/withdraw, partial stack + Sell All, cross-panel policy/reload; worker and parent PASS |
| 3D | 11 PASS after restoration; desktop/phone DPR 1/2, 20-cell motion, view switches, assets and renderer recovery (`r5-3d`) |
| Native roster/movement | Six PASS: attributes/actor policy, three camp skills and exact replay, ordinary earned movement; Teleport is still correctly rejected as a camp command |
| Capacity/recovery | 35 native PASS for allocation guards, exact replay, rollback, restore and preparation boundaries (`r5-capacity`) |
| Native telemetry | Two PASS: 70 appended markers retain 64; historical reload/read without scans/writes; staged quota refusal rolls back all stores and receipt |
| Noncombat Agentic | 24 action/scoping/lifetime cases; final telemetry candidate reruns: 10 provider-free two-dungeon corpus and 17 interaction/recovery cases PASS |

The native ring reader used 65 exact record gets, 134 total charged reads and
63,417 bytes, zero writes. Fixed trace retention does not compact immutable old
versions. Authored telemetry markers and HP-only loss fixtures are labelled;
they are not natural gameplay or physical disk-exhaustion tests.

## Sustained play and capacity limit

The separate fresh native Auto journey at `ce935a3` passed in 661.365 seconds:
759 real moves (260/483/16 on floors 1/2/3), two ordinary descents, 12 claims,
four chest collections and two victories. Stop/reload requires explicit resume.
867 committed receipts and 23 telemetry events reconcile exactly. Backtracking
occurred. No transports, boosted party, capacity changes or scheduler shortcuts.
See [full measurements](../../tests/e2e/canonical-app-auto-endurance.md).

Logical usage grew from 569,955 to 45,402,865 bytes. Independent sums of retained
native record/node/receipt bytes match the final accounting. Browser-origin
usage is a separate estimate, not per-DB physical I/O. Existing quota remains
256 MiB with 8 MiB reserve. This proves bounded continuation into floor three,
NOT endless endurance. Natural town care, floor-three completion, broad balance,
physical disk exhaustion and arbitrary-depth retention are not proven by it.
Town care has separate App and domain checks; do not infer its occurrence here.

## Failures retained

- Prior battle fixture label and guaranteed-gold assumptions were corrected as
  documented in the R2 report, without changing mechanics.
- Active-battle old-tab buttons caused an unhandled rejection despite correct
  storage fencing; custody-disabled controls now pass all three recovery cases.
- An older movement fixture omitted required game settings. Its seed now creates
  normal defaults; production missing-data validation remains strict. Six PASS.
- Full root initially had one outdated Teleport-description expectation, then
  5,491 PASS after updating it to the actual disclosed local-range policy.
- Worker town inventory fixture expectations omitted existing quantity fields;
  original failures and exact corrected assertions are retained in its report.

## Next bounded work

1. History retention/compaction with explicit pinned receipt/observation/manual
   save/Agentica roots, cancellation and crash-safe accounting. Do not solve the
   measured growth by silently dropping evidence or raising the quota.
2. A separate controlled merge of the 3D branch's later `bc8e530` line. It advanced
   after the R0 pin `2a06eba`, adding spatial stair layouts/connector sight and
   portable model intake. Those changes are not part of this tested restoration
   and require fresh schema/preparation, earned-sight and actual-RPG qualification.
3. Broader combat balance, advanced skill behavior, optional wider Teleport range
   and full RPG Agentic capability bindings. Shared commands are ready to bind;
   no new capability authority or per-tick model loop was added here.
