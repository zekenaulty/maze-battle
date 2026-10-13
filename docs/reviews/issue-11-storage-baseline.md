# Issue 11: Native Storage Baseline

2026-10-12. Before-change source: `0de393541b135240bdbea2a96f3330433393d61f`.
Evidence level: local Chromium `155.0.8059.39`, actual native IndexedDB and
`GameSession.transition -> updateOwnedGame`, provider-free. This is a reproduced
architecture cost, **not a capture of the owner's original save**.

## Method

`tests/e2e/storage-baseline.config.ts` runs a dedicated origin, `127.0.0.1:5208`,
fresh context per retained depth. Each case creates the same seeded 31 x 33 active
floor (1,023 cells), with 1/32/256/512 synthetic retained floors. No combat or
Auto policy runs. Six east/west manual moves use the actual controller, domain
command, observation archive and telemetry persistence. One unchanged-controller
refresh is then measured. Six further steps run with instrumentation removed.

The test-only probe wraps native `IDBObjectStore` calls and transaction completion;
it reports store/method/count, successful or failed outcome, logical UTF-8 JSON
payload bytes, synchronous call time, request time and transaction time.
Serialization time attributable to the meter is separately reported. Request
counts and JSON lengths do not reveal internal structured-clone allocation or
physical disk writes. Shared references and engine compression differ from JSON.

Command: `node node_modules/@playwright/test/cli.js test --config tests/e2e/storage-baseline.config.ts`

Result: **4/4 passed**, no retries, 28.4 seconds. Each step had one `saves.get` and
one `saves.put`, plus small control, observation and telemetry requests. Every
observed transaction completed. No external requests or page errors.

## Results

| Retained floors | First autosave read (bytes) | First autosave write (bytes) | Instrumented mean step | Mean metering overhead | Unmetered step range | Unchanged refresh |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 93,994 | 94,133 | 6.6 ms | 1.3 ms | 5.0-5.7 ms | 1.7 ms |
| 32 | 1,504,304 | 1,504,443 | 62.7 ms | 15.0 ms | 46.6-51.8 ms | 27.8 ms |
| 256 | 11,695,121 | 11,695,260 | 512.2 ms | 118.0 ms | 441.4-792.9 ms | 194.2 ms |
| 512 | 23,341,841 | 23,341,980 | 1,097.7 ms | 243.4 ms | 829.4-955.6 ms | 416.3 ms |

The 512-floor case reproduces a **23.3 MB logical autosave put per step**.
It does not prove 23.3 MB physically written to disk. `navigator.storage.estimate`
reported only 172,032 to 212,992 origin bytes in this repeated-geometry fixture;
it is approximate, asynchronous and not a disk-write meter. Timings are one local
sample, affected by GC, compression, metering and concurrent work. They are not
a universal browser benchmark. Logical payload growth is deterministic.

Even unchanged refresh read the whole record: 23,342,092 logical bytes at depth
512. This is relevant because the normal hook refreshes every 750 ms. The number
of point reads being small never established depth-independent work.

Raw operations, transactions, browser version and storage estimates are attached
to the local `test-results/storage-baseline/results.json` report. The fixture and
probe are committed for reruns; no user save content is included.

## Consequence

The replacement must remove historical floors from both the durable active head
and the resident step projection. Merely writing diffs after first reading/cloning
the whole SaveSlot is insufficient. Memory queries, telemetry and idle refresh
must be included in the after-change measurement. There is **no canonical
after-change result yet**; issue #11 remains open.
