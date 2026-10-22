# Issue 11 Fixture Type Qualification

Base: `eef13af5763c0ad2980379dca72fa88da41a2219`.
Branch: `codex/fixture-type-cleanup`, in the isolated clean-lock worktree.
The existing `codex/clean-lock-qualification` branch is preserved.

The broad fixture check reproduced 13 TS2339 errors in six operation specs:
navigation-only `steps`, `position`, and `deadline` were accessed on the
navigation/interaction union. Thirteen explicit runtime checks now require the
returned state's real `kind === 'navigation'` discriminant before those accesses.
Missing or interaction states throw. No casts, assertion removal, production
changes, dependency changes, or compiler-setting changes were introduced.

Environment: Windows; Node v22.13.0; TypeScript 6.0.3; Playwright 1.61.0.

```text
node node_modules/typescript/bin/tsc --noEmit -p tests/e2e/canonical-agentica.tsconfig.json
node node_modules/@playwright/test/cli.js test --config tests/e2e/canonical-agentica-operations.config.ts --list --reporter=list
git diff --check
```

Type check: before exit 2 / 13 errors; after exit 0 / no diagnostics.
Discovery: exit 0; 120 tests in 10 files. Diff check: pass.
Local logs: `test-results/fixture-type-cleanup/typecheck-before.log`,
`typecheck-after.log`, and `operations-discovery.log`.

This qualifies types and discovery only. No browser tests, providers, services,
preview, or listeners were run. Runtime qualification must use the parent's
future frozen candidate with the integrated observation proof schema.
