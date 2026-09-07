import Papa from 'papaparse';
import { DomainError } from '../domain/errors';
import type { DataRecord, JsonValue } from '../domain/types';

export type ExportFormat = 'json' | 'jsonl' | 'csv' | 'xml' | 'yaml' | 'xlsx' | 'sql';
export interface ExportOptions {
  separator?: string;
  bom?: boolean;
  rawFormulas?: boolean;
  dialect?: 'sqlite' | 'postgresql' | 'mysql';
  table?: string;
}
export interface ExportArtifact {
  filename: string;
  mime: string;
  contents: string | Uint8Array;
}
const cell = (value: JsonValue | undefined): string | number | boolean =>
  value === null || value === undefined
    ? ''
    : typeof value === 'object'
      ? JSON.stringify(value)
      : value;
const columns = (rows: DataRecord[]) => [...new Set(rows.flatMap((row) => Object.keys(row)))];
export function safeSpreadsheetText(value: string, raw = false): string {
  return !raw && /^[\s\uFEFF]*[=+@\-\t\r\n]/.test(value) ? `'${value}` : value;
}
function escapeXml(value: string): string {
  if (
    [...value].some((char) => char.charCodeAt(0) < 32 && ![9, 10, 13].includes(char.charCodeAt(0)))
  )
    throw new DomainError(
      'XML_CHARACTERS',
      'XML 1.0 cannot represent these control characters; choose JSON for this test case',
    );
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
function xmlValue(value: JsonValue, name?: string): string {
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  const attributes = ` type="${type}"${name === undefined ? '' : ` name="${escapeXml(name)}"`}`;
  const contents =
    value === null
      ? ''
      : Array.isArray(value)
        ? value.map((item) => xmlValue(item)).join('')
        : typeof value === 'object'
          ? Object.entries(value)
              .map(([key, child]) => xmlValue(child, key))
              .join('')
          : escapeXml(String(value));
  return `<value${attributes}>${contents}</value>`;
}
function sqlIdentifier(value: string, dialect: ExportOptions['dialect']): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value))
    throw new DomainError(
      'SQL_IDENTIFIER',
      'SQL identifiers must contain only letters, digits and underscores',
    );
  const quote = dialect === 'mysql' ? '`' : '"';
  return quote + value + quote;
}
function sqlLiteral(value: JsonValue | undefined, dialect: ExportOptions['dialect']): string {
  if (value === undefined || value === null) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new DomainError('SQL_NUMBER', 'SQL export rejects non-finite numbers');
    return String(value);
  }
  if (typeof value === 'boolean')
    return dialect === 'sqlite' ? (value ? '1' : '0') : String(value).toUpperCase();
  const text = typeof value === 'object' ? JSON.stringify(value) : value;
  if (dialect === 'mysql') {
    const hex = [...new TextEncoder().encode(text)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    return `CONVERT(X'${hex}' USING utf8mb4)`;
  }
  if (text.includes('\0'))
    throw new DomainError('SQL_NUL', 'This SQL text export cannot represent NUL; use JSON');
  return `'${text.replace(/'/g, "''")}'`;
}
export async function exportRecords(
  rows: DataRecord[],
  format: ExportFormat,
  options: ExportOptions = {},
): Promise<ExportArtifact> {
  const name = 'dataforge';
  if (format === 'json')
    return {
      filename: `${name}.json`,
      mime: 'application/json',
      contents: JSON.stringify(rows, null, 2),
    };
  if (format === 'jsonl')
    return {
      filename: `${name}.jsonl`,
      mime: 'application/x-ndjson',
      contents: rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''),
    };
  if (format === 'csv') {
    const delimiter = options.separator ?? ',';
    if (![',', ';', '\t', '|'].includes(delimiter))
      throw new DomainError('CSV_SEPARATOR', 'Unsupported CSV separator');
    const fields = columns(rows);
    const data = rows.map((row) =>
      fields.map((field) => {
        const value = cell(row[field]);
        return typeof value === 'string' ? safeSpreadsheetText(value, options.rawFormulas) : value;
      }),
    );
    return {
      filename: `${name}.csv`,
      mime: 'text/csv;charset=utf-8',
      contents:
        (options.bom ? '\uFEFF' : '') +
        Papa.unparse({ fields, data }, { delimiter, newline: '\r\n' }),
    };
  }
  if (format === 'xml')
    return {
      filename: `${name}.xml`,
      mime: 'application/xml',
      contents: `<?xml version="1.0" encoding="UTF-8"?>\n<records>${rows
        .map(
          (row) =>
            `<record>${Object.entries(row)
              .map(([key, value]) => xmlValue(value, key))
              .join('')}</record>`,
        )
        .join('')}</records>`,
    };
  if (format === 'yaml') {
    const { stringify } = await import('yaml');
    return {
      filename: `${name}.yaml`,
      mime: 'application/yaml',
      contents: stringify(rows, { aliasDuplicateObjects: false }),
    };
  }
  if (format === 'xlsx') {
    const { Workbook } = await import('exceljs');
    const workbook = new Workbook();
    workbook.created = new Date('2026-01-01T00:00:00.000Z');
    workbook.modified = workbook.created;
    const sheet = workbook.addWorksheet('Data');
    const fields = columns(rows);
    sheet.addRow(fields);
    sheet.getRow(1).font = { bold: true };
    for (const record of rows) {
      const row = sheet.addRow(fields.map((field) => cell(record[field])));
      row.eachCell((entry) => {
        if (typeof entry.value === 'string') entry.numFmt = '@';
      });
    }
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.columns.forEach((column) => {
      column.width = 24;
    });
    const buffer = await workbook.xlsx.writeBuffer();
    return {
      filename: `${name}.xlsx`,
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      contents: new Uint8Array(buffer),
    };
  }
  if (format === 'sql') {
    const dialect = options.dialect ?? 'sqlite';
    const table = sqlIdentifier(options.table ?? 'test_data', dialect);
    const fields = columns(rows);
    const header = `-- DataForge synthetic/user-imported test data. Review before execution.\n-- Dialect: ${dialect}; nested values are JSON strings.\n`;
    return {
      filename: `${name}.sql`,
      mime: 'application/sql',
      contents:
        header +
        rows
          .map(
            (row) =>
              `INSERT INTO ${table} (${fields.map((field) => sqlIdentifier(field, dialect)).join(', ')}) VALUES (${fields.map((field) => sqlLiteral(row[field], dialect)).join(', ')});`,
          )
          .join('\n'),
    };
  }
  throw new DomainError('EXPORT_FORMAT', 'Unsupported export format');
}
export function downloadArtifact(artifact: ExportArtifact): void {
  const blob =
    typeof artifact.contents === 'string'
      ? new Blob([artifact.contents], { type: artifact.mime })
      : new Blob([new Uint8Array(artifact.contents).buffer], { type: artifact.mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = artifact.filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
