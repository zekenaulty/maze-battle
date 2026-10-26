# Guidance setup verification — 26 October 2026

Scope: Maze Battle local guidance, shared proposal/consumer response, read-only
architectural fit diagnostic and one pinned original-arch regression fixture.
Owned branch: `codex/maze-agent-guidance`, based on consumer
`e9b658218c160de2300fe7cc2a6a109b9a8d5632`. Runtime geometry and canonical state are
unchanged. Primary checkout, active 3D repair and TileLab implementation were
inspected read-only.

| Check | Result |
| --- | --- |
| New diagnostic regression command in the local skill | PASS, 7 checks |
| Existing `workshopImport`, `stage`, `boxUVs` focused Vitest cohort, `--maxWorkers=2` | PASS, 59 tests in 3 files |
| `node node_modules/typescript/bin/tsc -p scripts/architecture-fit/tsconfig.json` | PASS |
| `npm run build` | PASS; existing large bundle warning remains |
| Skill frontmatter/naming validation | PASS; Python UTF-8 mode required for the validator on this Windows host |
| Local guidance Markdown links and whitespace | PASS |
| Shared spatial contract versus recorded TileLab SHA-256 | Exact byte match to `88cb425ba5575d5d9f16462f672aa7db3f6a64a4bbeae9d2243a80833cb31fa5` |
| Git portability for hashed contract and geometry | `.gitattributes` preserves their exact bytes without newline conversion |
| Fresh-agent governance replay / browser / real door swing / gameplay admission | UNKNOWN; not run or claimed |

`npm ci --ignore-scripts --no-audit --no-fund` succeeded in the isolated checkout;
no dependency or lockfile changes were needed. The standalone preflight deliberately
returns FAIL/exit 1 for the original independent arch at preview scale 1.5. Passing
regression tests confirm that rejection, not that the arch fits.

The peer's local guidance and proposed contract appeared during this task. Their
file hashes are recorded in the consumer response. Its own 1.6-scale diagnostic
uses an observed dirty 4.8-height consumer context; our 1.5-scale diagnostic uses
committed 4.5-height source. These are different explicitly named hypotheses and
baselines, not contradictory or independent acceptance proofs. Both retain the
original arch as a demo and leave actual installation unadmitted.

For a later fresh-agent replay, use the original requests “make an arched frame for
our existing iron door” and “make masonry repeat cleanly three times up the wall.”
Observe actual source discovery, local skill selection, explicit conversion,
geometry-preserving UV reasoning, impact analysis and truthful evidence. This is
an evaluation plan only; written scenarios do not establish behavioral success.
