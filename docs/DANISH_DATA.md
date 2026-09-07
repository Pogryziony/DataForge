# Danish data profiles

DataForge distinguishes local syntax/checksum validation, user-imported source data and registry verification. The last category is **not implemented**. All output carries or is accompanied by `registryVerified: false`.

## CPR

CPR is a string, never a number. `formatted: true` produces `DDMMYY-XXXX`; otherwise the ten digits are returned. Leading zeros are preserved.

| Profile | Behavior |
| --- | --- |
| `standard` | Valid date, supported century/serial rules and encoded sex; no mandatory modulus 11 |
| `legacy-mod11` | The same structure plus the legacy modulus-11 check; fails if no candidate fits |
| `official-test-pool` | Selects only from a locally imported, documented pool; never synthesizes an “official” number |

The century rules support birth dates from 1858 to 2057. The seventh digit disambiguates the century: 0–3 means 1900–1999; 4/9 means 2000–2036 for years 00–36 and 1937–1999 otherwise; 5–8 means 2000–2057 for years 00–57 and 1858–1899 otherwise. The last digit is odd for encoded male and even for encoded female. This is the identifier's encoding, not a model of gender identity.

Sources: [CPR structure](https://www.cpr.dk/cpr-systemet/opbygning-af-cpr-nummeret), [official person-number specification](https://www.cpr.dk/media/12066/personnummeret-i-cpr.pdf), [CPR numbers without modulus-11 check digits](https://www.cpr.dk/cpr-systemet/personnumre-uden-kontrolciffer-modulus-11-kontrol).

No national test list is bundled or fetched automatically. Obtain a source appropriate for your test system, for example the [MedCom national test CPR documentation](https://medcom.dk/standarder/tabeller/nationale-test-cpr-numre/), and check its current usage conditions. DataForge validates imported structure and metadata, not the source's authenticity or current designation. A pool entry is not permission to use an identifier outside its designated test system.

## Companies and banking

CVR uses eight-digit strings and a modulus-11 profile. VAT prefixes that value with `DK`. P-numbers use ten-digit **syntax only**: no invented checksum, no claim of allocation and no registry-backed CVR/P-number relationship. Templates can associate generated units with a generated company for testing, not establish an official connection. The [CVR index catalogue](https://erhvervsstyrelsen.dk/vejledning-cvr-indeks-data-katalog) documents the registry entities.

DK IBAN has 18 characters: `DK`, two check digits, a four-digit registration number and a ten-digit account component. DataForge checks IBAN mod97 and lengths. It does not verify the bank, account allocation, national account check rules or routability. Country formats follow the [SWIFT IBAN registry](https://www.swift.com/resource/iban-registry-pdf). PL, DE and GB are also supported; US IBAN is explicitly unsupported.

## Synthetic addresses vs DAR

`addressDk` generates deliberately synthetic streets, house/floor/door components and UUIDs. Realistic postal district examples are not a real address lookup. Municipality/road codes and coordinates remain null rather than being fabricated as official data.

`dar` requires an imported snapshot. It preserves the supplied `adresseId`, `husnummerId` and `navngivenvejId`, postal codes and administrative fields. Address entities are related but are not interchangeable IDs. See [DAR](https://danmarksadresser.dk/om-adresser/danmarks-adresseregister-dar) and [address standards](https://danmarksadresser.dk/adressedata/standarder-for-adresser).

Normalized DAR records must have these string fields:

| Field | Contract |
| --- | --- |
| `adresseId`, `husnummerId`, `navngivenvejId` | Original UUID strings from the source |
| `streetName`, `houseNumber` | Non-empty source text |
| `postalCode`, `municipalityCode`, `roadCode` | Four-digit strings, including leading zeros |
| `postalDistrict` | Non-empty source text |
| `floor`, `door`, `supplementaryTown` | Optional text; keep source meaning |
| `coordinates`, `coordinateReferenceSystem` | Optional; coordinates require an explicit source CRS |

Duplicate address IDs, inconsistent house-to-road relations and conflicting named-road street names are rejected. Structural checks do not establish register authenticity. Coordinates are preserved, not transformed or geocoded.

## Importing a reference pool

The JSON envelope is `{ "kind": "dar" | "cpr", "source": {...}, "records": [...] }`. CPR records require a `cpr` string; DAR records use the contract above. The source object requires all of:

```json
{
  "id": "your-snapshot-id",
  "title": "Your source title",
  "url": "https://your-source.example/documentation",
  "retrievedAt": "2026-09-07T12:00:00Z",
  "version": "your-snapshot-version",
  "license": "Actual license or authorized usage conditions"
}
```

This metadata example is not a real reference source. Do not use arbitrary production personal data to construct a test pool.

1. Import a normalized envelope using **Reference pool JSON**; or import CSV/JSON records, map original column names to the normalized names, and expand **Create a reference pool from mapped records**.
2. Supply actual provenance and usage conditions. For nested source files, normalize the shape before import; the UI maps top-level columns only.
3. Leave **Save this reference pool on this device** unchecked for session-only use.
4. Select `dar` or CPR `official-test-pool`. Optional generator option `sourceId` chooses one loaded source explicitly.
5. Retain the original authorized snapshot with the manifest. Record order affects seeded selection; hashes detect changes.

There is no background refresh, production API call, license inference, online CPR verification or redistribution of source datasets in this repository.
