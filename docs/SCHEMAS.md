# Schemas and fixtures

The UI exports the same `DataSchema` contract used by the generation engine. Stable field IDs control random streams; changing a field's ID changes its generated values. Names must be unique identifier-style names (`customerId`, not `customer-id`). Dangerous object keys are rejected.

## A coherent Danish person

Import this as a configuration in Schema designer:

```json
{
  "id": "danish-person-example",
  "name": "Danish person",
  "version": 1,
  "fields": [
    { "id": "id", "name": "id", "generator": "uuid", "unique": true },
    {
      "id": "birth",
      "name": "birthDate",
      "generator": "birthDate",
      "options": { "minDate": "1980-01-01", "maxDate": "2000-12-31" }
    },
    {
      "id": "sex",
      "name": "sex",
      "generator": "enum",
      "options": { "values": ["female", "male"] }
    },
    {
      "id": "cpr",
      "name": "cpr",
      "generator": "cpr",
      "options": {
        "birthDateField": "birthDate",
        "sexField": "sex",
        "profile": "standard",
        "formatted": true
      }
    },
    {
      "id": "age",
      "name": "age",
      "generator": "integer",
      "rule": { "operation": "age", "fields": ["birthDate"] }
    }
  ]
}
```

Dependencies are evaluated in topological order, independent of display order. Cycles and missing dependencies fail before generation. Paths in a rule refer to its containing object, with dot notation for child values.

## Common options

Resident templates for PL, UK, DK, DE and US use the `residentAddressPart` generator with `options.part` (`streetName`, `houseNumber`, `floor`, `door`, `postalCode`, `postalDistrict`, `formattedAddress`) and `options.housing` (`mixed`, `house`, `apartment`). Components in the same schema/row/locale/housing and optional `group` share an address stream, independent of display order. Keep those settings identical across the component fields. Use a different group for a second address. The default part is streetName.

Country-specific templates fix field locales so changing the run locale does not mix nationalities, telephone prefixes and addresses. UK fixture postcodes are built with an outward code and a digit/two-letter inward code, following the structure described by [ONS](https://www.ons.gov.uk/methodology/geography/ukgeographies/postalgeography) and the [NHS data dictionary](https://v2.datadictionary.nhs.uk/data_dictionary/data_field_notes/p/postcode_de.asp%40shownav%3D0.html). Geographic allocation, deliverability and postcode/street matching are not verified. The exported `geographicConsistency` and `registryVerified` fields make that limitation explicit. Existing general-purpose address generators remain unchanged.

| Generator                          | Options                                                                                                          |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `integer`, `amount`                | `min`, `max`; amount is integer minor currency units                                                             |
| `decimal`                          | `min`, `max`, `precision` (0–6)                                                                                  |
| `boolean`                          | `trueRate` (0–1)                                                                                                 |
| `sequence`                         | `start`, `step`                                                                                                  |
| `constant`                         | `value`, any JSON value                                                                                          |
| `enum`                             | `values`, optional matching `weights`, `excluded`                                                                |
| `text`                             | `minLength`, `maxLength`, Unicode `alphabet`, `prefix`, `suffix`; lengths exclude prefix/suffix                  |
| `birthDate`, `pesel`, `cpr`, `age` | `birthDate` or `birthDateField`; alternatively `minDate`, `maxDate`; identifiers also accept `sex` or `sexField` |
| `date`, `timestamp`                | ISO date `min`, `max`; timestamp accepts IANA `timeZone` (default UTC)                                           |
| `phone`                            | `international` (default true); synthetic national lengths, not dialability validation                           |
| `iban`                             | `country`: PL, DK, DE or GB                                                                                      |
| `regon`                            | `length`: 9 or 14                                                                                                |
| `cpr`                              | `profile`, `formatted`, `sourceId`                                                                               |
| `dar`                              | `sourceId`                                                                                                       |
| `security`                         | `category`: html, sql, path, crlf, csv, unicode or long; `length` for long                                       |

Also available: `uuid`, `firstName`, `lastName`, `fullName`, `username`, `email`, `company`, `time`, `currency`, `nrb`, `testCard`, `url`, `ipv4`, `ipv6`, `address`, `nip`, `polishId`, `cvr`, `pNumber`, `vatDk`, `bankDk`, `addressDk`. Faker text supports pl, da, de, en_GB and en_US; a field's `locale` overrides the run locale. Email/URL fixtures use example domains; IPs use documentation ranges. `testCard` uses three published [Stripe test cards](https://docs.stripe.com/testing), for Stripe test mode only.

Field flags: `required` defaults true; `unique` enforces generated non-null/non-empty values with bounded retries. `nullRate`, `emptyRate` and `missingRate` are mutually exclusive probability slices whose sum cannot exceed 1. Required fields cannot have missingRate. They are probabilities, not guaranteed counts. Negative-case share, in contrast, uses exactly `floor(count × rate)` mutations.

An `object` has `fields`; an `array` has `item` (a field definition) and `options.minItems/maxItems`. Advanced JSON editing exposes nesting. `condition: { "field": "customerType", "equals": "company" }` conditionally includes a field.

## Declarative rules

No JavaScript, eval, SQL or arbitrary expressions are executed. `rule.operation` supports `copy`, `email`, `age`, `addDays`, `multiply`, `template`, `foreignKey`. Input values are named by `fields`. `addDays` and `multiply` use numeric `value`. Templates use `{0}`, `{1}` placeholders, for example `"value": "customer-{0}"`.

For datasets, each definition has `name`, `count`, `schema`, optional `primaryKey` (default id) and `uniqueTogether` (arrays of top-level field names). A foreign key uses `{ "operation": "foreignKey", "dataset": "customers", "targetField": "id" }`. Parents are generated first. Join datasets can use two foreign keys plus `uniqueTogether: [["customerId", "productId"]]`. Collisions are retried, up to 1000 attempts per row. Generated child counts are global counts, not a guaranteed number per parent.

Pairwise accepts finite `parameters`, optional `forbidden` partial combinations and `maxRows`. Coverage is computed from allowed complete combinations; the UI reports incomplete coverage if the row limit truncates the result. It is a deterministic greedy cover, not necessarily minimal.

## JSON Schema import

Only Draft 2020-12, root objects, explicit single types, properties/required, homogeneous arrays, enum/const, numeric and length bounds, supported formats, local non-recursive `$ref` and bounded anchored ASCII patterns are accepted. Examples: `^[A-Z]{5}$`, `^[0-9]{2,8}$`. Number generation uses at most two decimal places for imported schemas.

Unsupported keywords (including oneOf/anyOf/allOf, conditional schemas, dependent schemas, patternProperties and uniqueItems), arbitrary regexes, remote refs and recursion are rejected with diagnostics. An explicit generator can be selected with `x-testforge-generator`, `x-testforge-options` and `x-testforge-locale` (compatibility names from the brief). Ajv independently validates every normal generated record against the original schema. The original is stored as `validationSchema` and survives template save/export. Remove it explicitly only if you intentionally abandon those constraints.

## Import transformations

CSV imports preserve every cell as text, including `0001`. Column mapping is a JSON object from original top-level column names to target names; an empty target omits a column.

```json
[
  { "field": "email", "operation": "generate", "generator": "email" },
  { "field": "customerId", "operation": "pseudonymize", "domain": "customer" },
  { "field": "phone", "operation": "mask", "keepLast": 2 },
  { "field": "note", "operation": "remove" },
  { "field": "birthDate", "operation": "shiftDate", "value": 7 }
]
```

`replace` sets a constant `value`; `generate` uses the run seed/locale/reference date and generator options. HMAC pseudonymization requires a private key of at least 16 characters. Use the same key and domain across parent/child identifiers to preserve equality; the key is not saved. Masking does not preserve uniqueness. Rules act in order and on existing top-level fields only. `trim`, `uppercase` and `lowercase` are also available.

Nested CSV/XLSX/SQL values are JSON strings. XML uses typed `value` nodes and rejects unsupported control characters. SQL exports INSERT statements, not table definitions or connections. Code downloads are starter fixtures inferred from actual output, not a full schema-to-language compiler; review them in your project.
