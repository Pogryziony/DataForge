import { DomainError } from './errors';
import type { DataRecord, JsonValue } from './types';

export type CodeTarget = 'playwright' | 'cypress' | 'typescript' | 'java' | 'rest-assured';
const tsType = (value: JsonValue): string => value === null ? 'null' : Array.isArray(value) ? (value.length ? `Array<${[...new Set(value.map(tsType))].join(' | ')}>` : 'unknown[]') : typeof value === 'object' ? `{ ${Object.entries(value).map(([key, child]) => `${JSON.stringify(key)}: ${tsType(child)}`).join('; ')} }` : typeof value;
const javaString = (value: string) => JSON.stringify(value).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
export function generateCode(rows: DataRecord[], target: CodeTarget): string {
  const json = JSON.stringify(rows, null, 2);
  if (target === 'cypress') return json;
  if (target === 'playwright') return `import { test as base, expect } from '@playwright/test';\n\nconst records = ${json};\n\nexport const test = base.extend<{ records: typeof records }>({\n  records: async ({}, use) => { await use(records); },\n});\nexport { expect };\n`;
  if (target === 'typescript') {
    const keys = [...new Set(rows.flatMap(row => Object.keys(row)))];
    return `export interface TestRecord {\n${keys.map(key => `  ${JSON.stringify(key)}${rows.some(row => !Object.hasOwn(row, key)) ? '?' : ''}: ${[...new Set(rows.filter(row => Object.hasOwn(row, key)).map(row => tsType(row[key])))].join(' | ')};`).join('\n')}\n}\n`;
  }
  if (target === 'rest-assured') return `import static io.restassured.RestAssured.given;\n\npublic final class TestPayload {\n  public static final String JSON = ${javaString(json)};\n\n  // Call explicitly with a test-environment endpoint. Nothing is sent automatically.\n  public static void postToTestEndpoint(String endpoint) {\n    given().contentType("application/json").body(JSON).when().post(endpoint).then().statusCode(200);\n  }\n}\n`;
  if (target === 'java') {
    const row = rows[0] ?? {};
    const reserved = new Set(['class', 'public', 'private', 'static', 'void', 'int', 'long', 'double', 'boolean', 'new', 'return', 'null', 'true', 'false', 'record', 'this', 'super', 'switch', 'default', 'package', 'import', 'final']);
    const fields = Object.entries(row).map(([name, value]) => {
      if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) || reserved.has(name)) throw new DomainError('JAVA_FIELD', 'Rename fields to valid non-reserved Java identifiers', name);
      const type = typeof value === 'number' ? (Number.isInteger(value) ? 'Long' : 'Double') : typeof value === 'boolean' ? 'Boolean' : 'String';
      return { name, type };
    });
    return `// Nested JSON values are represented as serialized Strings.\npublic final class TestRecord {\n${fields.map(field => `  private final ${field.type} ${field.name};`).join('\n')}\n\n  private TestRecord(Builder builder) {\n${fields.map(field => `    this.${field.name} = builder.${field.name};`).join('\n')}\n  }\n${fields.map(field => `  public ${field.type} ${field.name}() { return ${field.name}; }`).join('\n')}\n\n  public static Builder builder() { return new Builder(); }\n  public static final class Builder {\n${fields.map(field => `    private ${field.type} ${field.name};\n    public Builder ${field.name}(${field.type} value) { this.${field.name} = value; return this; }`).join('\n')}\n    public TestRecord build() { return new TestRecord(this); }\n  }\n}\n`;
  }
  throw new DomainError('CODE_TARGET', 'Unsupported code target');
}
