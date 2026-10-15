# Decision Navigation Discharge After Root Stop

Issue [#11](https://github.com/zekenaulty/maze-battle/issues/11), 2026-10-15.
Runtime `1c49329`; integrated native tests through `7b1cdb6`.
This closes the two interrupted-decision discharge gaps recorded in the
[controller report](issue-11-decision-controller.md). It does not mount Agentica,
complete the objective, or authorize a provider call.

## Exact Evidence, Separate Authority

The new `decision-root-stop` ACK combines three independently checked facts:

1. The original root start has a verified Stop acknowledgement, including its
   immutable dispatch, full request, admission, and service settlement.
2. The original completed navigation has its exact action, admission, progress,
   terminal receipt, and a retained explicit decision intention.
3. The service retains that exact decision operation in a non-open state.
   A retained correlated claim must agree with that entry. An absent claim stays
   absent; an inventory run ID is never promoted to a correlated reply.

The pinned Agentica service issues root settlement only after the session has no
unsettled execution, action custody, or parked/waking operation. A pending root
Stop does not discharge navigation. The root ACK alone is also insufficient.
The combined proof releases only this navigation's reserved capacity, never its
child's reservation, a successor execution grant, or an objective success.

When a successor has admitted a child, the service correctly refuses to stop
the parent decision. Cleanup instead reconciles the child, settles the root,
then acknowledges the predecessor using its unchanged service entry. It never
manufactures a parent Stop marker. Ordinary quota exhaustion cannot consume
the separate cancellation and acknowledgement reserves.

Historical validation pins the original root ACK and optional claim reference.
The intention precedes root settlement, which precedes navigation discharge.
A later evidence-only claim cannot rewrite the earlier proof. No recursive
ancestor traversal, world scan, new writer, or save-format compatibility is added.

## Retry Repair

Review found a race: a legitimate claim arriving after ACK preparation but
before commit invalidated the prepared proof, while the controller kept retrying
that stale request. The atomic navigation read now establishes whether that ACK
actually committed. Only an uncommitted attempt can be replaced when its fence
or full proof input changed. This includes a claim arriving before the cleanup
port captures its newer revision fence. A committed ACK still follows exact
historical validation and never becomes a replacement write.

Native barriers exercise both sides of commit: a rejected no-claim proof retries
with the retained claim; a claim arriving after commit plus reply loss preserves
the original no-claim proof. Independent revision changes also rebase only a
confirmed uncommitted attempt. Review closure found no remaining issue in this fix.

## Checked Evidence

- Full unit suite after the runtime repair: **2,807 PASS / one optional probe
  SKIP**, 224.94 seconds, two workers. Focused Agentica suite: **293 PASS**.
- Integrated controller cohort: **83 native browser cases PASS**, 4.6 minutes,
  one worker, no retries. This uses the actual GameSession and native IndexedDB
  with synthetic service evidence. Artifacts:
  `test-results/canonical-decision-root-stop-integrated/`.
- Coverage includes absent/foreign/mutated source evidence, unsettled root,
  open decision, regressed usage, wrong run/adoption, exact quota retry,
  transaction rollback, lost replies, reload, historical ordering, and the
  three injected retry races. Unknown or invalid evidence leaves funds retained.
- Browser-to-real-Agentica: **13/13 PASS**, 76.31 seconds, against clean source
  `577a214d020ba35ba3188761da6a114b978516b7`. The cohort includes all eleven prior
  regressions plus lost-claim and admitted-child Stop cases. A process-restart
  regression now also checks final discharge. Cleanup adds no planner calls.
- Real-service evidence is in the isolated fixture worktree at
  `test-results/maze-start-service-39oGLd/`. Exact commands, source/runtime hashes,
  failed intermediate fixtures and their corrections are in the
  [service report](../../tests/agentica-start-service/DECISION-STOP.md).
  The build used .NET **10.0.401**, not the unavailable repository pin 10.0.302
  or hosted CI. Injected provider-free planners are not live-model proof.
- Production build and both controller/service fixture TypeScript projects PASS.
  No paid calls, user database reset, or preview replacement occurred.

The real-service cohort does not inject the late-claim transaction race; the
native cohort does. The native cohort cannot substitute for service quiescence
proof; the actual service cases cover that separate boundary. New per-operation
read/write measurements are a follow-up, not inferred physical disk evidence.

## Next Bounded Integration

The next service proof must use a real browser reload and new GameSession, not
same-session controller reconstruction. Complete navigation before retaining an
intent, reload, explicitly publish earned knowledge and adopt the decision, then
verify claim, guard adoption, selected grant and successor movement. Retry the
exact lost adoption reply without another planner activation.

An already retained intent belongs to its original owner/epoch and cannot be
silently replaced after reload. That boundary is currently recovery-only, not
seamless continuation. Qualify explicit child/root cleanup at retained-intent,
lost-claim and granted-child reload boundaries. Do not loosen ownership to make
the positive adoption case pass.

After those gates, compose bounded recovery discovery, the existing controllers,
and lifecycle fencing in the actual App. Full depth/revisit/multicontroller and
two-dungeon qualification remain open. Issue #11 and the umbrella goal remain active.
