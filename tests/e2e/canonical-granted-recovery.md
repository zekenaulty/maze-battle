# Granted launch recovery qualification

Base: Maze `6da48ed1bd89be9941e260a03a491990ca68487b`.
Scope: `launchRecovery*.ts` and this isolated fixture family only.

## API and controller handoff

`createGrantedLaunchRecovery(port, launchId, fetchImpl = fetch)` is exported from
`src/services/agentica/game/launchRecovery.ts`. It returns a promise for
`{ inspect, stop, close }`, matching the initial recovery helper's surface.

- The caller first fences fresh actions and releases the root transport attachment.
- The caller may commit funded local guard Stop before constructing recovery.
  `stop()` replays that original cancellation source, not a replacement attempt.
- `inspect()` reads the exact original durable start without adopting or granting
  authority. Historical grants and read-only GameSessions are supported.
- `stop()` performs funded local Stop before HTTP lookup/validation, including at
  ordinary quota exhaustion. Cleanup still requires current GameSession custody.
- A service entry with `terminal: null` returns
  `{ status: 'stop-requested', localStopped: true, settled: false }` after Stop is
  accepted. It cannot ACK or release the root reservation.
- Only the existing `launchAcknowledgement` verifier can ACK the exact retained
  root start settlement. Successor outcomes and foreign run identities do not count.
- HTTP 404 remains UNKNOWN, not proof of no execution. No start, wake, adopt,
  action reconciliation, or child-operation cancellation is performed here.
- `createLaunchRecovery` still rejects granted launches. The granted entry point
  rejects undispatched, dispatched-only, and announced-only launches.

## Checks

Windows Chrome, native IndexedDB and Web Locks; isolated origin/port 5268.
The fixture injects synthetic correlated-start and HTTP evidence. It never calls
Agentica, a provider, or any real `/api/` route. Request hashes are opaque fixture
identities, while the capability manifest digest uses production code.

```powershell
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-granted-recovery.config.ts
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-granted-recovery.tsconfig.json
node node_modules/vitest/vitest.mjs run src/services/agentica/game/launchRecovery.wire.test.ts src/services/agentica/game/manifestDigest.test.ts src/services/agentica/game/network.test.ts src/persistence/canonical/agentica/launch.service.test.ts src/persistence/canonical/agentica/launch.validation.test.ts
npm run build
git diff --check
```

Results: 38 native cases PASS; 104 focused unit tests PASS; fixture TypeScript and
production build PASS. Coverage includes wrong full-request/root identity at quota,
pending versus stopped/interrupted settlement, exact Stop/ACK rollback retries,
lost committed ACK reply, reload, read-only inspection, attachment exclusion,
lifetime changes, initial-only guard preservation, and unchanged original history.

This is native host qualification with synthetic service evidence, not a live-service
quiescence or decision-controller qualification. The controller/service remain
responsible for unresolved results and child operations; this helper keeps funds
while their authoritative root start remains unsettled.
