# GitHub Issue Triage: Integration Freeze

The owner requested fixes only where they would not disrupt the upcoming Agentica tests.
This branch starts at merged `main` (`b12a8c3`), not the newer NS-6 branch. It does not
change the qualified NS-6 checkout at `7156260`, its port-5184 preview, Agentica source,
provider configuration, world transitions, persistence schemas, or saved worlds.

## Disposition

| Item | Outcome |
| --- | --- |
| PR #1, duplicated-tab custody review | Fixed in this branch. A document-lifetime Web Lock guards reuse of the session owner token. A copied tab receives a distinct token and cannot retry the original tab's pending move or cancellation. Without Web Locks, reload requires explicit takeover. |
| #2, lever/door proving ground | Reproduced through desktop and phone controls. Travel reaches the lever's adjacent cell, enables interaction, and commits `idle -> active` with an interaction receipt. The door stays locked. The screen now explicitly identifies these as independent fixtures; no causal puzzle is claimed. |
| #2, causal puzzle and RPG playtest notes | Remain open. A functional lever-to-door scenario needs authored causal effects, perception-safe events, historical replay and UI qualification as a separate fixture/version. Encounter balance and quest feedback are separate unreproduced observations. |
| #3, branching modular dungeon growth | Deferred, not resolved. Changing generation now changes test worlds and saved-topology assumptions. Removing the eight-room cap alone also exhausts the five-entry room-role list. No generator, growth formula, role distribution or balance change is made here. |

## Reproduction and Boundaries

Fresh directed fixture: lever travel arrives at `L:2:3`; the lever occupies `L:2:2`.
Before arrival the interaction control is disabled. After arrival it is enabled;
activation yields `Interaction performed.` and disables repeat activation. The
door remains at `H:2:4`, locked before and after activation. Travel to the door
stops at `H:2:3`; crossing remains illegal. Activation does not update the remote
door's remembered observation or overwrite earlier presented context.

The custody regression uses a real opener-created browser tab, which copies
session storage. It copies a valid pending step or cancellation and proves that
opening/reloading the duplicate changes no authoritative save state. Explicit
takeover changes the epoch, cancels the old travel intention without moving,
and prevents the old tab from resuming it. Existing same-tab reload and pending
request recovery tests remain part of the cohort.

The original custody code failed the new browser regression. During fixture-test
development, two test assumptions were corrected: receipt array order is not
chronological (identify the new attempt), and an old `arrived` status is not
arrival of a new trip (await its `running -> arrived` transition).

## Verification Commands

Run from this branch, without using an existing preview:

```powershell
node node_modules/vitest/vitest.mjs run src/domain/directed --maxWorkers=1
node node_modules/@playwright/test/cli.js test --config tests/e2e/directed-issues.config.ts
npm run build
```

Final local results: 195 directed-domain tests passed across 17 files; all 19
browser checks passed; TypeScript and the production build passed. A read-only
`git apply --check` also confirms the patch applies cleanly to the qualified
NS-6 checkout; the patch was not applied there.

The browser cohort uses port 5187, refuses an occupied port, and creates disposable
browser contexts. It does not attach to the owner's browser/save. Screenshots
cover 1280x800 and 390x844, including canvas size and horizontal-overflow checks.
These are local, provider-free checks; they do not qualify live-provider behavior
or replace the separate NS-6 paired integration proof.

## Next Safe Generator Slice

After the integration freeze, first capture a seeded, source-identified baseline
of module counts, footprint bounds/overlaps, room roles, socket utilization,
graph degrees/forks/endpoints/loops, route lengths and traversable coverage across
early/deep floors. Then version a branching room-module assembly policy and its
save compatibility. Do not substitute a named maze algorithm, enlarge rooms
without bound, or merely lift the cap before qualifying those properties.
