# Issue 11: Shared Game Host Queue

2026-10-13. Canonical controller integration, not a mounted SDK or a remote
service qualification. No provider calls, new game store, or UI activation.

## Implemented

- `GameSession.submitHostCommand` serializes trusted local host commands with
  manual, Auto and save commands. Fresh requests receive the current canonical
  fence inside that queue. Exact retries preserve the original request, including
  fence and deadline, and publish the current game rather than the old result's
  revision. Inputs and executor references are captured before queueing.
- This is an internal TypeScript port, not a provider capability. Each domain
  executor still owns grant, target, publication and deadline validation. The port
  does not authorize arbitrary provider-requested persistence work.
- All seven ordinary command/preparation wrappers now pass the session's abort
  signal into the native transaction. Stop, lock loss, restart and reset invalidate
  queued work and abort transactions which have not committed. An already committed
  receipt remains authoritative; a late UI update is never evidence of rollback.
- Funded cleanup is a separate, narrow queue path. It invokes only kernel cancel
  or ACK, never a supplied callback. It reacquires presence without stealing and
  verifies current owner, game and generation before constructing the live fence.
  It does not adopt, resume, clear recovery state, or require a game projection.
- Cleanup retries preserve their original request. A failed/uncertain cleanup
  exposes that request in `HostCleanupError` for reconciliation. Local kernel ACK
  is not proof that a remote service stopped; the future controller must verify
  remote terminal evidence before authorizing it.
- Takeover's committed custody is retained before attempting resume. A failed
  resume at normal quota does not hide successful takeover from cleanup. The first
  recovery error remains visible instead of being replaced by discarded queued
  action errors.

## Checked Evidence

`canonical-game-host.config.ts`: **14 native-browser cases passed**, using the
production GameSession and canonical database on isolated port 5234:

- Publication / manual movement ordering, original publication proofs, exact retry,
  no extra effect on replay, captured mutable input, retained navigation and the
  resulting GameView position.
- Stop at the native head write rolls back staged host, settings, save and look
  changes and discards queued work. Invalid host work latches recovery.
- Normal quota refusal followed by funded cancel, exact retry and ACK; preserved
  read-only/error state; native cleanup write failure and original-attempt retry.
- Successful takeover followed by quota-blocked resume still permits cancellation.
  A presence lock alone cannot cancel a foreign owner's work. Reset invalidates
  queued cleanup and old-generation operation targets.

The fixture lowers the logical quota with correct head accounting to exercise
exhaustion; it does not change the production quota policy or claim physical disk
exhaustion. Native write refusal is a separate injected case.

Focused session/game/Auto units: **32 passed**. Production and host-fixture
TypeScript pass. The actual-App browser cohort passed **13 cases** after the
initial queue/abort changes; it predates the separate cleanup-method addition.
Overlapping reruns are not cumulative test counts.

## Remaining Boundaries

The port alone does not mount a client. Launch/run authorization, lawful scoped
capability projection, service parking, ordered event delivery, wake/adoption and
remote ACK still need end-to-end composition before enabling Agentica controls.
Same-session cleanup requires a live controller lifetime; it does not revive an
unmounted/stopped GameSession. Reload creates a new owner and requires explicit
custody transfer. A stopped foreign head at exhausted normal quota cannot be
claimed under the current kernel policy. Do not bypass that fence or copy its
owner identity; any expanded recovery policy needs its own qualification.
