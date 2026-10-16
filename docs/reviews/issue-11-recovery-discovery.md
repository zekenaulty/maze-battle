# Decision Reload And Recovery Discovery

Issue [#11](https://github.com/zekenaulty/maze-battle/issues/11), 2026-10-15.
Service fixture integration: `030276e`, `7883873`. Read-only discovery: `9deb193`.
Uses the canonical GameSession and evidence; no additional game or persistent store.

## Actual Browser Reload

The full integrated browser-to-pinned-Agentica cohort passes **18/18** cases,
including five new adoption/reload cases. A real reload creates a new GameSession
owner/epoch. Only canonical record locators cross the reload; original bindings
are reread from source evidence, not restored from captured SDK callback history.

Completed navigation without a retained intention supports explicit new-owner
adoption: publish earned context, retain the exact event plus new observation,
claim the real SDK reply, adopt the root guard, then select the successor grant.
Real inspect/observe/navigation actions and a local step follow that grant.
Exact lost-adopt replay does not create another planner activation. The replay
case uses a fast-terminal successor and does not grant it fresh actions.

Reload after an old intention, a terminal successor claim, or admitted-child
grant refuses fresh continuation before connecting. Explicit child/root recovery
can then discharge navigation without replacing the old intention or inventing
a claim. Root `terminal:null` remains pending. Read/reload/reconnect alone never
confers authority. These refusal cases are not seamless old-intent continuation.

Integrated artifacts: `test-results/maze-start-service-WNDpJ8/`. Clean service
pin `577a214d020ba35ba3188761da6a114b978516b7`; isolated .NET 10.0.401 build,
zero warnings/errors. This is not repository 10.0.302-pin or hosted-CI proof.
The [fixture report](../../tests/agentica-start-service/DECISION-ADOPTION.md)
records exact source contracts, commands, planner counts, wire checks, and the
intermediate test that overconstrained legitimately changing snapshot metadata.
No paid provider calls occurred.

## Scoped Local Discovery

`listAgenticaRecovery()` reads at most sixteen local allocation candidates,
the active launch and the selected grant's immediate predecessor. It never
walks history or grant ancestry. `inspectAgenticaRecovery(fence, candidate)`
loads one explicitly selected original, validating its reserve-source binding,
action/result, progress, intention/claim and any historical ACK. It does not
replace the original grant/publication with the currently selected pair.

Both APIs are local reads. Opening absent/obsolete storage aborts rather than
creating or upgrading it. A schema-held connection protects the bounded query
from replacement. Owner/revision changes invalidate inventory or inspection.
Corrupt evidence refuses inspection, with no cleanup write or synthesized fact.
The schema guard is an additional read-only handle to the same canonical
database, not another persistence authority or compatibility reader.

Pending-only remote actions are not enumerated. Both `pendingRemoteActions` and
`sessionClear` remain explicitly `unknown`, including for empty local allocations.
This is a recovery inventory, not proof of remote quiescence or a provider tool.
It cannot authorize reset, resume, selection, wake, adoption, Stop or ACK.

Integrated native qualification: **20 PASS**, 52.1 seconds, no retries. Tests
audit canonical stores for zero writes, reject scans, exercise all sixteen
allocations at quota, exact sources/bindings, stale fences, actual reload,
historical ACKs and constant predecessor lookup counts across successive windows.
Evidence: `test-results/canonical-recovery-discovery-integrated/`.
Independent source review found no material issue. Production build and discovery
fixture TypeScript passed. [API and reproduction](../../tests/e2e/canonical-recovery-discovery.md).

## Remaining Gate

- Qualify browser reload while an ungranted successor action is actively pending,
  rather than extrapolating from a terminal successor. Preserve uncertain custody;
  never turn it into a successful action, a fresh replay, or a fabricated release.
- Qualify exact adoption replay after a service-process restart separately from
  the already-checked ordinary wake restart.
- Mount explicit bounded recovery in the actual App, accessible even when
  ordinary play is blocked at quota. Preserve old-hook/lifetime fencing, require
  explicit positive adoption, and keep reset from erasing unresolved current
  remote obligations. Obsolete save disposal remains authorized by #11.
- Complete multi-controller depth/revisit/capacity and two-dungeon qualification.

The App is not mounted to Agentica yet. There was no user database reset or
preview replacement. This report does not close issue #11 or the umbrella goal.
