# Inventory policy and integration

## Authoritative gear decisions

`gearEvaluation.ts` replaces display score as the authority for auto-equip,
upgrade retention and junk sales. Rarity, price and role labels do not affect
the decision. `getLoadoutMetrics` evaluates the actor's complete equipment,
including affixes and legendary stat bonuses, through `getEffectiveActor` and
`combat/stats.ts::damageRange`.

- Offense is mean expected damage across distinct learned offensive skills.
  It uses the actual clamped damage roll and `scaleWith` plus skill-specific
  scaling. It is not DPS, a cooldown simulation, or an assumed area target count.
- HP is effective maximum HP, including vitality. Mana is effective maximum MP
  only when a learned skill spends mana (including healing/support). Current
  depletion does not change equipment preferences.
- Nonregressing actual improvement is an upgrade. Equal or worse output is
  obsolete. Mixed changes must satisfy every rule below; rejected tradeoffs
  are sellable, not kept indefinitely as speculative alternatives.
- Balanced weights are offense 0.55, HP 0.35, useful mana 0.10. Benefit is the
  weighted sum of `log((1 + after) / (1 + before))`, a monotonic utility that
  prevents beneficial swap cycles. Relative losses/gains use the current full
  loadout as denominator (minimum 1).
- Hard losses: offense at most 10%, HP at most 20%, useful mana at most 25%.
  Offense loss requires HP gain of at least 5% AND 3x the relative offense loss.
  HP loss requires offense gain of at least 5% AND 1.5x the relative HP loss.
  Mana loss requires at least 5% offense or HP gain. Mixed benefit must exceed
  0.01. All constants are named in `BALANCED_GEAR_POLICY` and overridable via a
  complete `GearEvaluationPolicy` object (spread the default to change one).

`evaluateGearUpgrade(actor, item, ownedItems, policy?)` returns `decision`,
`reasons`, `before`, `after`, absolute `deltas`, `relative` deltas, and `benefit`.
Pass the pack plus stash for town/UI comparisons. `evaluateLoadoutChange`
compares two complete actors against one owned-item collection. All these APIs
and their types are re-exported by `inventory.ts`; legacy `gearScore.ts` remains
display-only.

## Ownership and maintenance

`autoEquipBestGear(game, gearPolicy?)` assigns each slot jointly across the
party, preserving every actor's policy outcome and unique ownership. Locked
slots stay pinned. Up to eight coordinate passes settle newly enabled swaps;
this is bounded local optimization, not exhaustive multi-slot optimization.
The complete call also checks losses against its initial loadouts. It does not
guarantee a global optimum; a pass-bound or a newly changed loadout can enable
further improvements later. Equivalent assignments remain stable. Equal-benefit
candidates retain input order (pack before stash); random item IDs never break
ties. Equally beneficial whole-party assignments prefer fewer equipment changes.

`manageAutoInventory(game, gearPolicy?)` compacts stacks, equips, then in town
sells, stashes, and restocks in that order. `sellJunkItems(game, gearPolicy?)`
also equips before selling unless `inventoryPolicy.autoEquip` is false.
`junkItemsForSale(game, scope = 'all', gearPolicy?)` covers pack AND stash.
Only obsolete equipment is sold, including rare/legendary gear. Equipped,
locked, quest/non-equipment items, supplies, invalid records and actual
positive upgrades survive. Shared `inventory.gold` receives exact sale totals.
The host owns when to visit town and retry blocked expedition work.

Normalization preserves all owned records beyond capacity. Valid equivalent
stacks retain the first ID and exact total quantity; invalid quantities are
preserved but unusable. Admission for buying/transferring is strict; awarded
loot can overflow because there is no ground container to return it to.
`ambiguousItemIds(game)` exposes duplicate IDs across pack/stash. Those records
are never merged, auto-equipped, sold, transferred or consumed. Already equipped
ambiguous identities stay pinned; unique gear remains manageable. Candidates
for an ambiguous occupied slot are conservatively retained until identity is
repaired. Normalization does not rename, discard, or resolve ambiguous records.

## Persistence and portal wiring

Use `normalizeGameState` on reload. It preserves validated inventory policy,
town return mode, optional boolean `automationPaused`, boolean `autoSpendPoints`
(default true), finite nonnegative optional battle `rewardGold`, and existing
v2 floor metadata. It never executes maintenance or credits pending battle gold.
Main owns shared type additions and combat's reward transfer.

Toolbar: `useTownPortal(game)` from `town/portal.ts`. Pack action:
`useConsumable(game, scrollId)` delegates to the same service. Eligibility and
count: `canUseTownPortal(game)`, `portalScrollCount(game)`. Only usable unique
unlocked pack scrolls count, never stash stock. Active combat, defeat, town,
and absent scrolls are no-ops. Entry consumes exactly one scroll, preserves
floor and position, and records manual/auto-play/waves for `leaveTown`. Repeated
entry is a no-op. Floor-one stairs remain free and separate. `maintainTown`
performs inventory care and effective HP/MP restoration without travel.
