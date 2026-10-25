# R4: Auto kill-objective integration

Explicit ordinary Auto now accepts kill contracts, retains them as objectives,
follows earned routes and starts shared combat when it reaches the selected
target room. It no longer filters kill work out or stops solely because combat
is required. Victory uses the same settlement as manual/Waves, then ordinary
Auto resumes, claims completed work and continues exploration. A room may need
several encounters to satisfy its accepted kill count.

No quest, inventory, battle or pathfinding authority was added to the renderer.
Posted offers are not silently treated as accepted quests. Agentic navigation
does not inherit ordinary Auto's acceptance, combat or looting policy. All-off
actor AI blocks the kill objective without overwriting the actor preferences.
Stop, stale revisions, loss and stalled combat remain explicit boundaries.

## Evidence

- Worker combined canonical set: 801 PASS / 65 files, including 32 Auto cases;
  types/build PASS. In-memory kernel/COW evidence, not browser journey proof.
- Parent combined canonical/session/hooks/journal set: 2,185 PASS.
- Parent actual-App native IndexedDB cohort: 24 PASS, including four battle,
  six existing Auto, retained-depth I/O, town/party/save, journal, policy bounds,
  camera, stairs and storage-recovery cases (`test-results/r2-combined-app`).
- Noncombat Agentica action/lifetime/scoping cohort: 24 PASS.
- Two-dungeon provider-free corpus: 10 PASS, including identical earned prefix,
  explicit collection/reverse movement, query bounds and work/quota neighbors.

The 24 App cases do not alone prove a fresh Auto kill-quest journey. A separate
native fresh-App journey now passes: seed 781, RNG 0.5, unchanged starting party,
217 ordinary earned-route moves, Auto-selected battle, 3/3 kills, three loot
items and XP, one 105g quest claim, then continued movement. Stop/reload preserves
party, inventory and quests. Elapsed 180.919 seconds on the worker checkout.
This is one deterministic first-floor journey, not multi-floor endurance.
No paid model run was needed or performed. Gameplay telemetry and further
loss/save/takeover composition remain R5 work.
