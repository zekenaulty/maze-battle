# Pregrant Recovery And Actual-App Entry

Date: 2026-10-17. Issue [#11](https://github.com/zekenaulty/maze-battle/issues/11).
This increment repairs a reproduced pending-action recovery gap and mounts a
bounded recovery surface in the actual game. It does not complete Agentic Play
or issue #11. All obsolete Maze save formats remain disposable; no migration,
fallback reader or parallel game was introduced.

## Repaired Custody Gap

A successor action can reach Agentica's custody before Maze grants it execution
authority. After browser reload, absence of a canonical action is insufficient
evidence to settle the remote action. Stop used to remain pending in this case.

`pregrant-proof.ts` now derives a conditional no-effect result from the retained
parent, exact successor claim, original cancelled root and current owner fence.
It requires no successor grant, canonical action/result or navigation admission.
Its evidence digest binds cancellation, claim and the complete action fingerprint.
It cannot authenticate unsaved request fields by itself.

`pendingRecovery.ts` therefore checks the exact original action and capability
against the retained service request before submitting that result. Final success
requires an exact retained result with HTTP recovery retention. An initial typed
`unresolved` result is permitted, but never imported as sight or completion.
Root/session clearance stays unknown until separate verified acknowledgements.
There is no game write, synthetic observation, action execution, SDK attachment,
planner activation or automatic retry in this composition.

The separate Agentica repair is pushed on `codex/maze-action-recovery`, commit
`90a8798ac45ee783991ccc993bd34faf573461e4`. It requires actual task termination
before HTTP reconciliation, funds unresolved action custody before dispatch,
retains HTTP-reconciled originals and exposes exact read-only action lookup.
It has no retention-release API; retained evidence can eventually cause honest
capacity refusal. Root/navigation ACKs do not falsely claim to release it.

Independent review found and prompted two corrections: hold the existing schema
before the first ordinary reader (to avoid accidental creation/upgrade), and
accept a legitimate interim unresolved result before the final no-effect result.
The schema guard also covers root recovery reads and actual-App Check/Stop.

## Actual Game Surface

The normal App and failed-load/quota screen expose the same recovery dialog,
using the existing GameSession. Opening lists bounded local reservations and an
immediate selected predecessor. Inspect reads one retained original. Only an
explicit Check or Stop contacts the retained root's endpoint. Closing or changing
game/lifetime invalidates pending responses and closes the temporary handle.

The UI never infers remote clearance from an empty list or missing service start.
It remains available without a rendered game or ordinary write capacity. It does
not take control, reset storage, adopt work, Start, Wake or call a model. Existing
manual controls are suspended while the dialog is open, as for other game dialogs.
Desktop/mobile screenshots were inspected after native tests; the content wraps
within the dialog and remains scrollable on a 390-pixel viewport.

## Verification

Parent worktree: `C:/Users/Zythis/.codex/worktrees/dungeon-d0/maze-battle`.
Integrated runtime/test commits through `c59e1fb`; earlier report/source commits
are retained in Git rather than collapsed into an untraceable final claim.

- Full unit suite: **2,847 passed, one existing optional skip**, two workers,
  210.74 seconds. This precedes the final fixture-only interim-case import; the
  runtime and App under test are unchanged by that import.
- Actual-App native browser cohort: **13/13 passed**, one worker, zero retries,
  32.8 seconds, `test-results/app-recovery/`. Includes invalid observation history
  with explicit reset, missing/obsolete schema refusal, quota recovery, desktop/
  mobile layout, portal/inventory/named checkpoint, reload and tab takeover.
- Native no-effect/schema cohort: **25/25 passed**, with **4/4** additional root
  schema-guard cases. No database creation or upgrade is permitted by recovery.
- Independent App review: no material findings; separately reran **24/24**
  focused units. This is review evidence, not an additional end-to-end cohort.
- Production build and TypeScript checks passed. Vite retains a warning about
  the main JavaScript chunk exceeding 500 kB; it was not suppressed.
- Separate Agentica runtime tests: **222/222 passed** at the source above.
- Actual browser-to-local-service cohort: **22/22 passed** in the isolated test
  lane. [Exact sources, artifacts and limits](../../tests/agentica-start-service/PENDING-RECOVERY-RERUN.md).
- Parent integrated rerun at `c59e1fb`: **22/22 passed**, zero retries, failures,
  flaky cases or skips, 153.84 seconds. Evidence:
  `test-results/maze-start-service-XZChjv/{provenance,results}.json` and browser
  traces. Every recorded fixture-source hash still matches; report errors are
  empty. Release build passed with zero warnings/errors in 12.24 seconds. The
  exclusive test ports 5258/5259 were released after launcher completion.
- The running preview at `http://127.0.0.1:5198/` was opened in the in-app browser
  and visibly renders the maze with status Ready. No reset or takeover was used
  during this check.

The paired proof exercises actual HTTP and durable storage with injected offline
planners, not mocked successful service replies. It checks quota before Stop,
live-run refusal, exact lost accepted reply, same-storage process restart,
changed-body rejection, immutable evidence, zero successor execution and separate
funded root/navigation acknowledgements. The interim case invokes the production
hook explicitly as fixture setup, not an asserted automatic pregrant delivery.

The .NET checks use SDK 10.0.401, not the repository's 10.0.302 pin. No installed
runtime, deployment, live-provider or objective-completion claim is made. No paid
provider calls or user database resets occurred. Tests use isolated origins/data.

## Next Bounded Work

1. Add a transactional reset/replacement guard for unresolved current Agentica
   obligations without reviving compatibility requirements or removing the
   explicit invalid-save fresh-start path.
2. Mount explicit original-operation/action recovery and acknowledgement controls,
   then qualify actual-App service cleanup at quota. Root Stop alone is not full
   session cleanup and read-only discovery is not remote reconciliation.
3. Mount Start and bounded execution in this same App, then explicit decision/
   continuation/adoption paths. No effect is authorized by mere navigation.
4. Complete shared-game capability and depth/revisit/multi-owner qualification,
   including the two-dungeon corpus. Keep the separately authorized live-model
   gate distinct from all provider-free results.

The umbrella goal remains active. These are unfinished acceptance boundaries,
not reasons to declare the issue blocked or complete.
