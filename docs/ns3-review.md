# NS3 Independent Review

Reviewed snapshot: `049e9bd`, branch `codex/directed-history`, 2026-10-10.
Scope: perception/inspection, source-local persistence validation and the generic
destination executor. Existing implementation files were not changed.

## Findings

1. **[P2] Inspection receipts are not bound to their source attempt/command.**
   `src/persistence/directed/audit.ts:33` checks only that referenced evidence IDs
   exist; `repository.ts:19-25` reconciles against the stored request without
   checking its inspection source. Changing only the stored receipt's direction,
   command type, or attempt ID (and corresponding receipt key) passes full audit
   with unchanged observations, projections and archived context. Reconciliation
   also returns the substituted request as applied. Bind applied inspections to
   their source attempt ID, direction and inspection reason on audit and replay.
   Four failing cases in `inspectionReview.test.ts:91-107` reproduce this.

2. **[P2] Replay accepts a concealed-feature tombstone unsupported by this policy.**
   `src/domain/directed/knowledge.ts:30-37` checks cell coverage but not the previous
   feature's `disclosure`. After expert detection and an untrained look, adding
   `T` to `absentFeatureIds` passes observation validation and deletes the known
   feature during replay, despite the explicit policy that non-detection cannot
   establish concealed absence. Old examination detail is left orphaned. Reject
   this source/history combination without consulting current world truth.
   Failing case: `inspectionReview.test.ts:119-131`. The normal generator does
   suppress this tombstone; this is a replay-validation gap, not an observed
   ordinary downgrade failure or a demonstrated request-based disclosure attack.

3. **[P2] Completing a step aliases the previous operation's route cells.**
   `src/domain/directed/destinationExecution.ts:67` replaces the cloned route with
   `operation.route.slice(1)`, preserving nested cell references. Mutating the
   returned remaining cell changes the retained input operation. Keep the route
   derived from the deep clone so generic adapters can retain independent
   checkpoints. Failing case: `inspectionReview.test.ts:199-208`. No fixed-adapter
   movement regression was found; its enclosing session clone limits this alias.

4. **[P2] Legacy-policy evidence can falsely claim deliberate inspection.**
   `src/domain/directed/perceptionEvidence.ts:9-12` returns before checking the
   reason/inspection relationship at line 21. Changing a legacy look's reason to
   `inspection` passes persistence validation without profile, attempt, direction
   or coverage evidence. Reject the new reason under the legacy policy while
   continuing to accept authentic old receipts unchanged.
   Failing case: `inspectionReview.test.ts:109-117`.

## Verification

- Windows/PowerShell, Node `v22.13.0`, Vitest `4.1.9`; dependencies junctioned to
  the original checkout as authorized. No providers or agents invoked.
- Baseline `npm test -- src/domain/directed`: **86 passed / 10 files** (3.22s).
- Final same command: **101 passed, 7 failed / 11 files** (3.66s). The new file
  contains 15 passing controls and 7 ordinary failing regressions for the four
  findings above; no skipped/expected-failure annotations hide these defects.
- `node node_modules/typescript/bin/tsc --noEmit`: **PASS**.
- Passing controls cover unknown/suspicious identity and count opacity, hidden
  door state's effect on public route graphs, missing-crossing/closed-door
  coverage, downgrade to weaker/no profile, archived detail and exact context,
  passive versus deliberate inspection, and caller-supplied power/viewpoint/IDs.
- Receipt tests execute real read/audit/reconciliation and lineage validators
  over a read-only in-memory transaction substitute, including an unchanged
  archive control. They do **not** qualify actual IndexedDB durability. Browser,
  full-repository regression and production build were not rerun.
