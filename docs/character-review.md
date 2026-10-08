# MB-04 Character Sheet Review

Owner: `codex/refine-character-ui`, isolated worktree `maze-battle-workers/character-ui`.
Scope: character/item presentation, pure projections, component-scoped CSS and tests. No changes to App, shared types, global styles, persistence, telemetry, domain services, or the refinement board.

## Legacy Parity

Sources inspected with `git show main:<path>`:

| Legacy source | Finding | Refinement disposition |
| --- | --- | --- |
| `battle/actors/ui/characters.js` | Fixed nameplates select one hero detail sheet; a 100ms loop refreshes every sheet. | Persistent responsive character selector, one selected sheet, keyboard navigation. Only the visible Skills view owns a 250ms timer; other views update from props. |
| `battle/actors/ui/detailSheet.js` | Name/class/level/XP, health/mana/damage, available attributes and editable plus buttons. Skills show summaries, mana and cooldown; some can be cast outside combat. | Four views: Stats, Equipment, Skills, Inventory. Base/gear/effective table, rolled attack range, HP/MP/XP bars and XP remaining. Optional attribute and exploration-casting callbacks; execution stays in the domain. |
| `battle/actors/actorAttributes.js` | Vitality contributes 2 HP; intellect contributes 2 MP. Damage depends on the scaling attribute and base damage. | Stats and item replacement comparisons reuse `getEffectiveActor`; attack/skill damage reuse `damageRange`. Gear deltas include indirect HP/MP contributions, affixes and catalog legendary fallback stats. |
| `battle/actors/actorLevel.js` | XP remaining is visible and level-up grants available points. The old implementation has its own level-up accounting. | Current `xpForNextLevel` is authoritative. No copying legacy XP arithmetic. The Stats auto-spend toggle exposes the lead's optional per-actor policy so new points can remain available for manual allocation. This worker's baseline domain still auto-spends; honoring false belongs to main integration. |
| `battle/actors/skills/teleport.js` | A 20 MP, 2s out-of-combat skill actually teleports the party. | The sheet describes random-location mage Teleport separately from a town portal scroll. Casting needs the lead's `castExplorationSkill` callback; this isolated branch does not implement or qualify the travel effect. |

Current inventory reference: `src/domain/items/inventory.ts`, `gearScore.ts`, `itemDetails.ts`, `catalog.ts`, and the pre-refinement `CharactersDialog.tsx`. Eight slots, stat/effect lines, ownership labels, stack quantities and Auto Equip remain. Added selected-character replacement deltas, lock badges, search across names/effects/owners, combined type/slot/rarity/status filters and descending score/gain/value/level/rarity sorts. Filters fold away to preserve mobile pack space. Equipment slot search opens the corresponding pack filter.

Skill names, costs, cooldowns, recharge and targets come from `SKILLS`; damage ranges come from the combat engine. Healing, resurrection and Wand descriptions mirror the current effects in `applySkill.ts`, because the catalog has no effect-description fields. Live cooldown/GCD/charge displays use domain timer helpers. Static 750ms cooldowns display as 0.75s, not a rounded 0.8s.

## Integration API

All existing `CharactersDialog` callbacks are unchanged. New optional props are exported through `CharactersDialogProps`:

```ts
inventoryPolicy?: InventoryPolicy;
onInventoryPolicyChange?: (patch: Partial<InventoryPolicy>) => void;
onToggleItemLock?: (itemId: string) => void;
onAutoSpendChange?: (actorId: string, enabled: boolean) => void;
onSpendAttribute?: (
  actorId: string,
  attribute: 'strength' | 'vitality' | 'intellect',
) => void;
canUseTownPortal?: boolean; // defaults to true for existing callers
onCastSkill?: (actorId: string, skillId: SkillId) => void;
allowOutOfCombatSkills?: boolean; // defaults to false
now?: number; // epoch milliseconds; omit for the local live clock
```

Lead wiring:

- Pass `normalizeInventoryPolicy(game.inventoryPolicy)` as `inventoryPolicy`.
- Route each minimal policy patch to the inventory worker's `setInventoryPolicy` through the normal game-state transition/persistence path. Controls never mutate or persist props. Reserves submit nonnegative integer values; domain normalization remains authoritative.
- Route `onToggleItemLock(id)` to `toggleItemLock` through the same transition path. Badges already read `item.locked`; absent callback hides lock controls.
- Route `onSpendAttribute(actorId, attribute)` to the lead's allocation service. Only show plus buttons when this callback is provided; disable them at zero available points. Preserve domain authority over point decrement and HP/MP increases/clamping.
- Wire `onAutoSpendChange(actorId, enabled)` to the lead's per-actor auto-allocation setter. Stats shows the controlled checkbox only when wired, checked unless `actor.autoSpendPoints === false`, including for old saves without the field. It remains usable at zero points. This worker reads the optional field via an `ActorState` intersection and does not change shared types or auto-spend any points locally.
- Set `canUseTownPortal` from the shared portal eligibility rule, particularly false when already in town or otherwise ineligible. UI gates do not replace domain checks or resource consumption.
- Wire `onCastSkill(actorId, skillId)` to `castExplorationSkill` in `domain/party/partyActions.ts` through the normal state transition. Pass `allowOutOfCombatSkills={!game.battle}`. No target is sent: the domain chooses the lowest-HP-ratio living ally, all living allies, or first fallen ally as appropriate. Teleport does not dispatch `onUseItem` or consume a scroll in the UI.
- Optional `now` controls every Skills-view readiness/countdown calculation in epoch milliseconds, including the click guard. When supplied, the parent must advance it; the view starts no interval. When omitted, a 250ms interval exists only while Skills is mounted and clicks recheck wall-clock readiness.

No new shared types requested. `ItemDetails` additionally accepts optional `comparison: ItemComparison`, exported from `src/viewModels/inventoryComparison.ts`; existing callers retain their behavior.

## Actions And Limitations

- Equipped and locked items cannot be sold or stashed from this sheet. Explicit equip/move/unequip remains possible for locked gear; locking protects against disposal/automatic care, not deliberate loadout changes.
- Consumables target the selected character, not an implicit first living hero. The baseline `useConsumable` restores even a fallen explicitly selected actor and caps potions at actor base maxima, not gear-effective maxima. The UI follows those actual rules and disables potions at the current potion cap. `consumableDisabledReason` must be updated with domain potion semantics if MB-03 changes that cap or revival behavior.
- Sell prices describe one item; stash acts on the stack. Town-only actions remain gated by existing `canSellItems`/`canStashItems` and callbacks. Stash capacity is not passed to the sheet, so the domain must still reject a full stash.
- Positive GS comparisons are role-specific slot improvements, not a promise of better party-wide assignment. Transfers label the current owner and compare against the selected actor's slot.
- Attribute allocation, policy persistence and locking are callback-tested only in this worktree. End-to-end behavior of the lead's new mutations is not qualified here.
- Cast controls exist only for learned heal/groupHeal/resurrect/teleport. Visible reasons explain missing handler, outside-combat restriction, fallen caster, insufficient effective mana, cooldown/GCD, exhausted charges, or no eligible injured/fallen allies. Healing checks gear-effective HP. No effects, costs, timers or targets are applied locally; the domain must revalidate before execution. Exploration effects and teleport travel still require integration verification against the lead's service.

## Existing Test Hooks

Retained `.character-grid`, `.character-card`, `.equipment-grid`, `.equipment-slot`, `.equipment-item-button`, `.inventory-panel`, `.inventory-list`, `.inventory-item`, `.inventory-actions`, rarity classes, `.item-equipped-badge`, and item bonus/effect lists. Inventory rows also expose `data-item-id` and an accessible name equal to `item.displayName`.

The lead-owned `tests/e2e/game.spec.ts` needs these deliberate changes:

1. After opening Party, click the `Inventory` tab before asserting visible inventory rows. Stats is the default view.
2. The existing equipped-item selling test must assert selling is disabled, switch to Equipment and unequip, then return to Inventory and sell. Check the empty equipment slot in the Equipment view.
3. Auto Equip still updates the whole party, but there is only one `.character-card`. Select Vor/Zyth individually and visit Equipment to check their gear instead of expecting three simultaneous cards.
4. Prefer `[data-item-id="..."]` or `getByRole('article', { name: itemName, exact: true })` over a whole-row `hasText: itemName` filter. Comparisons legitimately mention another item's name and can cause ambiguous matches.

These shared browser tests were not edited or run unchanged. The scoped browser verification exercises the new navigation contract instead.

## Native Dialog Integration

The screens prerequisite `75f7c4b` was cherry-picked into this isolated worktree for qualification. The character follow-up does not modify shared Dialog or screens files and should be integrated separately from that already-owned prerequisite.

The original hook searched for an explicit `[role="dialog"]`, which does not match the shared native `<dialog>`'s implicit role. It also duplicated containment, Escape handling and opener restoration. The replacement hook only schedules cancellable initial focus on the selected character (or shared close button for an empty party) after the portal/showModal effects have run. Shared Dialog exclusively owns modal focus containment, native `cancel` and restoration. Rerenders do not reapply autofocus; unmount cancels any pending focus operation.

Component assertions await deferred autofocus and dispatch the native `cancel` event rather than pretending a jsdom Escape keydown generates browser defaults. The real-browser check verifies `:modal`, selected-character autofocus, 16 forward and 16 reverse Tab steps, exactly one native cancellation on Escape, opener restoration, and a successful reopen/close cycle.

## Verification

- `npm run build`: PASS (TypeScript and production build).
- `npm test`: PASS, 101 tests across 16 files after importing the screens prerequisite, including 25 character projection/component tests and the 16 screens tests. Character coverage includes casting, default-on/explicit-off auto-spend behavior, selected-actor callbacks without prop mutation, deferred autofocus, native cancellation, empty-party fallback and unmount cancellation.
- `node src/components/characters/verify-character-sheet.mjs`: PASS using the actual app and a seeded autosave, with a temporary Vite server on an OS-assigned free port and automatic browser/server cleanup.
- Browser checks: Stats/Equipment/Skills/Inventory at 1280x900, 390x844, 320x640 and 844x390; no horizontal overflow in the measured dialog, panels, controls, tables and rows. Eight slots, actor selection, search/reset, item transfer, native autofocus/Tab containment/cancel/restoration/reopen passed without page errors.
- Twenty-two screenshots were generated under the ignored `test-results/character-sheet/` directory. Representative desktop equipment and mobile stats, skills, inventory and replacement comparison screenshots were visually inspected. The added desktop/mobile casting views verify disabled reasons because baseline App does not wire the new callback. Enabled dispatch is component-tested, not domain-integrated. Screenshots are local verification output, not committed artifacts.
- No persistent server left running. No merge/deployment or integrated release qualification claimed.
