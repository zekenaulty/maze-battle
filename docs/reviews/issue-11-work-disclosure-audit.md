# Issue 11: Raw Work Disclosure Audit

Read-only source audit of parent `813a9baef8cfdcb31c343c76c832b072877ad138`,
using isolated `30a29e3f907cf30ca72a9ae1c470d8477f294d64`. Relevant exposure
sources are unchanged between these snapshots. This report adds no runtime,
fixture, or acceptance changes. No tests or services were run for this audit.

## Confirmed Exposure

- `src/persistence/canonical/budget.ts:4-22` counts `reads`, `writes`,
  `readBytes`, and `writeBytes`. The byte cap applies to read plus write bytes.
  These are logical serialized-work measures, not physical disk I/O or timing.
  Cache hits and staged writes make them distinct from native IDB call counts
  and final retained storage. `read.ts:19-49` charges the complete current head;
  `transaction.ts:120` also charges receipt/head writes. Head counter decimal
  widths can therefore affect read-budget consumption and `writeBytes`.
- `src/services/game/GameSession.ts:191-228` appends successful command
  diagnostics with the original command's stats and elapsed time; subsequent
  projection reads are not combined into those stats. It returns the receipt,
  not the stats wrapper, to trusted host-command callers. Failed commands or
  failed publication do not append a successful diagnostic for that invocation.
- `src/App.tsx:80-85` renders current revision, action, reads, writes, logical
  bytes written (`writeBytes`), and rounded milliseconds. It does **not** render
  `readBytes` or diagnostic `replayed`. Storage diagnostics is an explicitly
  opened ordinary App dialog, not an authenticated privileged-only surface.
  Truthful operator diagnostics must not be silently hidden or normalized.
- `GameSession.ts:79-90` converts command/publication errors into recovery,
  releases control, and retains `Action failed: <message>`; `GameRecovery.tsx:17`
  renders that status. Thus storage-budget exhaustion has an observable failure
  and control-state channel even where raw byte counters are not displayed.

## Model Boundary

No current Maze model-facing payload directly includes `WorkStats`:

- `src/services/agentica/game/launch.ts:29-36` selects Start's explicit fields
  from the read's value. `actionHooks.ts:54-60` selects retained action/result
  values; `actionContract.ts:63-70` constructs explicit result fields.
- `observation.ts:23-30` and `context.ts:48-52` construct earned observations.
  `event.hooks.ts:64-74` and `terminal.base.ts:34-48` expose semantic progress
  and navigation usage (`steps`, `replans`), not storage-work counters.
- Recovery inspection internally retains stats (`recovery.ts:42-43` and
  `recovery.inspect.ts:48`), but current recovery components do not render or
  transmit them. `src/hooks/useKnownRooms.ts:24-52` selects values and uses
  generic room-evidence errors, not stats.

Refusal/failure outcomes remain observable. `actionExecution.ts:134-136`
deliberately forwards typed decision-query refusal messages, including budget
refusals (`decision.query.read.ts:10-24`). Generic storage work-budget errors
instead escape. The pinned `agentica-host.mjs:723-727` constructs an unresolved
action result and emits a local `action.error` callback; the mounted
`playController.ts:43-47,121-125` can close the channel first. Consequently an
unresolved result, missing result/disconnection, or required recovery can expose
a difference; delivery of an unresolved result is not guaranteed. Raw exception
detail in that SDK callback is local, not itself a model wire field.

## Existing Evidence And Limits

- `tests/e2e/canonical-corpus.projection.ts:13-58` separates actor `raw` output
  from privileged `metrics`, native-read tracing, and byte accounting. Earlier
  controlled projection work was equal; its head `quota.usedBytes` differed by
  four with equal serialized width (`canonical-corpus.disclosure.report.md`).
- The later navigation report records a real read-byte difference: moves 3-6
  each read a 432/433-byte retained connection before lawful sight divergence.
  The six-step aggregate was 7,592 reads each, 14,139,822/14,139,826 read bytes,
  437 writes and 622,686 write bytes. Actor frames matched. These aggregate
  numbers are not one command's work-budget consumption, and the difference
  was preserved (`canonical-corpus.navigation.report.md:80-93`).
- `canonical-corpus.work.report.md` separately demonstrates quota-threshold
  asymmetry with equal command work. Quota admission and work-budget admission
  are different gates; a private-capacity quota repair does not close both.
- `canonical-corpus-ui.spec.ts:24` excludes diagnostics/capacity thresholds;
  its entry's state selection omits diagnostics. Existing paired UI evidence
  covers the stated game/grid/Rooms/Nearby projections, not every UI/tool
  surface, Diagnostics, or actual-cap work-threshold equivalence.

## Minimum Remaining Invariants (NOT-RUN)

1. At a common earned prefix, explicitly open paired actual-App Diagnostics
   and compare rendered action/read/write/write-byte fields plus status/control.
   Include a head-counter digit-width boundary. Retain raw elapsed milliseconds
   without requiring equal wall-clock or physical-disk behavior.
2. Check exact outgoing Start/action/progress/terminal field shapes, including
   nested payloads, for absence of WorkStats; reuse the bounded query/navigation
   journeys rather than adding a Cartesian matrix.
3. With ample quota, compare per-command work-budget outcomes at the relevant
   byte/count boundary. A deliberately lowered cap can characterize the channel
   but does not qualify unchanged production caps. Distinguish precommit abort
   with zero effects from a committed effect followed by publication failure;
   preserve original reconciliation/replay obligations in the latter case.

Direct `readBytes` disclosure is **not exposed** on the traced current paths.
Rendered work-field equivalence and threshold-induced public-failure equivalence
are **UNKNOWN**, not proved by matching earned observations. No timing-safety,
universal storage-work equivalence, or complete Sprint 4 qualification is claimed.
