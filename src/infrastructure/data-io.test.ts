import { expect, it } from 'vitest';
import { exportRecords } from './exports';
import { importRecords, parseSafeJson } from './imports';
import { transformRecords } from '../domain/transforms';
import { generateCode } from '../domain/codegen';
import ts from 'typescript';

it('roundtrips CSV text, quotes, Unicode and leading zeros', async () => {
  const rows = [{ cpr: '0101011234', value: 'ÆØÅ, "żółć"\nline' }];
  const csv = await exportRecords(rows, 'csv');
  expect(importRecords(String(csv.contents), 'csv')).toEqual(rows);
});
it('protects formula-like CSV values and safely represents SQL text', async () => {
  expect(String((await exportRecords([{ value: '=1+1' }], 'csv')).contents)).toContain("'=1+1");
  expect(String((await exportRecords([{ value: "O'Brien" }], 'sql')).contents)).toContain("O''Brien");
  expect(String((await exportRecords([{ value: '<script>&' }], 'xml')).contents)).toContain('&lt;script&gt;&amp;');
  expect(() => parseSafeJson('{"__proto__": {"polluted": true}}')).toThrow('Unsafe');
});
it('exports XLSX identifiers as strings and never formula objects', async () => {
  const artifact = await exportRecords([{ id: '000123', payload: '=1+1' }], 'xlsx');
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  await workbook.xlsx.load(artifact.contents as never);
  expect(workbook.worksheets[0].getCell('A2').value).toBe('000123');
  expect(workbook.worksheets[0].getCell('B2').value).toBe('=1+1');
});
it('pseudonymizes consistently across related identifiers without retaining originals', async () => {
  const rows = [{ id: 'sensitive', customerId: 'sensitive' }];
  const rules = [{ field: 'id', operation: 'pseudonymize' as const }, { field: 'customerId', operation: 'pseudonymize' as const }];
  const output = await transformRecords(rows, rules, 'private-test-key-at-least-16');
  expect(output[0].id).toBe(output[0].customerId);
  expect(output[0].id).not.toContain('sensitive');
  expect(rows[0].id).toBe('sensitive');
});
it('replaces selected fields with generated fixtures without changing the input', async () => {
  const input = [{ email: 'private@example.com', id: '0001' }];
  const output = await transformRecords(input, [{ field: 'email', operation: 'generate', generator: 'email' }], '', [{ email: 'synthetic@example.test' }]);
  expect(output).toEqual([{ email: 'synthetic@example.test', id: '0001' }]);
  expect(input[0].email).toBe('private@example.com');
});
it('generates syntactically valid TypeScript fixtures', () => {
  for (const target of ['playwright', 'typescript'] as const) {
    const source = generateCode([{ name: 'ÆØÅ', id: '0001' }], target);
    const result = ts.transpileModule(source, { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022 } });
    expect(result.diagnostics).toEqual([]);
  }
});
