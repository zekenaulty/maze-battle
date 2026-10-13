# Issue 11: Scoped Perception And SDK Actions

2026-10-13. Canonical P3 integration increment, not complete Agentica adoption.
The actual game's GameSession and canonical database own all tested effects.
No old RPG/expedition adapter, second game, service request or paid provider call
is involved. The client remains unmounted pending the lifecycle work below.

## Implemented Boundary

- `maze.observe`: cheap actor position/mode/facing and retained sight source.
  It does not automatically include room cells, the map or freshly observed facts.
- `maze.inspect`: explicit room, map or cell scope. Room pages cover a bounded
  local query window; map pages contain earned room identities/provenance, never
  their internal cells. Unknown targets remain opaque. Inspection never performs
  movement, look, loot, a roster read or a hidden-world query.
- Sources are immutable original observations. A publication supplies stable wire
  identity and cursor scope. Historical snapshots remain historical; newer sight
  invalidates old cursors rather than rewriting their source evidence.
- `maze.navigate`: flat earned local address, no provider-supplied route. Local
  room coordinates are nonnegative under the actual canonical world contract;
  physical world coordinates may be negative and remain signed in observations.
  An unknown target is refused. Admission preserves the exact target and initial
  limits in the existing retained-navigation executor. It does not move, loot,
  refresh sight, or claim arrival.

The start fixture with real UUID-length identities is 2,252 UTF-8 bytes, below
the 3,072-byte start limit. Its observation is 307 bytes and its three capability
definitions total 1,392 bytes. Sample SDK results are 696, 1,458, 2,609 and about
1,380 bytes; each complete result is also checked against the 4,096-byte cap.
These are logical wire sizes, not network latency or physical storage bytes.

## Durable SDK Hooks

`createGameActionHooks` captures one grant, one publication and one GameSession
lifetime. The unchanged pinned SDK uses its normal load/save/action/reconcile
callbacks. Lookup hashing happens before opening IndexedDB; the lookup then
validates original action identity, source receipt and exact retained result.
Missing originals with orphan results and corrupted evidence fail closed.

1. Pending save validates the active launch grant and capability execution mode
   inside the same game queue, and pins the action deadline on the kernel request.
2. Only a newly committed reservation gives that hook one execution opportunity.
   Existing pending records, replay and reload cannot mint another opportunity.
3. The effect rechecks the grant, current publication, capability and deadline.
   Navigation commits its original SDK admission result atomically with the
   retained operation. Read-only tools keep the published wire revision despite
   internal receipt bookkeeping.
4. Completed SDK saves only verify an already-committed original. They cannot
   fabricate a result. Exact completed replay remains available after grant
   cancellation, Stop, reload or takeover, without requiring a fresh write grant.
5. Reconciliation reads evidence only. It cannot execute an unresolved original.

Navigation admission labels its newer bookkeeping revision explicitly while
preserving the original sight identity and timestamp. It does not label the
destination as reached or invent renewed perception.

## Review Repairs

- Pending-save shortcuts previously acknowledged the same fingerprint through a
  different publication. Both preflight and insertion-race branches now require
  the original publication/effect. Completed historical replay stays independent
  of a current publication. Native negative controls reproduced both shortcuts.
- Deferred old hooks could otherwise cross Stop/start in the same GameSession
  without an epoch change. Hooks now capture `hostSignal` at creation and carry
  it into submission. GameSession rejects a foreign lifetime before queueing and
  again when executing. Already-completed reconciliation remains read-only.
- An older host-launch test used an absolute action deadline that expired during
  this work. That native fixture now generates a fresh deadline; production
  deadline enforcement was not relaxed.
- The App depth fixture assumed two open cells beside every generated entrance.
  It now selects a verified reciprocal, observed edge away from stairs. Its input
  assertion checks actual position, not a Ready-to-Saved status change. No gameplay
  movement, geometry or measured-write budget was relaxed.

## Qualification

The dedicated native cohorts cover scoped disclosure/provenance, actual SDK
offline dispatch, exact admission/replay, pending recovery, invalid arguments,
grant revocation, manual-movement races, concurrent reservations/execution,
queued/commit-time deadline expiry and input ownership. Tests run in isolated
origins with native IndexedDB; they do not reset the owner's preview.

Integrated checks: 3,186 unit tests pass in 211 files. Distinct focused native
cases are 8 perception, 23 SDK actions/lifetimes, 17 action guards, 17 GameSession
host and 13 actual-App cases. The App depth case was repaired as described above
and rerun. Legacy-retirement cohorts and independent overlapping repeats are
reported separately in their closure reports, not added to this total.

The SDK tests invoke the pinned SDK action handler with an in-memory transport
and a simulated, durably retained service announcement. This qualifies the SDK
action/store contract, not websocket start, service park/wake or live-provider
behavior. TypeScript and production build checks are required alongside these
tests; final checked commits and counts are recorded in the issue update.

## Remaining Work

1. Connect the real SDK transport to canonical launch custody, including ambiguous
   start/reconnect recovery. Fresh publication replacement must be explicit; the
   current hooks are intentionally single-publication.
2. Confirm service custody before navigation advances. Persist ordered progress,
   terminal delivery and acknowledgement with their exact original receipts.
   Arrival is host-proven, not a model claim or an admission result.
3. Connect explicit operation adoption, decision/wake and Stop/manual-load cleanup.
   Do not equate a local ACK with proof that the remote service retained an event.
4. Finish stopped/new-owner recovery at normal-storage capacity; remove remaining
   old stream/RPG writers when their canonical protocol consumers are qualified.
5. Mount the client only after those gates, then rerun multi-controller, revisit,
   storage-limit and two-dungeon qualification. Combat and paid calls remain off.
