# Canonical Service Custody and Progress

Issue #11, 2026-10-13. This increment uses the actual GameSession queue and
canonical IndexedDB records. It is not a second game, a mounted Agentic Play
controller, a complete journey protocol, or a paid-provider qualification.

## Implemented Boundaries

- `game/launch.ts` prepares only earned actor context and the three bounded
  observe/inspect/navigate capabilities. The caller supplies objective, provider
  and limits; preparation does not contact a provider or select hidden targets.
- `game/transport.ts` retains dispatch before SDK start, checks custody again
  before sending, accepts only a correlated valid announcement, and commits the
  local grant before releasing early action hooks. Unsolicited announcements,
  connection/reload and historical receipts do not grant fresh execution.
- In-memory attachment claims avoid concurrent controllers poisoning the same
  GameSession queue. Durable owner/revision/dispatch fences remain authoritative
  across tabs and reloads. Uncertain starts are not automatically repeated.
- Relevant terminal service messages, disconnect, and the originating game
  lifetime synchronously withdraw queued effect permission. Closing a transport
  does not claim remote cancellation. Completed original results remain readable.
- Original request/action/admission, launch grant, publication and funded
  navigation are source-bound in canonical operation records. Movement commits
  its progress event atomically. A pending event cannot be overwritten or skipped
  by another movement; acknowledgement must match its original bytes and lineage.
- The HTTP wrapper enforces a 4 MiB streamed response bound and ten-second timeout
  before the SDK buffers response text. Cancellation is best-effort, not an
  unbounded wait. Redirects and ambient credentials are excluded.
- Explicit TakeControl may use global emergency headroom to claim stopped
  foreign custody at normal quota exhaustion. Startup does not opt in. The head
  remains stopped if ordinary resume cannot be funded; original operation
  cancellation/ACK allowances remain usable without implicit adoption or play.

## Service Crash Window

Pinned Agentica writes operation admission before resolving original action
custody (`HostRun.AcceptResult`). A listable `parked` entry therefore does not by
itself prove that the service can accept progress. A parked notice is also not a
sufficient replacement proof.

The integration retains a deterministic zero-movement progress probe before
delivery and requires the exact service acknowledgement before the first step.
`ApplyOperationEvent` checks original custody even on a duplicate. The probe
reuses the exact admission observation, changes no game position or earned
knowledge, and invokes no model. Failed/lost replies retry that same probe.
Local navigation counters and wire event sequence are separate.

The bounded driver performs one confirmation, delivery, acknowledgement or local
step per pulse. It uses the actual GameSession queue, retries retained bytes
after a lost response, and reports arrival as needing terminal reconciliation.
Replacing a driver does not grant ownership; a new game session may reconcile an
old event but cannot silently adopt further movement.

This boundary was discovered in independent source review, rather than inferred
from the earlier mocked inventory test. Final proof results are recorded below.

## Review Repairs

1. Terminal notices now fence work already queued inside an action hook.
2. A guard cancelled after dispatch commit prevents the later start send.
3. Concurrent same-launch attachment preserves one usable winner instead of
   causing both controllers to fail through shared-session recovery.
4. A newly published action can use the original grant without equating its
   publication to the launch's initial publication. Its reservation stays exact.
5. Current progress validates its immediate predecessor's schema, receipt and
   witness. This is bounded adjacency validation, not a full history scan.
6. Concurrent operation drivers are rejected before queueing work; a hostile
   stream's never-settling cancel cannot hold the HTTP wrapper indefinitely.

## Verification

Parent verification passed:

| Gate | Result |
| --- | --- |
| Full unit suite | 3,223 tests in 216 files |
| Native canonical operation/driver cohort | 99 cases, including six actual-GameSession driver cases |
| Initial SDK transport and independent race cohort | 9 + 9 cases |
| Stopped-owner custody recovery | 10 cases |
| Existing GameSession host / SDK actions / action guards | 17 / 23 / 17 cases |
| Actual App | 13 cases, including invalid-evidence reset, depth and desktop/mobile rendering |
| Production and focused fixture TypeScript | PASS |
| Production build | PASS; 1,950 modules, 486.62 kB JavaScript before gzip |

The browser cohorts total 197 distinct cases. Repeated and independent
overlapping runs are not additional cases. They use native Chromium/IndexedDB
and mocked HTTP/WebSocket transport, not a live browser-to-service pairing.
Negative controls reproduced terminal-fence and cancelled-dispatch failures.
The existing preview was inspected read-only: both tabs render the same game,
with one correctly read-only while the other owns control. No preview reset.

Separately, the [pinned Agentica registry proof](../../tests/agentica-service-custody-probe/PROOF.md)
passed against source `d65fb5b7a5d4895921f8854054215b1d6279852e` and hash-verified
existing binaries, without changing or rebuilding Agentica. Both pending and
unresolved original custody reject the sequence-1 probe without durable changes.
Settling the exact original result admits that identical probe; replay leaves
the operation ledger unchanged. A different settled result is rejected. All
cases perform zero movement, planner activation and model calls.

The parent independently repeated that registry proof. Its evidence is retained
at `test-results/agentica-service-custody/ed21db924d2f48d998fd4bd17afc491d/evidence/proof.json`,
SHA-256 `ece871111a7645dc29896bd0448f2d766e433cb8faa5cfd8ee3b802fbd7a46cb`.
This is an in-process real-runtime proof, not HTTP authentication, paired-browser,
mounted-controller or paid-provider qualification.

## Remaining Work

- Derive/deliver funded terminal and cancellation events, then release reserves
  only after exact remote acknowledgement. Ordinary progress ACK writes must
  never become a prerequisite for funded Stop/cleanup.
- Reconcile uncertain original starts; explicit ownership transfer, adoption,
  decision/wake and fresh publication binding across subsequent windows.
- Mount the checked controller in the actual App with usable Stop/takeover.
  Arrival is currently reported as needing terminal reconciliation, not objective
  completion. No automatic interaction, quest selection or combat is added.
- Remove remaining obsolete stream/RPG writers and qualify complete shared-game
  revisit, multi-controller, capacity and two-dungeon behavior.

Issue #11 and the umbrella goal remain open. Existing preview state is not reset.
