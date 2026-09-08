import { syntheticDanishAddress } from './addresses';
import { DomainError } from './errors';
import type { GeneratorContext, TextProvider } from './generators';
import { SeededRandom } from './random';
import type { DataRecord, DataSchema, FieldDefinition, Locale } from './types';

export const RESIDENT_COUNTRIES = [
  { locale: 'pl', code: 'PL', label: 'Polska / Poland' },
  { locale: 'en_GB', code: 'GB', label: 'UK / United Kingdom' },
  { locale: 'da', code: 'DK', label: 'Dania / Denmark' },
  { locale: 'de', code: 'DE', label: 'Niemcy / Germany' },
  { locale: 'en_US', code: 'US', label: 'USA / United States' },
] as const;
export type Housing = 'mixed' | 'house' | 'apartment';
const addressParts = [
  'streetName',
  'houseNumber',
  'floor',
  'door',
  'postalCode',
  'postalDistrict',
  'formattedAddress',
] as const;

/** Address components share a seeded record stream, even when fields are reordered. */
export function createResidentAddressGenerator(text: TextProvider) {
  let cached: { key: string; address: DataRecord } | undefined;
  return ({ config, field, index }: GeneratorContext) => {
    const locale = field.locale ?? config.locale;
    const housing = field.options?.housing ?? 'mixed';
    if (!['mixed', 'house', 'apartment'].includes(String(housing)))
      throw new DomainError('HOUSING', 'Choose mixed, house or apartment');
    const part = String(field.options?.part ?? 'streetName');
    if (!addressParts.some((value) => value === part))
      throw new DomainError('ADDRESS_PART', 'Choose a supported resident address component');
    const key = JSON.stringify([
      config.seed,
      config.schema.id,
      index,
      locale,
      housing,
      field.options?.group ?? 'home',
    ]);
    if (cached?.key !== key) {
      const random = new SeededRandom(key);
      const source =
        locale === 'da'
          ? syntheticDanishAddress(random)
          : text.address(locale, random.integer(0, 2147483647));
      const apartment = housing === 'apartment' || (housing === 'mixed' && random.next() < 0.6);
      const floor = apartment
        ? random.pick(locale === 'da' ? ['st', '1', '2', '3', '4'] : ['0', '1', '2', '3', '4'])
        : '';
      const door = apartment
        ? locale === 'da'
          ? random.pick(['tv', 'th', 'mf'])
          : String(random.integer(1, 40))
        : '';
      const streetName = String(source.streetName);
      const houseNumber = String(source.houseNumber);
      // Faker's GB locale can produce malformed inward codes. Build the standard
      // digit + two-letter suffix explicitly; this does not assert allocation.
      const britishArea =
        locale === 'en_GB'
          ? random.pick([
              ['SW1A', 'London'],
              ['M1', 'Manchester'],
              ['B1', 'Birmingham'],
              ['EH1', 'Edinburgh'],
              ['CF10', 'Cardiff'],
              ['BT1', 'Belfast'],
            ])
          : undefined;
      const inwardLetters = [...'ABDEFGHJLNPQRSTUWXYZ'];
      const postalCode = britishArea
        ? `${britishArea[0]} ${random.digits(1)}${random.pick(inwardLetters)}${random.pick(inwardLetters)}`
        : String(source.postalCode);
      const postalDistrict = britishArea
        ? britishArea[1]
        : String(source.postalDistrict ?? source.city);
      const streetLine = ['en_GB', 'en_US'].includes(locale)
        ? `${houseNumber} ${streetName}`
        : `${streetName} ${houseNumber}`;
      const unit = apartment
        ? locale === 'da'
          ? `, ${floor}. ${door}`
          : `, ${locale === 'pl' ? 'lok.' : locale === 'de' ? 'Whg.' : 'Apt'} ${door}`
        : '';
      cached = {
        key,
        address: {
          streetName,
          houseNumber,
          floor,
          door,
          postalCode,
          postalDistrict,
          formattedAddress: `${streetLine}${unit}, ${postalCode} ${postalDistrict}`,
        },
      };
    }
    return cached.address[part];
  };
}

export function createResidentSchema(locale: Locale, housing: Housing = 'mixed'): DataSchema {
  const country = RESIDENT_COUNTRIES.find((value) => value.locale === locale);
  if (!country) throw new DomainError('RESIDENT_LOCALE', 'Unsupported resident country');
  const field = (
    name: string,
    generator: string,
    options?: FieldDefinition['options'],
  ): FieldDefinition => ({
    id: name,
    name,
    generator,
    locale,
    required: true,
    ...(options ? { options } : {}),
  });
  const fields: FieldDefinition[] = [
    { ...field('id', 'uuid'), unique: true },
    field('sex', 'enum', { values: ['female', 'male'] }),
    field('firstName', 'firstName', { sexField: 'sex' }),
    field('lastName', 'lastName'),
    field('birthDate', 'birthDate'),
    { ...field('age', 'age'), rule: { operation: 'age', fields: ['birthDate'] } },
    { ...field('email', 'email'), rule: { operation: 'email', fields: ['firstName', 'lastName'] } },
    field('phone', 'phone'),
    field('country', 'constant', { value: country.code }),
    ...addressParts.map((part) => field(part, 'residentAddressPart', { part, housing })),
    field('provenance', 'constant', { value: 'synthetic' }),
    field('geographicConsistency', 'constant', { value: 'not-verified' }),
    field('registryVerified', 'constant', { value: false }),
  ];
  if (locale === 'pl' || locale === 'da')
    fields.splice(
      6,
      0,
      field(locale === 'pl' ? 'pesel' : 'cpr', locale === 'pl' ? 'pesel' : 'cpr', {
        birthDateField: 'birthDate',
        sexField: 'sex',
        profile: 'standard',
        formatted: locale === 'da',
      }),
    );
  return {
    id: `resident-${country.code.toLowerCase()}`,
    name: `${country.code === 'GB' ? 'UK' : country.code} resident with address`,
    version: 1,
    fields,
  };
}
