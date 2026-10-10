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

Use no exclusions for stash admission. Stack matching and value conservation
remain owned by `itemStacks.ts` and `itemValue.ts`. Awarded loot can still overflow without item loss;
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

## UI projection

TownScreen, TownStorage and InventoryPanel use `packSlotUsage(game)` (through
`inventoryPackUsage` for character props). Ownership/filter-result counts still
use the actual item arrays. `canReceiveTownItem` previews pass the fifth argument
for pack destinations only; stash capacity is unchanged. Equipment actions show
specific capacity reasons while allowing full-pack replacements.

Domain purchases, withdrawals, automatic supply transfers, autoCare fullness
checks and inventoryDiagnostics already use the shared capacity projection.
`PackCapacityState` is the narrow inventory/party/stash projection shared by
domain actions and UI. It does not require game layout or rendering state.
