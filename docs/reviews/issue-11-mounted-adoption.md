# Issue 11: Mounted Inspected Decision Adoption

2026-10-18. Runtime/proof commit `9cef9e4`, branch `codex/agentic-game-a1`.
This increment qualifies explicit new-owner adoption in the actual App, not
frontier/quest completion, unrestricted automatic continuation or closure of #11.

## Implemented Boundary

Opening recovery remains local and inert. Inspecting a retained original can now
offer **Adopt and continue** for a confirmed, settled, unacknowledged decision
with no retained intention/claim and remaining service allowance. It discloses
the original objective, endpoint, provider/model, limits and remaining allowance.
No schema creation, publication, service call, lease or adoption occurs on inspection.

An explicit click acquires the existing manual-control lease, flushes the shared
GameSession and rereads the exact offer/fence. Changed identity, control, settings,
custody or source evidence requires recovery. The browser then uses the existing
decision protocol: current earned publication, retained intention, exact prefix,
correlated service adoption claim, decision-specific root guard adoption, and
successor grant/selection. Child navigation waits for the predecessor's exact
handoff ACK and then proves its own service custody before moving.

Adoption follows the terminal event's epoch, which may already reflect a prior
navigation transfer, rather than assuming the original action's epoch is current.
A same-owner string at a later epoch is not same custody. A root already adopted
at the exact current owner/epoch cannot bypass the required decision-specific
guard receipt. Intervening older custody does not itself forbid a legitimate new
adoption. Retained old-owner intentions/claims remain on the existing recovery
path; this button neither overwrites nor automatically replays them.

The active panel uses the validated retained provider and limits, even if current
configuration differs. After explicit Stop, the panel returns to the configuration
for a future fresh Start. Stop withdraws local execution immediately; if the offer
has not passed revalidation, it cannot cancel a root ID supplied by that offer.
Lost ownership withdraws the offer. Late allowance/adoption callbacks cannot
change a stopped or replacement attempt.

Same-owner Continue now derives its advisory availability from validated retained
service usage and the effective request, replacing the local decrement counter.
A pending read is distinct from exhausted execution allowance. Canonical and
service checks remain authoritative. No persistent UI journal, additional writer,
hidden collection, automatic wake/reconnect or per-cell planner call was added.

## Qualification

- **PASS:** 1,033 affected unit tests, zero failures/skips, 30.41 seconds.
  `vitest run src/services/agentica/game src/persistence/canonical/agentica src/services/game src/components/agentic src/config/agentica.test.ts --maxWorkers=2`.
  Artifact: `test-results/app-adopt-focused-final.json`.
- **PASS:** 29 browser-to-local-Agentica cases, zero failures/retries/skips,
  237.60 seconds. Artifact: `test-results/maze-start-service-BMiMrI/` pins Maze
  `9cef9e4` and clean Agentica `27cb2ce9717438edfe19487e3920faa183112c97`.
  Source hashes, service counters, wire traffic, screenshots and traces remain there.
- **PASS:** 13 ordinary App/manual/recovery browser cases, zero failures/retries/
  skips, 33.46 seconds. Artifact: `test-results/app-recovery/results.json`.
  Invalid observation history retains usable explicit reset; portal/guild/inventory,
  reload and explicit two-tab takeover still use the same actual game.
- **PASS:** production and fixture TypeScript checks; production Vite build.
  Existing chunk-size warning remains: main JS 724.61 kB / 220.02 kB gzip.
- The full unrelated unit suite was not rerun. Earlier aggregate evidence belongs
  to its identified candidate, not this increment.

The new actual-App positive case changes configuration on browser reload, inspects
the original without any durable write or service traffic, and explicitly adopts.
It verifies exact retained settings, new current owner/epoch, unchanged controller/
host lifetime during adoption, immutable root binding/grant, parent ACK, claim-before-
guard-adoption ordering, selected child grant, arrival and exhausted allowance.
Exactly one root Start and one explicit adoption produce two four-action scripted
windows: map inspection, room inspection, observe and earned navigation. No wake,
resume or replacement root occurs. Root and child remain separately funded until
explicit Stop. The negative case withdraws the displayed offer on another tab's
takeover without an adoption, wake or extra planner activation.

Mobile adoption/continuation screenshots at 390x844 were inspected; the active
panel fits without horizontal overflow or overlapping text. Recovery is scrollable,
and the native test activates its inspected-offer button through the real UI.

Independent source review found no material authority defect. Its coverage note
led to resolve/reject tests for an old allowance read after Stop and a new attempt.
Independent test review tightened exact profile, current custody and completed
allowance-read oracles. Initial two-case proof `maze-start-service-FZ8A6L` and
strengthened three-case proof `maze-start-service-tcZR3V` passed before the final
29-case run; they do not replace that integrated result.

These are offline scripted planners, not live-model judgments. Paid calls are
zero. The service uses alternate installed .NET 10.0.401, not repository SDK-pin
10.0.302 qualification. User preview/database/configuration were not reset or
replaced. Test services stop after their runs; the existing 5198 preview remains.

## Remaining Work

1. Expose bounded earned-frontier selection/exploration and explicit ordinary
   quest collection through the same game-owned commands and Agentica custody.
   Port intended behavior, not the deleted stores or old-save adapters.
2. Complete depth/revisit/capacity, multicontroller and Lumina two-dungeon Q with
   actual App evidence, meaningful observation-driven choice and host-proven return.
3. Keep any live-model gate separately authorized and reported. This scripted
   adoption proof cannot establish exploration quality or paid-provider readiness.

The bounded service response page still reads a capped underlying ledger as a
whole. Retained exact evidence has an enforced logical quota, not infinite
history or physical-disk-byte guarantees. Obsolete formats remain disposable
without migration; current unresolved obligations stay protected. Issue and
umbrella goal remain open.
