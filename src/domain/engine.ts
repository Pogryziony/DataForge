import { parseDate } from './dates';
import { DomainError, issue, type ValidationIssue } from './errors';
import {
  applyRule,
  numberOption,
  readPath,
  stringOption,
  type GeneratorContext,
  type GeneratorDefinition,
} from './generators';
import { SeededRandom } from './random';
import { validateReferencePool } from './addresses';
import { decodeCpr, validateCpr, validateCvr, validatePNumber } from './identifiers/denmark';
import {
  decodePesel,
  validateNip,
  validatePesel,
  validatePolishId,
  validateRegon,
} from './identifiers/poland';
import { validateIban } from './identifiers/banking';
import type {
  CprProfile,
  DataRecord,
  FieldDefinition,
  GenerationConfig,
  GenerationManifest,
  JsonValue,
} from './types';

export const ENGINE_VERSION = 'dataforge-1.0.0';
const safeName = /^(?!__proto__$|constructor$|prototype$)[A-Za-z_][A-Za-z0-9_]*$/;

export function orderFields(fields: FieldDefinition[]): FieldDefinition[] {
  const indexed = new Map(fields.map((field) => [field.name, field]));
  const done = new Set<string>(),
    active = new Set<string>(),
    ordered: FieldDefinition[] = [];
  function visit(field: FieldDefinition) {
    if (done.has(field.name)) return;
    if (active.has(field.name))
      throw new DomainError('DEPENDENCY_CYCLE', 'Cyclic field dependencies', field.name);
    active.add(field.name);
    const dependencies = [
      ...(field.rule?.fields ?? []),
      ...(field.condition ? [field.condition.field] : []),
      stringOption(field, 'birthDateField'),
      stringOption(field, 'sexField'),
    ].filter(Boolean);
    for (const path of dependencies) {
      const dependency = indexed.get(path.split('.')[0]);
      if (!dependency)
        throw new DomainError('MISSING_DEPENDENCY', 'Referenced field is not in this object', path);
      visit(dependency);
    }
    active.delete(field.name);
    done.add(field.name);
    ordered.push(field);
  }
  fields.forEach(visit);
  return ordered;
}

export function validateConfiguration(
  config: GenerationConfig,
  registry: Map<string, GeneratorDefinition>,
): void {
  if (!Number.isInteger(config.count) || config.count < 1 || config.count > 100000)
    throw new DomainError('RECORD_LIMIT', 'Record count must be 1–100000');
  if (typeof config.seed !== 'string' || !config.seed.length || config.seed.length > 1000)
    throw new DomainError('SEED', 'Provide a seed of 1–1000 characters');
  if (!['pl', 'da', 'de', 'en_GB', 'en_US'].includes(config.locale))
    throw new DomainError('LOCALE', 'Unsupported locale');
  parseDate(config.referenceDate);
  if (!config.schema || !Array.isArray(config.schema.fields) || !config.schema.fields.length)
    throw new DomainError('EMPTY_SCHEMA', 'Add at least one field');
  let fieldCount = 0;
  function check(fields: FieldDefinition[], depth: number): void {
    if (depth > 8) throw new DomainError('DEPTH_LIMIT', 'Maximum nesting depth is eight');
    const names = new Set<string>();
    const ids = new Set<string>();
    for (const field of fields) {
      if (++fieldCount > 200)
        throw new DomainError('FIELD_LIMIT', 'Maximum schema size is 200 fields');
      if (!field || !safeName.test(field.name) || names.has(field.name))
        throw new DomainError('FIELD_NAME', 'Use unique identifier-style field names', field?.name);
      if (!field.id || ids.has(field.id))
        throw new DomainError('FIELD_ID', 'Field IDs must be unique and non-empty', field.name);
      names.add(field.name);
      ids.add(field.id);
      if (field.locale && !['pl', 'da', 'de', 'en_GB', 'en_US'].includes(field.locale))
        throw new DomainError('LOCALE', 'Unsupported field locale', field.name);
      const rates = [field.nullRate ?? 0, field.emptyRate ?? 0, field.missingRate ?? 0];
      if (
        rates.some((rate) => !Number.isFinite(rate) || rate < 0 || rate > 1) ||
        rates.reduce((a, b) => a + b, 0) > 1
      )
        throw new DomainError('RATES', 'Rates must total at most 1', field.name);
      if (field.required !== false && field.missingRate)
        throw new DomainError(
          'REQUIRED_MISSING',
          'Required fields cannot have a missing rate',
          field.name,
        );
      const min = field.options?.min,
        max = field.options?.max;
      if (typeof min === 'number' && typeof max === 'number' && min > max)
        throw new DomainError('RANGE', 'Minimum exceeds maximum', field.name);
      if (field.generator === 'object') check(field.fields ?? [], depth + 1);
      else if (field.generator === 'array') {
        const min = numberOption(field, 'minItems', 1),
          max = numberOption(field, 'maxItems', 3);
        if (
          !Number.isInteger(min) ||
          !Number.isInteger(max) ||
          min < 0 ||
          max > 1000 ||
          min > max ||
          !field.item
        )
          throw new DomainError(
            'ARRAY_LIMIT',
            'Arrays need an item and a range within 0–1000',
            field.name,
          );
        check([field.item], depth + 1);
      } else if (!registry.has(field.generator) && !field.rule)
        throw new DomainError('GENERATOR', 'Unknown generator', field.name);
      if (
        field.rule &&
        !['copy', 'email', 'age', 'addDays', 'multiply', 'template', 'foreignKey'].includes(
          field.rule.operation,
        )
      )
        throw new DomainError('RULE_OPERATION', 'Unknown rule', field.name);
    }
    orderFields(fields);
  }
  check(config.schema.fields, 0);
  // Bound multiplicative arrays and retained output before allocating records.
  function estimate(field: FieldDefinition): number {
    const nameBytes = field.name.length * 2 + 48;
    if (field.generator === 'object')
      return nameBytes + (field.fields ?? []).reduce((sum, child) => sum + estimate(child), 0);
    if (field.generator === 'array')
      return nameBytes + numberOption(field, 'maxItems', 3) * estimate(field.item!);
    if (field.generator === 'text')
      return (
        nameBytes +
        2 *
          (numberOption(field, 'maxLength', 24) +
            stringOption(field, 'prefix').length +
            stringOption(field, 'suffix').length)
      );
    if (field.generator === 'security') return nameBytes + 2 * numberOption(field, 'length', 10000);
    if (field.rule?.operation === 'template')
      return nameBytes + 2 * String(field.rule.value ?? '').length + 1024;
    if (field.generator === 'constant' || field.generator === 'enum')
      return (
        nameBytes + JSON.stringify(field.options?.value ?? field.options?.values ?? null).length * 2
      );
    return nameBytes + 256;
  }
  const estimatedBytes =
    config.count * config.schema.fields.reduce((sum, field) => sum + estimate(field), 0);
  if (!Number.isFinite(estimatedBytes) || estimatedBytes > 256 * 1024 * 1024)
    throw new DomainError(
      'OUTPUT_BUDGET',
      'Estimated output exceeds 256 MiB; reduce record count, text length or nested array sizes',
    );
  config.pools?.forEach(validateReferencePool);
}

export class GenerationSession {
  private readonly random: SeededRandom;
  private readonly unique = new Map<string, Set<string>>();
  private pendingUnique: { path: string; key: string }[] = [];
  private readonly sorted = new Map<FieldDefinition[], FieldDefinition[]>();
  private nextIndex = 0;
  constructor(
    public readonly config: GenerationConfig,
    private readonly registry: Map<string, GeneratorDefinition>,
  ) {
    validateConfiguration(config, registry);
    this.random = new SeededRandom(config.seed);
  }
  private object(
    fields: FieldDefinition[],
    path: string,
    index: number,
    recordAttempt = 0,
  ): DataRecord {
    const row: DataRecord = {};
    let ordered = this.sorted.get(fields);
    if (!ordered) {
      ordered = orderFields(fields);
      this.sorted.set(fields, ordered);
    }
    for (const field of ordered) {
      const fieldPath = `${path}/${field.id}`;
      if (
        field.condition &&
        JSON.stringify(readPath(row, field.condition.field)) !==
          JSON.stringify(field.condition.equals)
      )
        continue;
      const random = this.random.fork(index, fieldPath, 'presence');
      const roll = random.next();
      if (roll < (field.missingRate ?? 0)) continue;
      const missingAndNull = (field.missingRate ?? 0) + (field.nullRate ?? 0);
      if (roll < missingAndNull) {
        row[field.name] = null;
        continue;
      }
      if (roll < missingAndNull + (field.emptyRate ?? 0)) {
        row[field.name] = '';
        continue;
      }
      const occupied = this.unique.get(fieldPath) ?? new Set<string>();
      let accepted = false;
      for (let attempt = 0; attempt < 1000; attempt++) {
        const context: GeneratorContext = {
          random: recordAttempt
            ? this.random.fork(index, fieldPath, attempt, recordAttempt)
            : this.random.fork(index, fieldPath, attempt),
          row,
          index,
          config: this.config,
          field,
        };
        let value: JsonValue;
        if (field.rule) value = applyRule(context);
        else if (field.generator === 'object')
          value = this.object(field.fields ?? [], fieldPath, index, recordAttempt);
        else if (field.generator === 'array') {
          const count = context.random.integer(
            numberOption(field, 'minItems', 1),
            numberOption(field, 'maxItems', 3),
          );
          value = Array.from(
            { length: count },
            (_, itemIndex) =>
              this.object([field.item!], `${fieldPath}/${itemIndex}`, index, recordAttempt)[
                field.item!.name
              ],
          );
        } else value = this.registry.get(field.generator)!.generate(context);
        if (value === undefined || (typeof value === 'number' && !Number.isFinite(value)))
          throw new DomainError(
            'GENERATOR_VALUE',
            'Generator produced an invalid JSON value',
            field.name,
          );
        const key = JSON.stringify(value);
        if (!field.unique || !occupied.has(key)) {
          row[field.name] = value;
          if (field.unique) {
            occupied.add(key);
            this.unique.set(fieldPath, occupied);
            this.pendingUnique.push({ path: fieldPath, key });
          }
          accepted = true;
          break;
        }
      }
      if (!accepted)
        throw new DomainError(
          'UNIQUE_EXHAUSTED',
          'Unique values exhausted or retry limit reached; relax constraints or reduce count',
          field.name,
        );
    }
    return Object.fromEntries(
      fields
        .filter((field) => Object.hasOwn(row, field.name))
        .map((field) => [field.name, row[field.name]]),
    );
  }
  nextBatch(size = 500, accept?: (row: DataRecord) => boolean): DataRecord[] {
    if (!Number.isInteger(size) || size < 1)
      throw new DomainError('BATCH_SIZE', 'Batch size must be positive');
    const rows: DataRecord[] = [];
    const end = Math.min(this.config.count, this.nextIndex + size);
    for (; this.nextIndex < end; this.nextIndex++) {
      let accepted = false;
      for (let attempt = 0; attempt < 1000; attempt++) {
        this.pendingUnique = [];
        const row = this.object(
          this.config.schema.fields,
          this.config.schema.id,
          this.nextIndex,
          attempt,
        );
        if (!accept || accept(row)) {
          rows.push(row);
          accepted = true;
          break;
        }
        for (const entry of this.pendingUnique) this.unique.get(entry.path)?.delete(entry.key);
      }
      if (!accepted)
        throw new DomainError(
          'ROW_CONSTRAINT_EXHAUSTED',
          'Cannot satisfy record constraints within 1000 attempts; reduce count or relax constraints',
        );
    }
    return rows;
  }
  get completed(): number {
    return this.nextIndex;
  }
  manifest(): GenerationManifest {
    return {
      engine: ENGINE_VERSION,
      fakerVersion: '10.6.0',
      schema: structuredClone(this.config.schema),
      seed: this.config.seed,
      referenceDate: this.config.referenceDate,
      locale: this.config.locale,
      count: this.config.count,
      sourceVersions: this.config.pools?.map((pool) => pool.source) ?? [],
      provenance: 'synthetic-or-user-imported',
      registryVerified: false,
    };
  }
}

export function validateRecord(row: DataRecord, config: GenerationConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  function inspect(record: DataRecord, fields: FieldDefinition[], prefix: string) {
    for (const field of fields) {
      const path = prefix + field.name,
        value = record[field.name];
      if (
        field.condition &&
        JSON.stringify(readPath(record, field.condition.field)) !==
          JSON.stringify(field.condition.equals)
      )
        continue;
      if (value === undefined) {
        if (field.required !== false)
          issues.push(issue('REQUIRED', 'Required field is absent', path));
        continue;
      }
      if (value === null && field.nullRate) continue;
      if (value === '' && field.emptyRate) continue;
      const fail = (code: string, message: string) => issues.push(issue(code, message, path));
      if (value === null) {
        if (!(field.generator === 'constant' && (field.options?.value ?? null) === null))
          fail('NULL', 'Null is not enabled');
        continue;
      }
      if (field.generator === 'object') {
        if (typeof value !== 'object' || Array.isArray(value)) fail('TYPE', 'Expected object');
        else inspect(value, field.fields ?? [], path + '.');
      } else if (field.generator === 'array') {
        if (!Array.isArray(value)) fail('TYPE', 'Expected array');
        else {
          if (
            value.length < numberOption(field, 'minItems', 1) ||
            value.length > numberOption(field, 'maxItems', 3)
          )
            fail('RANGE', 'Array size outside range');
          value.forEach((item, index) =>
            inspect({ [field.item!.name]: item }, [field.item!], `${path}.${index}.`),
          );
        }
      } else {
        const numeric = ['integer', 'sequence', 'decimal', 'amount', 'age'].includes(
          field.generator,
        );
        if (numeric && typeof value !== 'number') fail('TYPE', 'Expected number');
        if (field.generator === 'boolean' && typeof value !== 'boolean')
          fail('TYPE', 'Expected boolean');
        if (numeric && typeof value === 'number') {
          if (
            (field.options?.min !== undefined && value < Number(field.options.min)) ||
            (field.options?.max !== undefined && value > Number(field.options.max))
          )
            fail('RANGE', 'Number outside configured range');
          if (['integer', 'amount', 'age'].includes(field.generator) && !Number.isInteger(value))
            fail('TYPE', 'Expected integer');
        }
        const validators: Record<string, (value: string) => boolean> = {
          pesel: validatePesel,
          nip: validateNip,
          regon: validateRegon,
          polishId: validatePolishId,
          iban: validateIban,
          nrb: (value) => validateIban('PL' + value),
          cvr: validateCvr,
          pNumber: validatePNumber,
          vatDk: (value) => /^DK\d{8}$/.test(value) && validateCvr(value.slice(2)),
          cpr: (value) =>
            validateCpr(
              value,
              stringOption(field, 'profile', 'standard') as CprProfile,
              config.pools
                ?.filter(
                  (pool) =>
                    pool.kind === 'cpr' &&
                    (!stringOption(field, 'sourceId') ||
                      pool.source.id === stringOption(field, 'sourceId')),
                )
                .flatMap((pool) => pool.records.map((record) => String(record.cpr))),
            ),
          uuid: (value) =>
            /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(value),
          email: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
          date: (value) => {
            try {
              parseDate(value);
              return true;
            } catch {
              return false;
            }
          },
          birthDate: (value) => {
            try {
              parseDate(value);
              return true;
            } catch {
              return false;
            }
          },
        };
        if (
          validators[field.generator] &&
          (typeof value !== 'string' || !validators[field.generator](value))
        )
          fail('FORMAT', 'Value does not satisfy generator profile');
        if (field.generator === 'text') {
          if (typeof value !== 'string') fail('TYPE', 'Expected text');
          else {
            const length =
              [...value].length -
              [...stringOption(field, 'prefix')].length -
              [...stringOption(field, 'suffix')].length;
            if (
              length < numberOption(field, 'minLength', 12) ||
              length > numberOption(field, 'maxLength', 24)
            )
              fail('LENGTH', 'Text length outside range');
          }
        }
        if (field.generator === 'enum' && !Array.isArray(field.options?.values))
          fail('ENUM', 'Missing enum values');
        else if (
          field.generator === 'enum' &&
          Array.isArray(field.options?.values) &&
          !field.options.values.some(
            (candidate) => JSON.stringify(candidate) === JSON.stringify(value),
          )
        )
          fail('ENUM', 'Not an allowed value');
        if (
          field.generator === 'constant' &&
          JSON.stringify(value) !== JSON.stringify(field.options?.value ?? null)
        )
          fail('CONST', 'Constant differs');
        if (
          typeof value === 'string' &&
          ['pesel', 'cpr'].includes(field.generator) &&
          validators[field.generator](value)
        ) {
          const decoded = field.generator === 'pesel' ? decodePesel(value) : decodeCpr(value);
          const birthField = stringOption(field, 'birthDateField'),
            sexField = stringOption(field, 'sexField');
          if (birthField && readPath(record, birthField) !== decoded.birthDate)
            fail('DATE_RELATION', 'Birth date differs from identifier');
          if (sexField && readPath(record, sexField) !== decoded.sex)
            fail('SEX_RELATION', 'Encoded sex differs');
        }
      }
      if (field.rule && field.rule.operation !== 'foreignKey') {
        try {
          const expected = applyRule({
            random: new SeededRandom(config.seed),
            row: record,
            index: 0,
            config,
            field,
          });
          if (JSON.stringify(expected) !== JSON.stringify(value))
            fail('RELATION', 'Derived value does not match its dependencies');
        } catch {
          fail('RELATION', 'Dependency cannot be evaluated');
        }
      } else if (field.rule?.operation === 'foreignKey') {
        const rule = field.rule;
        if (
          !config.datasets?.[rule.dataset ?? '']?.some(
            (parent) =>
              JSON.stringify(readPath(parent, rule.targetField ?? 'id')) === JSON.stringify(value),
          )
        )
          fail('FOREIGN_KEY', 'Referenced record does not exist');
      }
    }
  }
  inspect(row, config.schema.fields, '');
  return issues;
}
