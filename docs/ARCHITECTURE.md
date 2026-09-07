# Architecture and operational limits

React renders controls and a bounded preview. Domain modules do not import React, Dexie or Faker. Faker implements the `TextProvider` port in infrastructure. Domain generators own deterministic random, dates, identifier checks, dependencies and scenarios.

The dedicated ES-module Web Worker owns generated records. Normal generation processes batches of 500 and posts progress plus a final preview of at most 250 records. The UI paginates 20 rows; it does not render or copy 100,000 DOM rows. This bounded preview is used instead of unbounded virtual scrolling. Exports operate on the worker's full result, not the preview.

Cancellation terminates and replaces the worker, invalidates the job ID and discards partial results. Errors cannot enable export of a failed new generation. Relational generation, transforms and some serialization steps are synchronous inside the worker; cancellation remains available, but their progress is coarser. Files are materialized in memory, not streamed to disk.

Dexie schema v2 contains templates, revisions, sources and history with a v1 migration. System templates are immutable copies; restore creates a new revision. Only theme/language use Zustand/localStorage. Browser eviction can remove local data; use backups. No record data is put into URL parameters, logs or telemetry.

## Bounds

| Input/workload | Limit |
| --- | --- |
| Generated records | 100,000 per run, including the sum of relational datasets |
| Schema | 200 field definitions, nesting depth 8 |
| Array | 0–1000 items; multiplicative output also checked |
| Text/security sample | 100,000 characters per value |
| Estimated retained output | 256 MiB per generation session; heuristic, not a hard process-memory guarantee |
| Unique/composite retries | 1000 attempts; exhausted finite domains fail explicitly |
| CSV/JSON import | 20 MiB, at most 100,000 records |
| JSON parsing | Depth 14, 3 million nodes, unsafe keys rejected |
| Pairwise | 2–10 parameters, at most 10,000 Cartesian candidates |
| Generated code | At most 1000 records |
| Preview | First 250 records, 20 per page; first relational dataset only |

For datasets, the export selector chooses each full dataset separately. There is no automatic ZIP of related exports. Constraints may require reducing count, especially for uniqueness over small reference pools. Null/empty values allowed by field rates are not counted as unique occupied values. The output-size estimate cannot predict temporary XLSX/serialization buffers or every custom rule's expanded output.

## Security boundaries

Generated and imported strings render as React text, never `innerHTML`. Declared rules are interpreted through an allow-list. Prototype keys and unsafe schema names are rejected. SQL identifiers are quoted; data literals are escaped per dialect (MySQL text uses hexadecimal UTF-8 literals). CSV formula protection handles formula prefixes; raw samples are opt-in. Identifiers are represented as strings in XLSX.

Pseudonymization uses browser Web Crypto HMAC-SHA256. The private key is only held for the active transform and is not written to IndexedDB/history. This is a data preparation tool, not an anonymization certification or a secure enclave. Anyone with access to this browser profile can read saved templates and explicitly saved pools. Keep sensitive data out of reusable schemas and use an appropriate controlled environment.

## Offline and hosting

Vite builds under `/DataForge/`; HashRouter handles views without server routes. The PWA precaches JS (including lazy Faker locales and ExcelJS), CSS, HTML, icons and its manifest. First installation needs network; wait for the ready notice before disconnecting. An update is applied only after the user chooses it. Reference data is never downloaded by the app.

GitHub Pages publishes static assets only. CI tests the production build, including offline reload, before deployment. HTTPS/localhost is needed for Web Crypto, service workers and clipboard access. Clipboard failures produce a message and file export remains available.

## Known tradeoffs

- No online registry validation, live DAR lookup, automatically maintained official CPR pool or bank/account verification.
- JSON Schema support is explicitly bounded; supported format checks are not universal business validation. Generic phone/address fixtures are illustrative.
- Advanced nesting, relationships, transforms and source metadata use editable JSON controls rather than specialized visual forms. Some generator labels and domain diagnostics remain English in the Polish UI.
- Primary/foreign keys and composite equality are supported; there is no expression language, aggregate invoice reconciliation engine or guaranteed per-parent cardinality.
- TypeScript/Java output is inferred starter code, not a complete type compiler. No generated code or SQL is executed by DataForge.
- In-memory transforms/exports can use substantially more memory than the final file. Large XLSX jobs may need smaller batches/files on mobile.
- The checked-in dependency lockfile is part of reproducibility. Upgrading Faker can change names and address output even with the same seed.

`npm audit` on 2026-09-07 reports two moderate entries for ExcelJS → uuid ([GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq)). The advisory concerns v3/v5/v6 calls with a supplied buffer; DataForge does not expose those APIs and ExcelJS's inspected source uses uuid v4 for conditional-format IDs. The browser build uses ExcelJS's packaged bundle. Do not treat this assessment as removal of the dependency advisory; monitor upstream instead of blindly downgrading ExcelJS with `audit fix --force`.
