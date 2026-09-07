# Implementation ledger

DataForge implements the TestForge brief under the repository's product name.
Deployment target: GitHub Pages, `/DataForge/`, no server-side runtime.

## Functional commits

| ID    | Scope                                                           | Completion evidence                 |
| ----- | --------------------------------------------------------------- | ----------------------------------- |
| DF-01 | Vite/React strict TypeScript foundation                         | build, lint                         |
| DF-02 | Deterministic random, errors and generation contracts           | unit/property tests                 |
| DF-03 | Polish identifiers                                              | reference and property tests        |
| DF-04 | Danish CPR, business/bank identifiers and address provenance    | reference/profile tests             |
| DF-05 | Generic generators, schema dependencies and relational datasets | integration tests                   |
| DF-06 | Negative cases and constrained pairwise                         | mutation/coverage tests             |
| DF-07 | JSON Schema import                                              | supported/unsupported keyword tests |
| DF-08 | Data import, transforms, exports and generated code             | roundtrip/escaping tests            |
| DF-09 | IndexedDB versioning, templates and settings                    | persistence tests                   |
| DF-10 | Accessible bilingual workbench and worker generation            | component/E2E tests                 |
| DF-11 | Offline assets, CI, documentation and benchmarks                | build/E2E/benchmark                 |

Every completion claim must be backed by executable evidence. Unsupported external
registry validation is not substituted with local syntax checks. No production
requests are made. Official test pools and DAR snapshots are user-imported sources.
