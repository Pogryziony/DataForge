import { GenerationSession, validateRecord } from './engine';
import { DomainError } from './errors';
import type { GeneratorDefinition } from './generators';
import type { DataRecord, DataSchema, FieldDefinition, GenerationConfig } from './types';

export interface DatasetDefinition { name: string; count: number; schema: DataSchema; primaryKey?: string; uniqueTogether?: string[][] }
export function datasetDependencies(fields: FieldDefinition[]): string[] {
  return fields.flatMap(field => [
    ...(field.rule?.operation === 'foreignKey' && field.rule.dataset ? [field.rule.dataset] : []),
    ...datasetDependencies(field.fields ?? []), ...datasetDependencies(field.item ? [field.item] : []),
  ]);
}
export function generateDatasets(definitions: DatasetDefinition[], base: Omit<GenerationConfig, 'schema' | 'count' | 'datasets'>, registry: Map<string, GeneratorDefinition>): Record<string, DataRecord[]> {
  if (!Array.isArray(definitions) || !definitions.length || definitions.some(definition => !definition || !Number.isInteger(definition.count) || definition.count < 1 || !/^(?!__proto__$|constructor$|prototype$)[A-Za-z_][A-Za-z0-9_]*$/.test(definition.name))) throw new DomainError('DATASET_CONFIG', 'Provide named datasets with positive integer counts');
  if (definitions.reduce((count, dataset) => count + dataset.count, 0) > 100000) throw new DomainError('DATASET_LIMIT', 'Combined dataset count cannot exceed 100000');
  const indexed = new Map(definitions.map(dataset => [dataset.name, dataset]));
  if (indexed.size !== definitions.length) throw new DomainError('DATASET_NAME', 'Dataset names must be unique');
  const result: Record<string, DataRecord[]> = {};
  const active = new Set<string>();
  function visit(name: string) {
    if (Object.hasOwn(result, name)) return;
    if (['__proto__', 'constructor', 'prototype'].includes(name)) throw new DomainError('DATASET_NAME', 'Unsafe dataset name');
    const definition = indexed.get(name);
    if (!definition) throw new DomainError('DATASET_MISSING', 'Referenced dataset does not exist', name);
    if (active.has(name)) throw new DomainError('DATASET_CYCLE', 'Cyclic dataset dependencies', name);
    active.add(name);
    datasetDependencies(definition.schema.fields).forEach(visit);
    const schema = structuredClone(definition.schema);
    const key = definition.primaryKey ?? 'id';
    const primary = schema.fields.find(field => field.name === key);
    if (!primary) throw new DomainError('PRIMARY_KEY', 'Dataset needs a primary key field', name);
    primary.unique = true; primary.required = true;
    primary.nullRate = 0; primary.emptyRate = 0; primary.missingRate = 0;
    const config = { ...base, seed: `${base.seed}:${name}`, count: definition.count, schema, datasets: result };
    const session = new GenerationSession(config, registry);
    const groups = (definition.uniqueTogether ?? []).map(keys => {
      if (!keys.length || new Set(keys).size !== keys.length || keys.some(key => !schema.fields.some(field => field.name === key))) throw new DomainError('COMPOSITE_FIELDS', 'Composite constraints need distinct existing top-level fields', name);
      return { keys, used: new Set<string>() };
    });
    const rows = session.nextBatch(definition.count, row => {
      const signatures = groups.map(group => JSON.stringify(group.keys.map(key => row[key])));
      if (groups.some((group, index) => group.used.has(signatures[index]))) return false;
      groups.forEach((group, index) => group.used.add(signatures[index]));
      return true;
    });
    for (const row of rows) {
      const issues = validateRecord(row, config);
      if (issues.length) throw new DomainError('DATASET_VALIDATION', issues[0].message, `${name}.${issues[0].path}`);
    }
    result[name] = rows; active.delete(name);
  }
  definitions.forEach(definition => visit(definition.name));
  return result;
}
