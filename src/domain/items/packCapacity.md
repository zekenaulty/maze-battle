# Pack capacity integration

`packSlotUsage(game)` is the authoritative used-bag-slot count. Equipment stays
in `inventory.items` for ownership, stats, display and saves; only the capacity
projection changes. `equippedPackItemIds(game)` returns its validated exemptions.
Both are exported by `inventory.ts` and `packCapacity.ts`.

An exemption requires a nonempty unique item ID across pack/stash, exactly one
equipment reference, a real equipment item in the matching supported slot,
and quantity one (or omitted). Locked worn gear is exempt too. Dangling, wrong
slot, non-equipment, ambiguous, and invalid-quantity records cannot grant free
space. Remaining records/stacks each occupy one bag slot. Counting is read-only
and never normalizes, combines, drops or rewrites owned records.

## Admission and equipment moves

`mergeInventoryItems` accepts a fifth optional `excludedSlotIds` argument. For
pack admission/preview, use:

```ts
mergeInventoryItems(
  game.inventory, [item], false,
  ambiguousItemIds(game), equippedPackItemIds(game),
);
```

Use no exclusions for stash admission. Stack identity, merge values and
consumption are unchanged. Awarded loot can still overflow without item loss;
its log now checks final equipped bag usage instead of the ownership-array size.

`canApplyPackChange(before, projectedAfter)` validates equipment transitions.
Equip/unequip and automatic assignments check the projected ownership and bag
usage before changing vitals or logging. A pack-to-worn replacement at full
capacity works because the new item frees the slot needed for old gear.
Unequip or transfer between heroes can fail if displaced gear cannot fit.
Legacy overflow can be reduced or kept unchanged, never worsened by an equipment
move. Automatic stash upgrades likewise require room for displaced worn gear;
equipping into an empty hero slot requires no bag space. Town care runs at most
two cleanup/equip/stash passes before restocking, so cleanup can free that room.

## UI handoff

Replace pack-capacity numerators in TownScreen, TownStorage and InventoryPanel
with `packSlotUsage(game)`. Keep ownership/filter-result counts based on the
actual item arrays. Update `canReceiveTownItem` previews to pass the fifth
argument for pack destinations only; stash capacity is unchanged. A blanket
"pack full" condition must not disable full-pack equipment replacements.

Domain purchases, withdrawals, automatic supply transfers, autoCare fullness
checks and inventoryDiagnostics already use the shared capacity projection.
No UI, shared types, stack-key/combine/consume logic or sale logic is changed
by this capacity work.
