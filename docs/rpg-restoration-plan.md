# Canonical RPG restoration

Owner-authorized goal, 2026-10-24. Restore the functions of the pre-cutover RPG,
not its retired whole-game persistence. Small reusable rules and commands are
valuable; the skill system is an explicit preservation requirement.

## Authority and scope

- Manual, deterministic Auto and a future Agentic user call the same validated
  game-owned actions. Input selection and granted automation policies differ;
  effect rules and authoritative state do not.
- Keep GameSession serialization, canonical records, ownership fencing, atomic
  effects/receipts and exact-request reconciliation. No second inventory, battle
  store, renderer-owned mechanic or restored legacy save writer.
- Preserve current canonical games and named saves through compatible optional
  records or an explicit versioned evolution. Do not reset owner data to make a
  test pass. Earlier authorized legacy-format disposal is not new reset authority.
- Preserve all existing skill IDs, effects, resource costs, targeting, GCD,
  cooldowns, recharge/charges, equipment scaling and class AI behavior unless a
  demonstrated defect requires a documented correction. No skill trees or
  combat redesign in this goal.
- Prefer narrow command families over a generic capability framework. Describe
  availability/refusal and return reconcilable results now; provider exposure
  later binds those actions under its own grants and earned-knowledge scope.
- 3D is the intended primary presentation for future work; 2D remains a useful
  map, generation and diagnostic projection. Do not require duplicate new UI
  features or wait for combat artwork: reuse the existing battle screen.
- Physical stairs, world schematics/editor, new model import design, physical
  town/NPC simulation and additional live-model calls are not prerequisites.

## Source custody

Canonical baseline: `67e4b9190953825e9a0e2e311b046bb0d021b41d` on
`codex/agentic-game-a1`. Isolated candidate: `codex/rpg-restoration` in
`C:/Users/Zythis/.codex/worktrees/rpg-restoration/maze-battle`.

The incoming branch was rebased after the audit and now contains that canonical
baseline. R0 pins `2a06eba63010b489e444da7b7c30d6c16312648a`, including the existing
isolated model/stair workshop. The workshop is not a new production traversal
contract or a dependency for RPG restoration. Both original branches/checkouts
are preserved. Advance the shared canonical line only after combined checks.

Local curated artwork is ignored by Git. Copy/admit only the existing pinned
pack selections needed by this candidate, record availability and test fallback;
do not import a generated output tree or run asset generation.

## Slices and acceptance

| ID | Deliverable | Acceptance | Status |
| --- | --- | --- | --- |
| R0 | Integrate 3D on latest canonical lineage | Locked install, affected/full unit regression as recorded, types/build, real 2D/3D navigation/map/chest/stairs/reload/graphics recovery, canonical ownership/recovery and provider-free noncombat corpus. Exact candidate and local assets recorded. | Complete, bounded provider-free |
| R1 | Repair existing surfaces | Live skill clock; policy bounds and ordinary input refusal without loss of custody; truthful unavailable controls; bounded cross-floor guild/history access; explicit click/stair behavior. | In progress, isolated UI repair lane |
| R2 | Restore one durable battle vertical | Game-owned encounter and bounded battle records/commands; existing manual skill/target UI; enemy actions; win/loss/return; all old skill rules exercised. Reload, cancellation, duplicate and rollback checks. | Pending |
| R3 | Reconnect progression and rewards | Atomic/deduplicated kill credit, XP, level/attribute updates, gold, loot, equipment and quest progress; no duplicate payout after retry/reload/manual-save restore. | Pending |
| R4 | Restore the grinder | Individual Auto Battle; linked Stop/takeover; Waves; encounter interruption/resumption of travel; Auto quest/loot/town/supply loop. Distinguish posted offers from accepted mandatory work. | Pending |
| R5 | Qualify the real RPG | Canonical gameplay telemetry, played multi-floor journey, backtracking, loot pressure, town care, reload/takeover and failure recovery. Document finite storage behavior and next retention work honestly. | Pending |

R2 and R3 may be delivered as smaller checked increments; do not expose a battle
button before its state/effects/recovery path is coherent. Publish checked
verticals promptly rather than accumulating a large unreviewable patch.

## Shared action and skill boundary

Existing exploration, roster and content commands remain the authoritative paths
for movement, items, equipment, town care and quests. Add a compact battle command
family for admission, validated skill/target intent, automatic tick and terminal
resolution. Keep stable actor/enemy/skill identities and origin/return intention.

The skill catalog and legality/targeting/effect helpers are the reusable core.
UI components project availability and send intent; neither UI callbacks nor
Agentica adapters implement skill effects. A future tool can bind one skill use
or a bounded combat policy without asking an LLM to drive combat ticks. Discovery
and an available action do not grant automatic execution.

Separate presentation time from effect time. A live display clock must not write
state or advance combat. One game-owned scheduler submits non-overlapping ticks;
GCD, skill cooldown and recharge remain independent of the Auto throttle. Make
manual-idle enemy timing explicit rather than accidentally inheriting an old
React interval condition.

Voluntary interactions remain explicit. Ordinary walking never opens a chest,
accepts a quest, sells gear or runs town care. Auto may choose those same commands
under its enabled policy. Future Agentic exposure must not inherit Auto's choices.

## Restoration test matrix

- Existing canonical save/recovery, earned-map, explicit chest and noncombat
  Agentic provider-free regressions remain protected. No new paid qualification.
- Every retained skill: appropriate user/target, life/MP/GCD/cooldown checks,
  damage/healing/resurrection/teleport behavior, charges and recharge; malformed,
  stale, duplicate and unavailable intent. Preserve equipment-derived scaling.
- Battle: manual and individual AI actions, last-enemy settlement, victory/loss,
  return mode/origin, Stop and dialogs, reload and ownership loss, clock jumps,
  rapid input, exact retry and transaction rollback.
- Rewards: per-kill XP, levels and auto attributes, gold/loot once only,
  quest-target/category credit, quest claim, protected items, stack normalization,
  equipped-slot accounting and weighted gear trade-offs.
- Grinder: waves and exploration separately; single-character/all-character AI
  toggles; supplies/portal/town return; full/locked pack; interrupted navigation;
  no false floor completion from unaccepted offers or fabricated kill progress.
- Presentation: primary 3D exploration plus existing battle/town/party surfaces,
  mobile and desktop text/control bounds, 2D map utility, no movement behind a
  battle/dialog and no duplicate input through two views.
- Sustained play: actually travel between generated floors and return, not only
  fixture-position the actor at stairs. Record gameplay counters, command costs,
  storage/history growth and failure reasons. A finite test is not endless proof.

## Capacity boundary

Rooms already scale as `6 + 2 * floor`; preparation is bounded in transactions
but finishes a floor before entry. History and private preparation slack remain
retained under finite logical quota. Restore playable behavior first; do not
silently raise limits, delete evidence or call this unlimited exploration.
Any compaction/archive strategy requires explicit source-evidence and exact
replay guarantees. Report measured sustained-play limits and the next bounded
retention slice, not a promise of infinite storage.

## Rolling evidence

- R0 candidate assembled by fast-forward in the isolated checkout; runtime source
  remains the incoming pinned commit. Full units, types/build and 77 browser-run
  cases pass. See [exact integration evidence](reviews/rpg-r0-integration.md).
  The checked candidate is ready to advance the shared canonical line; the
  original 3D branch/checkouts remain preserved.
- The prior source audit found connected town/inventory/gear commands, not full
  canonical combat. Retained old reducer tests are not current-App combat proof.
- Locked dependency installation: PASS, 131 packages, unchanged lockfile. Thirteen
  pinned image hashes verified; only the five stage material families and the
  six-skin curated catalog copied locally, not glowstone or all generated output.
- R2a shared combat core extraction is in progress in a separate branch. It will
  preserve legacy adapters/tests while removing GameState/world/policy coupling
  from the reusable turn boundary. Canonical battle execution remains pending.
