import { addDays, ageOn, randomDate, zonedTimestamp } from './dates';
import { DomainError } from './errors';
import { generateCpr, generateCvr, generatePNumber, decodeCpr } from './identifiers/denmark';
import { generateNip, generatePesel, generatePolishId, generateRegon } from './identifiers/poland';
import { generateIban, type IbanCountry } from './identifiers/banking';
import { referenceAddress, syntheticDanishAddress } from './addresses';
import type { SeededRandom } from './random';
import type { CprProfile, DataRecord, EncodedSex, FieldDefinition, GenerationConfig, JsonValue, Locale } from './types';

export interface TextProvider {
  firstName(locale: Locale, seed: number, sex?: EncodedSex): string;
  lastName(locale: Locale, seed: number): string;
  company(locale: Locale, seed: number): string;
  address(locale: Locale, seed: number): DataRecord;
}
export interface GeneratorContext {
  random: SeededRandom;
  row: DataRecord;
  index: number;
  config: GenerationConfig;
  field: FieldDefinition;
}
export interface GeneratorDefinition {
  id: string;
  label: string;
  category: 'General' | 'Personal' | 'Address' | 'Banking' | 'Poland' | 'Denmark' | 'Security';
  generate(context: GeneratorContext): JsonValue;
}
export const stringOption = (field: FieldDefinition, key: string, fallback = ''): string => typeof field.options?.[key] === 'string' ? String(field.options[key]) : fallback;
export const numberOption = (field: FieldDefinition, key: string, fallback: number): number => typeof field.options?.[key] === 'number' ? Number(field.options[key]) : fallback;
export function readPath(record: DataRecord, path: string): JsonValue | undefined {
  let current: JsonValue | undefined = record;
  for (const part of path.split('.')) {
    if (['__proto__', 'constructor', 'prototype'].includes(part)) return undefined;
    if (!current || typeof current !== 'object' || !Object.hasOwn(current, part)) return undefined;
    current = (current as DataRecord)[part];
  }
  return current;
}
const contextDate = ({ field, row, random }: GeneratorContext): string => {
  const linked = stringOption(field, 'birthDateField');
  if (linked) {
    const value = readPath(row, linked);
    if (typeof value !== 'string') throw new DomainError('BIRTH_DATE_REQUIRED', 'Linked birth date is missing', linked);
    return value;
  }
  return stringOption(field, 'birthDate') || randomDate(random, stringOption(field, 'minDate', '1950-01-01'), stringOption(field, 'maxDate', '2005-12-31'));
};
const contextSex = ({ field, row, random }: GeneratorContext): EncodedSex => {
  const linked = stringOption(field, 'sexField');
  const sex = linked ? readPath(row, linked) : field.options?.sex;
  if (sex !== undefined && sex !== 'male' && sex !== 'female') throw new DomainError('ENCODED_SEX', 'Expected male or female for the identifier');
  return sex === 'male' || sex === 'female' ? sex : random.pick(['male', 'female']);
};
export const SECURITY_SAMPLES = {
  html: '<script>alert("test")</script>',
  sql: "' OR '1'='1' --",
  path: '../../example.txt',
  crlf: 'test\r\nX-Test: value',
  csv: '=1+1',
  unicode: 'Zażółć gęślą jaźń · ÆØÅ æøå · e\u0301 · 中文',
};

export function createGeneratorRegistry(text: TextProvider): Map<string, GeneratorDefinition> {
  const definitions: GeneratorDefinition[] = [];
  const add = (id: string, label: string, category: GeneratorDefinition['category'], generate: GeneratorDefinition['generate']) => definitions.push({ id, label, category, generate });
  const locale = (c: GeneratorContext) => c.field.locale ?? c.config.locale;
  const textSeed = (c: GeneratorContext) => c.random.integer(0, 2147483647);
  add('uuid', 'UUID', 'General', c => c.random.uuid());
  add('integer', 'Integer', 'General', c => c.random.integer(numberOption(c.field, 'min', 0), numberOption(c.field, 'max', 1000)));
  add('decimal', 'Decimal', 'General', c => {
    const precision = numberOption(c.field, 'precision', 2);
    if (!Number.isInteger(precision) || precision < 0 || precision > 6) throw new DomainError('PRECISION', 'Precision must be 0–6');
    const factor = 10 ** precision;
    return c.random.integer(Math.ceil(numberOption(c.field, 'min', 0) * factor), Math.floor(numberOption(c.field, 'max', 1000) * factor)) / factor;
  });
  add('boolean', 'Boolean', 'General', c => {
    const rate = numberOption(c.field, 'trueRate', 0.5);
    if (!Number.isFinite(rate) || rate < 0 || rate > 1) throw new DomainError('BOOLEAN_RATE', 'trueRate must be between 0 and 1');
    return c.random.next() < rate;
  });
  add('constant', 'Constant', 'General', c => c.field.options?.value ?? null);
  add('sequence', 'Sequence', 'General', c => numberOption(c.field, 'start', 1) + c.index * numberOption(c.field, 'step', 1));
  add('enum', 'Weighted dictionary', 'General', c => {
    const values = c.field.options?.values;
    if (!Array.isArray(values) || !values.length) throw new DomainError('ENUM_VALUES', 'Provide a non-empty values array');
    const excluded = c.field.options?.excluded;
    const candidates = values.map((value, i) => ({ value, weight: Array.isArray(c.field.options?.weights) ? Number(c.field.options.weights[i]) : 1 }))
      .filter(entry => !Array.isArray(excluded) || !excluded.some(value => JSON.stringify(value) === JSON.stringify(entry.value)));
    if (candidates.some(entry => !Number.isFinite(entry.weight) || entry.weight < 0)) throw new DomainError('WEIGHTS', 'Weights must be finite and non-negative');
    const total = candidates.reduce((sum, entry) => sum + entry.weight, 0);
    if (!total) throw new DomainError('EMPTY_POOL', 'No positive-weight candidates remain');
    let remaining = c.random.next() * total;
    return candidates.find(entry => (remaining -= entry.weight) < 0)!.value;
  });
  add('text', 'Text', 'General', c => {
    const alphabet = [...stringOption(c.field, 'alphabet', 'abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')];
    const length = c.random.integer(numberOption(c.field, 'minLength', 12), numberOption(c.field, 'maxLength', 24));
    if (length > 100_000) throw new DomainError('TEXT_LIMIT', 'Text limit is 100000 characters');
    return stringOption(c.field, 'prefix') + Array.from({ length }, () => c.random.pick(alphabet)).join('') + stringOption(c.field, 'suffix');
  });
  add('firstName', 'First name', 'Personal', c => text.firstName(locale(c), textSeed(c), contextSex(c)));
  add('lastName', 'Last name', 'Personal', c => text.lastName(locale(c), textSeed(c)));
  add('fullName', 'Full name', 'Personal', c => `${text.firstName(locale(c), textSeed(c), contextSex(c))} ${text.lastName(locale(c), textSeed(c))}`);
  add('username', 'Username', 'Personal', c => `tester_${c.random.digits(8)}`);
  add('email', 'Email', 'Personal', c => `tester.${c.random.digits(10)}@example.com`);
  add('company', 'Company', 'Personal', c => text.company(locale(c), textSeed(c)));
  add('phone', 'Phone (synthetic)', 'Personal', c => {
    const formats = { pl: ['+48', 9], da: ['+45', 8], de: ['+49', 10], en_GB: ['+44', 10], en_US: ['+1', 10] } as const;
    const [prefix, length] = formats[locale(c)];
    return (c.field.options?.international === false ? '' : prefix) + c.random.integer(2, 9) + c.random.digits(length - 1);
  });
  add('date', 'Date', 'General', c => randomDate(c.random, stringOption(c.field, 'min', '2020-01-01'), stringOption(c.field, 'max', c.config.referenceDate)));
  add('birthDate', 'Birth date', 'Personal', contextDate);
  add('time', 'Time', 'General', c => `${String(c.random.integer(0, 23)).padStart(2, '0')}:${String(c.random.integer(0, 59)).padStart(2, '0')}:${String(c.random.integer(0, 59)).padStart(2, '0')}`);
  add('timestamp', 'Timestamp', 'General', c => {
    const date = new Date(`${randomDate(c.random, stringOption(c.field, 'min', '2020-01-01'), stringOption(c.field, 'max', c.config.referenceDate))}T12:00:00.000Z`);
    const zone = stringOption(c.field, 'timeZone', 'UTC');
    return zonedTimestamp(date, zone);
  });
  add('age', 'Age', 'Personal', c => ageOn(contextDate(c), c.config.referenceDate));
  add('currency', 'Currency', 'Banking', c => ({ pl: 'PLN', da: 'DKK', de: 'EUR', en_GB: 'GBP', en_US: 'USD' })[locale(c)]);
  add('amount', 'Amount in minor units', 'Banking', c => c.random.integer(numberOption(c.field, 'min', 0), numberOption(c.field, 'max', 100000)));
  add('iban', 'IBAN', 'Banking', c => generateIban(c.random, stringOption(c.field, 'country', ({ pl: 'PL', da: 'DK', de: 'DE', en_GB: 'GB', en_US: 'US' })[locale(c)]) as IbanCountry));
  add('nrb', 'NRB', 'Poland', c => generateIban(c.random, 'PL').slice(2));
  add('testCard', 'Stripe test card', 'Banking', c => c.random.pick(['4242424242424242', '4000056655665556', '5555555555554444']));
  add('url', 'Example URL', 'General', c => `https://example.com/test/${c.random.digits(6)}`);
  add('ipv4', 'IPv4 (documentation range)', 'General', c => `192.0.2.${c.random.integer(1, 254)}`);
  add('ipv6', 'IPv6 (documentation range)', 'General', c => `2001:db8::${c.random.integer(1, 65535).toString(16)}`);
  add('address', 'Synthetic address', 'Address', c => locale(c) === 'da' ? syntheticDanishAddress(c.random) : text.address(locale(c), textSeed(c)));
  add('pesel', 'PESEL', 'Poland', c => generatePesel(c.random, contextDate(c), contextSex(c)));
  add('nip', 'NIP', 'Poland', c => generateNip(c.random));
  add('regon', 'REGON', 'Poland', c => {
    const length = numberOption(c.field, 'length', 9);
    if (length !== 9 && length !== 14) throw new DomainError('REGON_LENGTH', 'REGON length must be 9 or 14');
    return generateRegon(c.random, length);
  });
  add('polishId', 'Polish identity document', 'Poland', c => generatePolishId(c.random));
  add('cpr', 'CPR', 'Denmark', c => {
    const profile = stringOption(c.field, 'profile', 'standard') as CprProfile;
    if (!['standard', 'legacy-mod11', 'official-test-pool'].includes(profile)) throw new DomainError('CPR_PROFILE', 'Unknown CPR profile');
    const sourceId = stringOption(c.field, 'sourceId');
    const pools = c.config.pools?.filter(pool => pool.kind === 'cpr' && (!sourceId || pool.source.id === sourceId)) ?? [];
    const values = pools.flatMap(pool => pool.records.map(record => String(record.cpr)));
    if (profile === 'official-test-pool' && !stringOption(c.field, 'birthDate') && !stringOption(c.field, 'birthDateField')) {
      const sex = stringOption(c.field, 'sexField') ? readPath(c.row, stringOption(c.field, 'sexField')) : c.field.options?.sex;
      const candidates = values.filter(value => !sex || decodeCpr(value).sex === sex);
      const chosen = c.random.pick(candidates).replace('-', '');
      return c.field.options?.formatted ? `${chosen.slice(0, 6)}-${chosen.slice(6)}` : chosen;
    }
    return generateCpr(c.random, contextDate(c), contextSex(c), profile, Boolean(c.field.options?.formatted), values);
  });
  add('cvr', 'CVR', 'Denmark', c => generateCvr(c.random));
  add('pNumber', 'P-nummer (syntax)', 'Denmark', c => generatePNumber(c.random));
  add('vatDk', 'Danish VAT', 'Denmark', c => 'DK' + generateCvr(c.random));
  add('bankDk', 'Danish account components', 'Denmark', c => {
    const iban = generateIban(c.random, 'DK');
    return { registrationNumber: iban.slice(4, 8), accountNumber: iban.slice(8), iban, provenance: 'synthetic', registryVerified: false };
  });
  add('addressDk', 'Danish synthetic address', 'Denmark', c => syntheticDanishAddress(c.random));
  add('dar', 'DAR reference address', 'Denmark', c => referenceAddress(c.random, c.config.pools ?? [], stringOption(c.field, 'sourceId')));
  add('security', 'Security test string', 'Security', c => {
    const category = stringOption(c.field, 'category', 'unicode');
    if (category === 'long') {
      const length = numberOption(c.field, 'length', 10000);
      if (!Number.isInteger(length) || length < 0 || length > 100000) throw new DomainError('TEXT_LIMIT', 'Security samples are limited to 100000 characters');
      return 'A'.repeat(length);
    }
    if (!(category in SECURITY_SAMPLES)) throw new DomainError('SECURITY_CATEGORY', 'Unknown security sample');
    return SECURITY_SAMPLES[category as keyof typeof SECURITY_SAMPLES];
  });
  return new Map(definitions.map(definition => [definition.id, definition]));
}

export function applyRule(c: GeneratorContext): JsonValue {
  const rule = c.field.rule!;
  const values = (rule.fields ?? []).map(path => {
    const value = readPath(c.row, path);
    if (value === undefined) throw new DomainError('DEPENDENCY_VALUE', 'Dependency has no value', path);
    return value;
  });
  switch (rule.operation) {
    case 'copy': return values[0];
    case 'email': return values.map(value => String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/[^a-zA-Z0-9]/g, '').toLowerCase()).join('.') + '@example.com';
    case 'age': return ageOn(String(values[0]), c.config.referenceDate);
    case 'addDays': return addDays(String(values[0]), Number(rule.value ?? 1));
    case 'multiply': {
      const result = Number(values[0]) * Number(rule.value ?? 1);
      if (!Number.isFinite(result)) throw new DomainError('RULE_NUMBER', 'Multiplication requires finite numbers');
      return Math.round(result * 100) / 100;
    }
    case 'template': return String(rule.value ?? '').replace(/\{(\d+)\}/g, (_, index: string) => String(values[Number(index)] ?? ''));
    case 'foreignKey': {
      const rows = c.config.datasets?.[rule.dataset ?? ''];
      if (!rows?.length) throw new DomainError('FOREIGN_POOL', 'Referenced dataset is missing or empty');
      const value = readPath(c.random.pick(rows), rule.targetField ?? 'id');
      if (value === undefined || value === null) throw new DomainError('FOREIGN_KEY', 'Referenced key is absent');
      return value;
    }
    default: throw new DomainError('RULE_OPERATION', 'Unknown rule operation');
  }
}
