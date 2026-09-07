export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type DataRecord = Record<string, JsonValue>;
export type Locale = 'pl' | 'da' | 'de' | 'en_GB' | 'en_US';
export type EncodedSex = 'female' | 'male';
export type CprProfile = 'standard' | 'legacy-mod11' | 'official-test-pool';
export interface SourceMetadata {
  id: string;
  title: string;
  url: string;
  retrievedAt: string;
  version: string;
  license: string;
}
export interface ReferencePool {
  kind: 'cpr' | 'dar';
  source: SourceMetadata;
  records: DataRecord[];
}
export interface FieldRule {
  operation: 'copy' | 'email' | 'age' | 'addDays' | 'multiply' | 'template' | 'foreignKey';
  fields?: string[];
  value?: JsonValue;
  dataset?: string;
  targetField?: string;
}
export interface FieldDefinition {
  id: string;
  name: string;
  generator: string;
  locale?: Locale;
  options?: Record<string, JsonValue>;
  unique?: boolean;
  required?: boolean;
  nullRate?: number;
  emptyRate?: number;
  missingRate?: number;
  rule?: FieldRule;
  condition?: { field: string; equals: JsonValue };
  fields?: FieldDefinition[];
  item?: FieldDefinition;
}
export interface DataSchema {
  id: string;
  name: string;
  version: number;
  fields: FieldDefinition[];
}
export interface GenerationConfig {
  seed: string;
  referenceDate: string;
  locale: Locale;
  count: number;
  schema: DataSchema;
  pools?: ReferencePool[];
  datasets?: Record<string, DataRecord[]>;
}
export interface GenerationManifest {
  engine: string;
  schema: DataSchema;
  seed: string;
  referenceDate: string;
  locale: Locale;
  count: number;
  sourceVersions: SourceMetadata[];
  provenance: 'synthetic-or-user-imported';
  registryVerified: false;
}
