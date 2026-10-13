# Issue 11: Canonical Launch Custody

2026-10-13. Provider-free canonical launch primitives, including parent integration
through GameSession. This does not mount the SDK, send a service request, qualify
remote park/wake/ACK, or enable Agentica controls.

## Contract

`canonical/agentica/launch.ts` exposes a funded launch admission plus immutable
dispatch, run-announcement and initial-grant records. They use the existing
canonical execution pages and kernel operations, not another database or game.

| Operation | Meaning |
| --- | --- |
| `operation.admit` with a launch binding | Reserve a guard and retain the exact original start payload, publication, endpoint and limits. |
| `agentica.launch.dispatch` | Record the first dispatch intention. A replay does not authorize another SDK start. |
| `agentica.launch.announce` | Bind an exact service announcement to its original scope/session/objective. This grants no effects. |
| `agentica.launch.grant` | Separately grant initial execution under the still-current publication and custody. |
| `assertLaunchGrant` | Validate active launch, run, capability, publication, live funded guard and deadline in the effect transaction. |

One active launch excludes replacements. A dispatched but unannounced start
remains ambiguous after local cancellation/ACK and blocks a replacement paid
start. Read/reload never dispatches. Generic kernel adoption does not adopt the
wire run. Protocol adoption remains a later explicit operation.

The binding is at most 4 KiB, start payload 3 KiB, announcement 2 KiB and individual
receipt proof 12 KiB. Start capabilities are restricted to observe, inspect and
navigate. The formatter still owns lawful earned disclosure; retaining a supplied
payload does not prove it contains only earned knowledge. The SDK/controller must
verify its computed manifest hash and pin the action deadline on the canonical
request. Domain target/argument validation remains mandatory.

Cancellation and ACK use the existing funded kernel methods with no ordinary
launch write. A cancellation proof is projected from the original receipt and
retained sources. Local ACK releases capacity; only separately verified service
evidence can establish remote completion. The guard must not be released merely
because its browser transaction succeeded.

## Review And Evidence

Independent review reproduced an integrity defect: after cancel/ACK released the
allocation, a missing active pointer could conceal an unresolved original start.
The repaired read and admission check the bounded namespace witness and reject
both reconciliation and replacement. No new history scan or parallel marker was
introduced. Parent commit `5d5edc4` carries the fix.

- **65 native launch cases passed** in the parent: source corruption, mutable
  inputs, exact retry, conflicting run metadata, unknown start, missing pointer,
  current custody, quota cancellation/ACK and injected native rollback.
- **17 native GameSession host cases passed**, including three composition cases:
  actual game publication identity plus explicit initial grant; cancellation
  invalidates further host effects; manual movement stales an original publication
  without refreshing its historical evidence. Announcements and the gated marker
  effect are fixtures, not SDK/service behavior or a completed observe tool.
- Independent review passed the 65-case launch cohort, 61 focused units and three
  additional probes, then the 17-case host cohort, 23 recovery units and five
  probes. These overlap parent coverage and are not added to its totals.
- The full parent unit aggregate passes **3,249 tests / 213 files** after removal
  of obsolete expedition persistence/format tests. Fewer legacy tests is not lost
  canonical coverage; the retirement reports map the retained domain assertions.
- Main and host/launch fixture typechecks pass. All evidence is provider-free.
- Final actual-App rerun: **13 passed**, including desktop/mobile render, Auto,
  recovery, named saves, two-tab custody and 1/8/16-floor movement. The retained
  paged-topology cohort passes **20 tests** after its removed expedition-fixture
  dependency is replaced with an inert sentinel. This last cohort qualifies
  retirement noninterference, not the canonical runtime. Together with launch
  and host checks, this increment ran **115 distinct browser cases**.
- Final production build passes. The existing port-5198 preview remains at a
  rendered Ready checkpoint; it was inspected without reset or takeover.

## Next Bounded Integration

1. Add the canonical scoped observation/capability formatter and actual SDK action
   binding through the shared queue. Enforce target legality and action deadlines;
   compose the original action result with navigation admission atomically.
2. Bind the service's parked admission before local travel. Persist ordered exact
   progress/terminal deliveries, explicit protocol adoption, wake intentions and
   remote terminal reconciliation before ACK. No replacement start after timeout.
3. Qualify same-owner cleanup and explicit new-owner recovery at storage limits,
   including the stopped/full-quota claim policy described in the host report.
4. Retire remaining stream/directed/old RPG writers after their useful contracts
   are represented in canonical tests, then run the complete multi-controller,
   depth/revisit and two-dungeon qualification matrix.

No UI or paid provider gate is authorized by this report. Issue #11 and the
umbrella goal remain open.
