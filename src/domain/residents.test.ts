import { beforeAll, expect, it } from 'vitest';
import { createResidentSchema, RESIDENT_COUNTRIES } from './residents';
import { GenerationSession, validateRecord } from './engine';
import { createGeneratorRegistry, type GeneratorDefinition } from './generators';
import { loadTextProvider } from '../infrastructure/faker';
import { decodeCpr } from './identifiers/denmark';
import { decodePesel } from './identifiers/poland';
import { exportRecords } from '../infrastructure/exports';
import { importRecords } from '../infrastructure/imports';

let registry: Map<string, GeneratorDefinition>;
beforeAll(async () => {
  registry = createGeneratorRegistry(
    await loadTextProvider(RESIDENT_COUNTRIES.map((country) => country.locale)),
  );
});
it.each(RESIDENT_COUNTRIES)(
  'creates coherent, replayable $code residents with flat address columns',
  async ({ locale, code }) => {
    const config = {
      seed: 'residents-v1',
      referenceDate: '2026-09-08',
      locale,
      count: 20,
      schema: createResidentSchema(locale, 'apartment'),
    };
    const rows = new GenerationSession(config, registry).nextBatch(20);
    const replay = new GenerationSession(config, registry);
    expect([...replay.nextBatch(7), ...replay.nextBatch(13)]).toEqual(rows);
    for (const row of rows) {
      expect(validateRecord(row, config)).toEqual([]);
      expect(row.country).toBe(code);
      for (const part of [
        'firstName',
        'lastName',
        'streetName',
        'houseNumber',
        'floor',
        'door',
        'postalCode',
        'postalDistrict',
      ])
        expect(typeof row[part] === 'string' && row[part].length > 0, part).toBe(true);
      expect(row.formattedAddress).toContain(row.streetName);
      expect(row.formattedAddress).toContain(row.postalDistrict);
      expect(row.registryVerified).toBe(false);
      if (code === 'PL' || code === 'DK') {
        const decoded = code === 'PL' ? decodePesel(String(row.pesel)) : decodeCpr(String(row.cpr));
        expect(decoded.birthDate).toBe(row.birthDate);
        expect(decoded.sex).toBe(row.sex);
      } else {
        expect(row).not.toHaveProperty('pesel');
        expect(row).not.toHaveProperty('cpr');
      }
      const patterns = {
        PL: /^\d{2}-\d{3}$/,
        DK: /^\d{4}$/,
        DE: /^\d{5}$/,
        GB: /^[A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2}$/,
        US: /^\d{5}(-\d{4})?$/,
      };
      expect(row.postalCode).toMatch(patterns[code]);
    }
    const exported = importRecords(String((await exportRecords(rows, 'csv')).contents), 'csv');
    expect(exported[0].streetName).toBe(rows[0].streetName);
    expect(exported[0].postalCode).toBe(rows[0].postalCode);
  },
);
it('keeps country fixed in templates and leaves unit fields empty for houses', () => {
  const config = {
    seed: 'house',
    referenceDate: '2026-09-08',
    locale: 'en_US' as const,
    count: 2,
    schema: createResidentSchema('da', 'house'),
  };
  const rows = new GenerationSession(config, registry).nextBatch(2);
  expect(rows[0]).toMatchObject({ country: 'DK', floor: '', door: '' });
  expect(rows[0].phone).toMatch(/^\+45\d{8}$/);
  const reordered = {
    ...config,
    schema: { ...config.schema, fields: [...config.schema.fields].reverse() },
  };
  expect(new GenerationSession(reordered, registry).nextBatch(2)).toEqual(rows);
});
