# DataForge

A local-first test data workbench for QA engineers and developers. Create reproducible fixtures, relational datasets and controlled negative cases directly in your browser.

[Open DataForge](https://pogryziony.github.io/DataForge/) · [Validation workflow](https://github.com/Pogryziony/DataForge/actions/workflows/ci.yml) · [Deployment workflow](https://github.com/Pogryziony/DataForge/actions/workflows/pages.yml)

## What you can build

- Quick single-field samples or custom schemas with nested objects, arrays, weighted dictionaries, optional fields and declarative dependencies.
- Polish identifiers: PESEL, NIP, REGON (9/14), identity document numbers and NRB.
- Danish fixtures: CPR profiles, CVR, VAT, P-number syntax, bank account components, Danish addresses and imported DAR reference records.
- Related datasets with unique primary keys, foreign keys and composite uniqueness; constrained pairwise scenarios with an explicit coverage report.
- Negative cases with a valid original record, mutation category and every detected validation issue. Numeric boundary fixtures are available separately.
- Local CSV/JSON transformations: mapping, masking, removal, seeded replacement, date shifting and HMAC pseudonymization.
- JSON, JSONL, CSV, XML, YAML, XLSX and SQL exports, plus Playwright/Cypress fixtures, TypeScript interfaces and Java/REST Assured starter code.
- Resident datasets for PL, UK, DK, DE and US, including personal details and separate address fields, house/apartment selection and per-field copying.
- Fifteen starter templates, versioned local templates, backup/restore, run history, PL/EN controls and light/dark themes.

No account, backend, analytics, remote generation API or runtime CDN. After the first successful cache installation, generation and export work offline. Opening the application still requests its static assets from GitHub Pages.

## Start locally

Use Node.js 24 (minimum 22.12) and npm.

```sh
npm ci
npm run dev
```

Open the Vite URL with `/DataForge/`. For the actual offline build:

```sh
npm run build
npm run preview
```

The initial screen generates Danish CPR samples. Choose **Templates → Danish customer** for coherent birth date, encoded sex and CPR fields. Use **Import & transform** before choosing a DAR reference generator or the official CPR test-pool profile.

## Reproducible fixtures

Choose **Resident dataset** (`#/resident`) to generate residents with `streetName`, `houseNumber`, `floor`, `door`, `postalCode` and `postalDistrict` as individual columns. The details view follows an address-entry form and supports copying each field or the entire record. Houses have empty floor/door; apartments have both. Export includes the full dataset, even when previewing only the first 250 residents. Use **Customize resident schema** to edit, save or export the template.

PL includes a coherent PESEL and DK includes a coherent standard-profile CPR; UK uses ISO country code `GB` in exports. Other countries do not receive a fabricated national identifier. All addresses remain synthetic and are not verified against postal or population registries.

Keep the schema (including field IDs), seed, locale, reference date, engine/Faker version and ordered source records unchanged. Generation is invariant to batch size. Use the replay manifest to retain configuration, source versions and SHA-256 hashes; reference data itself is not included in the manifest. Keep your authorized source files separately.

Template saves retain schemas, not the current run settings. Run history retains settings but not generated rows. Imported JSON Schema validation is retained with the saved schema.

## Safety and Danish data

**For test environments only.** Checksum-valid synthetic identifiers may coincide with real identifiers. No generator confirms that a person, company, address or bank account exists. Phone numbers and synthetic postal addresses must never be used to contact anyone.

CPR standard mode checks structure, calendar date, century rules and encoded sex; it does **not** impose modulus 11 on every CPR number. Legacy modulus-11 and user-imported official-test-pool modes are explicit alternatives. A generated UUID is never presented as a verified DAR identifier. [Danish profiles and source contract](docs/DANISH_DATA.md) explains the distinction.

Masking and pseudonymization do not guarantee anonymity. Imported data remains in memory unless you explicitly save a reference pool. Schemas/history can contain constants you entered; do not put confidential values in reusable templates. Clear browser site data to remove stored templates, history, pools and preferences. Export backups first if you want to keep them.

CSV formula protection is enabled by default. Disabling it requires confirmation. XLSX exports store test payloads as text, never formula objects. SQL and generated source code are downloads only; the application never executes them.

## Checks and deployment

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
npm run benchmark
```

CI runs these checks against the production build. Playwright covers generation, replay, export, templates, negative cases, relations, imports, mobile layout, offline use and cancellation. The HTML report includes traces for failures and desktop/mobile screenshots.

The Pages workflow deploys `dist/` on successful changes to `master`. In a new fork, select **Settings → Pages → Build and deployment → Source: GitHub Actions** first. Changing the repository name requires updating Vite base and PWA paths. Hash routing avoids server-side route rewrites.

## Documentation

- [Schema, generators and transformations](docs/SCHEMAS.md)
- [Danish profiles and reference imports](docs/DANISH_DATA.md)
- [Architecture, limits and security](docs/ARCHITECTURE.md)
- [Benchmark method and results](docs/BENCHMARKS.md)
- [Implementation ledger](docs/IMPLEMENTATION.md)

The first release intentionally supports a bounded JSON Schema subset, a bounded in-memory worker and finite pairwise spaces. Unsupported constraints fail explicitly; the application does not silently claim full standards compliance. See the architecture document for exact limits and known tradeoffs.
Test data generator
