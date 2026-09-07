# Benchmark notes

Run `npm run benchmark`. The script prints runtime/CPU and per-size results as JSON lines; CI repeats it for the current commit.

Local sample on 2026-09-07: Node v24.19.0, Linux, Intel Xeon Platinum 8573C. Three fields: UUID, standard Danish CPR and an integer. Fixed seed `benchmark-v1`, Danish locale, fixed reference date. CSV protection enabled, no source pool. Dependency loading is outside the measured interval.

| Records | Generation | CSV export | CSV bytes | Heap used after export |
| ------: | ---------: | ---------: | --------: | ---------------------: |
|   1,000 |      25 ms |       3 ms |    54,903 |                 17 MiB |
|  10,000 |     143 ms |      14 ms |   548,929 |                 22 MiB |
| 100,000 |   1,464 ms |      89 ms | 5,488,869 |                 72 MiB |

These are single-run Node measurements, not browser latency targets, peak-memory measurements or guarantees. Worker message transfer, UI rendering, IndexedDB, per-row worker validation and file saving are not included. Array-heavy schemas, Faker text, legacy checksum search, unique retries and XLSX export can be materially more expensive. Use CI logs for measurements after later code changes.

Browser tests separately verify that the production UI generates records, can cancel a 100,000-record job, works at a 390 px viewport and generates offline after service-worker installation. They do not establish a universal responsiveness or memory SLA.
