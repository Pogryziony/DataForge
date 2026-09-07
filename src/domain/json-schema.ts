import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { DomainError } from './errors';
import type { DataSchema, FieldDefinition, JsonValue } from './types';

type SchemaNode = Record<string, JsonValue>;
const allowed = new Set(['$schema', '$id', '$defs', '$ref', 'title', 'description', 'type', 'properties', 'required', 'additionalProperties', 'enum', 'const', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'minLength', 'maxLength', 'pattern', 'format', 'items', 'minItems', 'maxItems', 'default', 'examples', 'x-testforge-generator', 'x-testforge-options', 'x-testforge-locale']);

export function importJsonSchema(input: unknown): DataSchema {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new DomainError('JSON_SCHEMA', 'Expected an object schema');
  const root = input as SchemaNode;
  if (root.$schema && root.$schema !== 'https://json-schema.org/draft/2020-12/schema') throw new DomainError('SCHEMA_DRAFT', 'Only Draft 2020-12 is supported');
  const unsupported: string[] = [];
  function scan(value: SchemaNode, path: string, depth: number) {
    if (depth > 10) throw new DomainError('SCHEMA_DEPTH', 'Schema is too deeply nested');
    for (const key of Object.keys(value)) if (!allowed.has(key)) unsupported.push(`${path}/${key}`);
    for (const key of ['properties', '$defs']) {
      const children = value[key];
      if (children && typeof children === 'object' && !Array.isArray(children)) for (const [name, child] of Object.entries(children)) {
        if (!child || typeof child !== 'object' || Array.isArray(child)) throw new DomainError('SCHEMA_NODE', 'Boolean and non-object subschemas are not supported');
        scan(child as SchemaNode, `${path}/${key}/${name}`, depth + 1);
      }
    }
    if (value.items && typeof value.items === 'object' && !Array.isArray(value.items)) scan(value.items as SchemaNode, `${path}/items`, depth + 1);
  }
  scan(root, '#', 0);
  if (unsupported.length) throw new DomainError('UNSUPPORTED_KEYWORDS', unsupported.join(', '));
  function resolve(node: SchemaNode, stack: string[]): SchemaNode {
    if (!node.$ref) return node;
    if (typeof node.$ref !== 'string' || !node.$ref.startsWith('#/')) throw new DomainError('REMOTE_REF', 'Only local JSON Pointer references are supported');
    if (stack.includes(node.$ref)) throw new DomainError('RECURSIVE_REF', 'Recursive references are not supported');
    if (Object.keys(node).some(key => !['$ref', 'title', 'description'].includes(key))) throw new DomainError('REF_SIBLINGS', 'Validation keywords beside $ref are not supported');
    let target: JsonValue = root;
    for (const part of node.$ref.slice(2).split('/').map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'))) {
      if (!target || typeof target !== 'object' || Array.isArray(target) || !Object.hasOwn(target, part)) throw new DomainError('MISSING_REF', 'Local reference cannot be resolved');
      target = target[part];
    }
    if (!target || typeof target !== 'object' || Array.isArray(target)) throw new DomainError('REF_TYPE', 'Reference must resolve to a schema object');
    return resolve(target as SchemaNode, [...stack, node.$ref]);
  }
  function field(original: SchemaNode, name: string, path: string, depth: number, refs: string[]): FieldDefinition {
    if (depth > 8) throw new DomainError('SCHEMA_DEPTH', 'Maximum field depth is eight');
    if (typeof original.$ref === 'string' && refs.includes(original.$ref)) throw new DomainError('RECURSIVE_REF', 'Recursive references are not supported');
    const node = resolve(original, refs);
    const nextRefs = typeof original.$ref === 'string' ? [...refs, original.$ref] : refs;
    const base: FieldDefinition = { id: path, name, generator: 'text', required: true };
    if (Object.hasOwn(node, 'const')) return { ...base, generator: 'constant', options: { value: node.const } };
    if (node.enum) {
      if (!Array.isArray(node.enum) || !node.enum.length) throw new DomainError('SCHEMA_ENUM', 'Enum must have values');
      return { ...base, generator: 'enum', options: { values: node.enum } };
    }
    if (typeof node.type !== 'string') throw new DomainError('SCHEMA_TYPE', 'Explicit single type is required');
    if (node['x-testforge-generator']) return { ...base, generator: String(node['x-testforge-generator']), options: (node['x-testforge-options'] ?? {}) as Record<string, JsonValue>, locale: node['x-testforge-locale'] as FieldDefinition['locale'] };
    switch (node.type) {
      case 'object': {
        if (typeof node.additionalProperties === 'object') throw new DomainError('ADDITIONAL_PROPERTIES', 'Schema-valued additionalProperties is unsupported');
        const properties = node.properties ?? {};
        if (!properties || typeof properties !== 'object' || Array.isArray(properties)) throw new DomainError('PROPERTIES', 'Properties must be an object');
        return { ...base, generator: 'object', fields: Object.entries(properties).map(([key, child]) => {
          if (!child || typeof child !== 'object' || Array.isArray(child)) throw new DomainError('PROPERTY_SCHEMA', 'Property must be a schema');
          return { ...field(child as SchemaNode, key, `${path}.${key}`, depth + 1, nextRefs), required: Array.isArray(node.required) && node.required.includes(key) };
        }) };
      }
      case 'array': {
        if (!node.items || typeof node.items !== 'object' || Array.isArray(node.items)) throw new DomainError('ARRAY_ITEMS', 'Arrays require a single items schema');
        return { ...base, generator: 'array', options: { minItems: node.minItems ?? 0, maxItems: node.maxItems ?? Math.max(3, Number(node.minItems ?? 0)) }, item: field(node.items as SchemaNode, 'item', `${path}.item`, depth + 1, nextRefs) };
      }
      case 'integer':
      case 'number': {
        const step = node.type === 'integer' ? 1 : 0.01;
        const min = node.exclusiveMinimum !== undefined ? (node.type === 'integer' ? Math.floor(Number(node.exclusiveMinimum)) + 1 : Math.floor(Number(node.exclusiveMinimum) * 100 + 1) / 100) : Number(node.minimum ?? 0);
        const max = node.exclusiveMaximum !== undefined ? (node.type === 'integer' ? Math.ceil(Number(node.exclusiveMaximum)) - 1 : Math.ceil(Number(node.exclusiveMaximum) * 100 - 1) / 100) : Number(node.maximum ?? Math.max(1000, min + step));
        if (min > max) throw new DomainError('UNSATISFIABLE_RANGE', 'No representable numbers meet the constraints');
        return { ...base, generator: node.type === 'integer' ? 'integer' : 'decimal', options: { min: node.type === 'integer' ? Math.ceil(min) : min, max: node.type === 'integer' ? Math.floor(max) : max, precision: 2 } };
      }
      case 'boolean': return { ...base, generator: 'boolean' };
      case 'null': return { ...base, generator: 'constant', options: { value: null }, nullRate: 1 };
      case 'string': {
        if (node.format) {
          const formats: Record<string, string> = { uuid: 'uuid', email: 'email', date: 'date', 'date-time': 'timestamp', uri: 'url', ipv4: 'ipv4', ipv6: 'ipv6' };
          if (!formats[String(node.format)]) throw new DomainError('UNSUPPORTED_FORMAT', `Unsupported format: ${String(node.format)}`);
          if (node.pattern || node.minLength !== undefined || node.maxLength !== undefined) throw new DomainError('FORMAT_COMBINATION', 'Length/pattern constraints combined with format require an explicit generator');
          return { ...base, generator: formats[String(node.format)] };
        }
        let minLength = Number(node.minLength ?? 0), maxLength = Number(node.maxLength ?? Math.max(24, minLength)), alphabet: string | undefined;
        if (node.pattern) {
          const match = /^\^(\\d|\[0-9\]|\[A-Z\]|\[a-z\]|\[A-Za-z0-9\])\{(\d+)(?:,(\d+))?\}\$$/.exec(String(node.pattern));
          if (!match) throw new DomainError('UNSUPPORTED_PATTERN', 'Supported patterns: anchored digit/ASCII classes with bounded {n} or {n,m}');
          const alphabets: Record<string, string> = { '\\d': '0123456789', '[0-9]': '0123456789', '[A-Z]': 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '[a-z]': 'abcdefghijklmnopqrstuvwxyz', '[A-Za-z0-9]': 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789' };
          alphabet = alphabets[match[1]];
          minLength = Math.max(minLength, Number(match[2]));
          maxLength = Math.min(node.maxLength === undefined ? Infinity : maxLength, Number(match[3] ?? match[2]));
        }
        if (minLength > maxLength || minLength < 0 || maxLength > 100000) throw new DomainError('TEXT_RANGE', 'Text constraints are unsatisfiable or exceed 100000 characters');
        return { ...base, generator: 'text', options: { minLength, maxLength, ...(alphabet ? { alphabet } : {}) } };
      }
      default: throw new DomainError('SCHEMA_TYPE', `Unsupported type: ${node.type}`);
    }
  }
  const generated = field(root, 'root', 'root', 0, []);
  if (generated.generator !== 'object') throw new DomainError('ROOT_OBJECT', 'Root schema must describe an object');
  compileJsonValidator(root);
  return { id: 'json-schema', name: String(root.title ?? 'Imported JSON Schema'), version: 1, fields: generated.fields ?? [], validationSchema: structuredClone(root) };
}

export function compileJsonValidator(schema: object) {
  const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: true });
  addFormats(ajv);
  return ajv.compile(schema);
}
