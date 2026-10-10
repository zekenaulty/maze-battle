# MB-05 Screen Review

Scope: isolated worktree `maze-battle-workers/screens`, branch `codex/refine-screens`, refinement contract read from `docs/refinement-plan.md`. No App, domain, persistence, telemetry, character/item UI, maze renderer, shared stylesheet, or refinement-plan edits.

## Parity Findings

Legacy references were read with `git show main:<path>`, not inferred from screenshots. The original uses emoji actors/items, a maze-first view, full-screen combat, separate actor vitals/actions, and explicit auto/waves labels. Those remain. Existing theme variables are reused; there is no palette replacement.

| Assigned surface | Original / checkpoint evidence | Implemented change | Remaining boundary |
| --- | --- | --- | --- |
| ExploreScreen | `main:app.js`, `main:ui/header/header.js`: compact actions and explicit manual/stop-waves labels. Checkpoint toolbar wraps unpredictably over fixed maze padding; no auto reason or portal budget. | In-flow compact toolbar and maze region; secondary encounter/throttle/New Game controls in settings; visible Auto/Stop Auto and Waves/Stop Waves; objective and reason; counted/disabled portal; direct Activity diagnostics icon; confirmed New Game. | Controller still owns portal consumption, automation and persistence. New Game must return its persistence promise for accurate pending/error state. |
| BattleScreen | `main:battle/ui/battle.js`: enemy battlefield, persistent party info, auto/waves/pause controls. Checkpoint replaces all vitals/actions with Log and uses fixed toolbar offsets. | Separate full-screen battle; in-flow toolbar, scrollable enemy field, settings for throttle, stable bottom panel; vitals/member selection remain mounted on Log; keyboard-operable tabs; direct diagnostics; optional reason and atomic stop. Short landscape keeps the toolbar above side-by-side enemies/actions. | Atomic stop must be wired by the controller, including wave continuation and per-actor auto flags. This worker does not implement a simulation pause. |
| BattleActions | `main:battle/actors/ui/actionbar.js`: per-actor skills, casts/cooldowns and UI updates. Checkpoint stacks all actors on mobile and truncates skill names. | Stable two-line 48px skill buttons, mana/cooldown/charge feedback, disabled unavailable actions; selected member on narrow/short screens with all member HP summaries; desktop retains all actors. Selection survives Skills/Log changes. | Targets, skill availability, effective stats and execution stay domain/controller-owned. |
| TownScreen | No town/guild/vendor screen in the original `main` tree. Checkpoint town has current-floor contracts, eight visible stash items, blanket full-pack purchase disablement, no deposits/locks/care settings. | Unframed town sections; cross-floor accepted contracts and progress/rewards; complete searchable stash/pack; exact-item deposit/withdraw and optional locks; stack-aware capacity feedback; visible stock bonuses/prices and unavailable reason; optional care policy controls; inn state/activity feedback; auto stop and diagnostics hooks. Junk sale asks confirmation with count/value/names. | Protection, junk classification, stack identity, restock and spending remain domain-owned. UI reuses domain normalization for capacity preview. Policy controls require a populated policy plus callback. |
| SavesDialog | `main:battle/ui/saves.js`: new save/new game, save summary, immediate load/delete and destructive new game. Checkpoint lacks timestamps/party summary/confirmations/errors. | Newest-first summaries with time, floor, party levels; confirmed load/delete and optional New Game; explicit autosave replacement/deletion consequences; pending duplicate guard, success/error feedback, mobile rows. | Callback promises must be returned, not discarded. Renaming/export/import and persistence race handling were not added. |
| Controls | `main:ui/joystick/joystick.js`: four directions and encounter checkbox. Checkpoint d-pad consumes 148px under the maze. | Same four direction callbacks, labels/tooltips and optional disabled state; compact stable two-row touch d-pad; encounter option retained in settings. | Global movement keys remain App-owned. |
| Dialog | `main:ui/modal/modal.js`: close button, body lock and browser-history-based closing. Checkpoint has duplicate title IDs and no modal focus/keyboard protection. | Native top-layer dialog rendered through a portal; unique names; inert background; explicit Tab wrap, Escape cancellation, focus return and key isolation; disabled closing while save work is pending. | Browser Back history behavior is deliberately not reintroduced; modern native-dialog support is required. Character UI contents are owned by MB-04, not restyled here. |

## Public API Wiring

All existing callbacks are retained. No additions to `src/domain/types.ts` are needed.

### ExploreScreen

- `onDiagnostics?: () => void`: opens the lead-owned diagnostics view; Activity icon with `Diagnostics` tooltip/accessible name.
- `portalScrollCount?: number`: optional authoritative override. Omit to sum `townPortal` inventory quantities (missing quantity = 1). `onTown` must call the domain worker's `useTownPortal`, not unrestricted `enterTown`. Floor-one entrance stairs are separate and remain free.
- `onNewGame: () => void | Promise<void>`: existing required callback, now promise-aware in confirmation. Return the actual persistence operation.
- Reads `game.autopilot` for the current floor; displays reason/objective while active, blocked, or paused with a retained plan. `onAutoToggle` must stop auto immediately when already active.

### BattleScreen

- `onDiagnostics?: () => void`: same Activity control.
- `autopilot?: AutopilotState`: pass `game.autopilot`; reason appears while auto is active or phase is blocked.
- `onStopAutomation?: () => void`: recommended atomic stop callback. Used by both active Stop Auto and Stop Waves controls. Must disable party auto, expedition continuation and wave continuation together. Omitted callback preserves legacy `onAutoToggle` / `onWavesToggle` dispatch, whose full-stop semantics are not guaranteed by this UI.
- Continue supplying effective `party` vitals from `getEffectiveActor` as App already does.

### TownScreen

- `onDiagnostics?: () => void`: same Activity control.
- `autoActive?: boolean`: defaults to `game.townReturnMode === 'auto-play'`; pass the controller's actual town automation state.
- `onAutoToggle?: () => void`: must handle town mode without incorrectly navigating to exploration; when active, stop retained continuation/town work atomically. An active town plan without this callback shows an unavailable stop, not a no-op enabled button.
- `onStashItem?: (itemId: string) => void`: wire the existing stash handler. Equipped items and full destinations are disabled.
- `onToggleItemLock?: (itemId: string) => void`: wire the inventory worker's lock operation. This UI exposes pack locks only.
- `onInventoryPolicyChange?: (policy: InventoryPolicy) => void`: receives the full updated policy, not a patch. Supply initialized `game.inventoryPolicy` to expose care settings. Reserve inputs accept nonnegative integers; domain validation/budget caps remain required.

### SavesDialog / Shared Controls

- `SavesDialog.onNewGame?: () => void | Promise<void>`: optional parity action; confirmation precedes callback and successful completion closes Saves.
- `onCreateSave`, `onLoadSave(slotId)`, `onDeleteSave(slotId)` accept `void | Promise<void>`. Return the real operation so busy/error handling covers it.
- `BattleActions.skillsVisible?: boolean` defaults true and is internal wiring for the persistent vitals/log panel.
- `Controls.disabled?: boolean` defaults false.
- `Dialog.closeDisabled?: boolean` defaults false. It now renders a native `<dialog class="dialog screen-dialog">` through a portal, not `.dialog-backdrop`; callers should not depend on backdrop DOM ancestry.

## Qualification

- PASS: `npm test`: 76 tests, including 16 new focused screen interaction cases. Covers portal stack/zero state, confirmation/cancellation, failed/pending saves, member retention, exact action IDs, atomic-stop hook, all diagnostics callbacks, cross-floor claim/progress, full-capacity consumable stacking, stash entry 12, deposit/lock/policy callbacks, distinct dialog IDs, and direction contracts.
- PASS: `npm run build`: TypeScript and production Vite build.
- PASS: `npx playwright test --config tests/e2e/screens.config.ts`: isolated fixture checks at 1280x800, 390x780, 320x640 and 844x390, plus native modal keyboard/focus/delete safety. The fixture never imports persistence or opens the user's browser/profile. It uses a fresh Playwright context and a temporary strict-port Vite server (default 5187; override `SCREENS_TEST_PORT`). The server is stopped by Playwright on completion.
- Browser assertions include nonblank canvas pixels, maze height greater than half the viewport, no horizontal page/main overflow, enemy card containment, stable skill button and bottom-panel bounds, selected-member/log behavior, diagnostics callbacks, and searchable withdrawal beyond eight items. Screenshots are generated under ignored `test-results/screens-*` directories; reviewed desktop/mobile captures retain the existing emoji/theme assets.
- Initial checks caught and repaired native Tab escape, nested Escape propagation, smallest-viewport enemy clipping, short-landscape toolbar overflow, scroll-sensitive test geometry, a broad status test selector, and test-only TypeScript query options. These were rerun, not treated as passes.

## Integration Limits

- This qualifies local screen behavior and unchanged domain regressions, not the merged App, real persistence failure handling, new inventory/domain work, complete auto expeditions, installed runtime, or live-user saves.
- The old `tests/e2e/game.spec.ts` suite was not changed or requalified here. Its first test assumes always-visible encounters/throttle, literal `Auto`/`Waves` labels while active, 34px skill buttons, and absence of party vitals on Log; those assertions must be updated by integration to the new accepted behavior.
- Local settings/confirmation dialogs block manual background interaction but cannot pause App-owned timers. Integration should suppress automatic transitions while a native modal is open if transitions must not dismiss local dialogs.
- Domain inventory protection, portal spending, town continuation and policy persistence are mandatory integration gates, not implemented by screen props alone.
