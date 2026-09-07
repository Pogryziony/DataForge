import { DomainError } from './errors';
import type { SeededRandom } from './random';
import type { DataRecord, ReferencePool } from './types';
import { validateCpr } from './identifiers/denmark';

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
export function syntheticDanishAddress(random: SeededRandom): DataRecord {
  const [postalCode, postalDistrict] = random.pick([
    ['2100', 'København Ø'],
    ['8000', 'Aarhus C'],
    ['5000', 'Odense C'],
    ['9000', 'Aalborg'],
  ]);
  const streetName = random.pick(['Testvej', 'Prøvevej', 'Eksempelgade', 'Øvelsesvej']);
  const houseNumber = String(random.integer(1, 199)) + random.pick(['', '', 'A', 'B']);
  const floor = random.pick(['', 'st', '1', '2', '3']);
  const door = floor ? random.pick(['tv', 'th', 'mf']) : '';
  return {
    adresseId: random.uuid(),
    husnummerId: random.uuid(),
    navngivenvejId: random.uuid(),
    streetName,
    houseNumber,
    floor,
    door,
    supplementaryTown: '',
    postalCode,
    postalDistrict,
    municipalityCode: null,
    roadCode: null,
    coordinates: null,
    coordinateReferenceSystem: null,
    country: 'DK',
    formatted: `${streetName} ${houseNumber}${floor ? `, ${floor}. ${door}` : ''}, ${postalCode} ${postalDistrict}`,
    provenance: 'synthetic',
    registryVerified: false,
  };
}

/** Validates the normalized import contract, never contacts a registry. */
export function validateReferencePool(pool: ReferencePool): void {
  if (
    !pool ||
    !['cpr', 'dar'].includes(pool.kind) ||
    !Array.isArray(pool.records) ||
    !pool.records.length
  ) {
    throw new DomainError('REFERENCE_FORMAT', 'Expected a non-empty CPR or DAR reference pool');
  }
  for (const key of ['id', 'title', 'url', 'retrievedAt', 'version', 'license'] as const) {
    if (typeof pool.source?.[key] !== 'string' || !pool.source[key].trim())
      throw new DomainError('SOURCE_METADATA', `Missing source ${key}`);
  }
  if (!Number.isFinite(Date.parse(pool.source.retrievedAt)))
    throw new DomainError('SOURCE_DATE', 'Source retrieval date is invalid');
  if (pool.records.length > 100_000)
    throw new DomainError('REFERENCE_LIMIT', 'Reference pools are limited to 100000 records');
  const identifiers = new Set<string>();
  const houses = new Map<string, string>();
  const roads = new Map<string, string>();
  pool.records.forEach((record, index) => {
    const fail = (message: string) => {
      throw new DomainError('REFERENCE_RECORD', message, String(index));
    };
    if (!record || typeof record !== 'object' || Array.isArray(record)) fail('Expected an object');
    if (pool.kind === 'cpr') {
      if (typeof record.cpr !== 'string' || !validateCpr(record.cpr)) fail('Invalid CPR structure');
      const key = String(record.cpr).replace('-', '');
      if (identifiers.has(key)) fail('Duplicate CPR');
      identifiers.add(key);
    } else {
      for (const key of ['adresseId', 'husnummerId', 'navngivenvejId'])
        if (typeof record[key] !== 'string' || !UUID.test(String(record[key])))
          fail(`Invalid ${key}`);
      for (const key of [
        'streetName',
        'houseNumber',
        'postalCode',
        'postalDistrict',
        'municipalityCode',
        'roadCode',
      ])
        if (typeof record[key] !== 'string' || !String(record[key]).trim())
          fail(`Missing text field ${key}`);
      if (
        !/^\d{4}$/.test(String(record.postalCode)) ||
        !/^\d{4}$/.test(String(record.municipalityCode)) ||
        !/^\d{4}$/.test(String(record.roadCode))
      )
        fail('Postal, municipality and road codes must be four-digit strings');
      if (identifiers.has(String(record.adresseId))) fail('Duplicate adresseId');
      identifiers.add(String(record.adresseId));
      const houseFingerprint = JSON.stringify([
        record.navngivenvejId,
        record.houseNumber,
        record.postalCode,
        record.postalDistrict,
        record.municipalityCode,
        record.roadCode,
      ]);
      const previousHouse = houses.get(String(record.husnummerId));
      if (previousHouse && previousHouse !== houseFingerprint)
        fail('Conflicting Husnummer relationship');
      houses.set(String(record.husnummerId), houseFingerprint);
      const previousRoad = roads.get(String(record.navngivenvejId));
      if (previousRoad && previousRoad !== record.streetName)
        fail('Conflicting Navngivenvej street name');
      roads.set(String(record.navngivenvejId), String(record.streetName));
      if (record.coordinates != null && !record.coordinateReferenceSystem)
        fail('Coordinates require an explicit CRS');
    }
  });
}

export function referenceAddress(
  random: SeededRandom,
  pools: ReferencePool[],
  sourceId?: string,
): DataRecord {
  const pool = pools.find(
    (candidate) => candidate.kind === 'dar' && (!sourceId || candidate.source.id === sourceId),
  );
  if (!pool)
    throw new DomainError(
      'DAR_POOL_REQUIRED',
      'Import a DAR reference pool before generating reference addresses',
    );
  return {
    ...random.pick(pool.records),
    provenance: 'user-imported-reference',
    sourceId: pool.source.id,
    sourceVersion: pool.source.version,
    registryVerified: false,
  };
}
