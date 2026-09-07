/// <reference lib="webworker" />
import { GenerationSession, validateRecord } from '../domain/engine';
import { createGeneratorRegistry } from '../domain/generators';
import { loadTextProvider } from '../infrastructure/faker';
import { errorMessage, DomainError } from '../domain/errors';
import { exportRecords } from '../infrastructure/exports';
import { generateCode } from '../domain/codegen';
import { generateDatasets } from '../domain/datasets';
import { negativeCase, generatePairwise } from '../domain/scenarios';
import { transformRecords } from '../domain/transforms';
import { compileJsonValidator } from '../domain/json-schema';
import type { DataRecord, FieldDefinition, GenerationManifest, Locale } from '../domain/types';
import type { WorkerRequest, WorkerResponse } from './protocol';

let records: DataRecord[] = [];
let datasets: Record<string, DataRecord[]> = {};
let manifest: GenerationManifest | undefined;
function locales(fields: FieldDefinition[]): Locale[] { return fields.flatMap(field => [...(field.locale ? [field.locale] : []), ...locales(field.fields ?? []), ...locales(field.item ? [field.item] : [])]); }
function send(message: WorkerResponse) { self.postMessage(message); }
self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === 'export') {
      const selected = request.dataset ? datasets[request.dataset] : records;
      if (!selected) throw new DomainError('DATASET_EXPORT', 'Choose an existing dataset');
      const artifact = await exportRecords(selected, request.format, request.options);
      send({ type: 'artifact', jobId: request.jobId, artifact }); return;
    }
    if (request.type === 'code') {
      if (records.length > 1000) throw new DomainError('CODE_LIMIT', 'Code generation is limited to 1000 records; export a fixture file for larger sets');
      const suffix = request.target === 'cypress' ? 'json' : ['java', 'rest-assured'].includes(request.target) ? 'java' : 'ts';
      send({ type: 'artifact', jobId: request.jobId, artifact: { filename: request.target === 'java' ? 'TestRecord.java' : request.target === 'rest-assured' ? 'TestPayload.java' : `dataforge-${request.target}.${suffix}`, mime: 'text/plain', contents: generateCode(records, request.target) } }); return;
    }
    if (request.type === 'manifest') {
      send({ type: 'artifact', jobId: request.jobId, artifact: { filename: 'dataforge-manifest.json', mime: 'application/json', contents: JSON.stringify(manifest ?? { note: 'Transformed or pairwise data; no generation manifest' }, null, 2) } }); return;
    }
    records = []; datasets = {}; manifest = undefined;
    let report: string | undefined;
    if (request.type === 'generate') {
      const registry = createGeneratorRegistry(await loadTextProvider([request.config.locale, ...locales(request.config.schema.fields)]));
      const session = new GenerationSession(request.config, registry);
      const validateJson = request.jsonSchema ? compileJsonValidator(request.jsonSchema) : undefined;
      while (session.completed < request.config.count) {
        const batch = session.nextBatch(500);
        for (const [i, row] of batch.entries()) {
          const issues = validateRecord(row, request.config);
          if (issues.length) throw new DomainError('GENERATED_VALIDATION', `${issues[0].code}: ${issues[0].message}`, issues[0].path);
          if (validateJson && !validateJson(row)) throw new DomainError('JSON_SCHEMA_VALIDATION', 'Generated data violates the imported JSON Schema; adjust explicit generator settings');
          const index = records.length;
          if (request.negative && ((index * 2654435761) >>> 0) / 4294967296 < request.negative.rate) {
            const negative = negativeCase(row, request.config, request.negative.field, request.negative.category, session.completed - batch.length + i);
            records.push({ ...negative.record, _testCase: { caseId: negative.caseId, category: negative.category, fieldPath: negative.fieldPath, expectedViolation: negative.expectedViolation, isolated: negative.isolated, issues: negative.issues.map(item => ({ ...item })) } });
          } else records.push(row);
        }
        send({ type: 'progress', jobId: request.jobId, completed: session.completed, total: request.config.count });
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
      manifest = session.manifest();
      report = request.negative ? 'Negative records include _testCase metadata and all actual validation issues.' : undefined;
    } else if (request.type === 'datasets') {
      const registry = createGeneratorRegistry(await loadTextProvider([request.config.locale, ...request.definitions.flatMap(definition => locales(definition.schema.fields))]));
      datasets = generateDatasets(request.definitions, request.config, registry);
      records = Object.values(datasets)[0] ?? [];
      report = 'Preview shows the first dataset. Select each dataset when exporting.';
    } else if (request.type === 'pairwise') {
      const result = generatePairwise(request.input);
      records = result.rows;
      report = `${result.coveredPairs}/${result.totalPairs} allowed pairs covered. ${result.complete ? 'Complete coverage.' : 'Incomplete: row limit reached.'}`;
    } else if (request.type === 'transform') {
      records = await transformRecords(request.records, request.rules, request.secret);
      report = 'Local transformation complete. Masking and pseudonymization do not guarantee anonymity.';
    }
    send({ type: 'result', jobId: request.jobId, preview: records.slice(0, 250), count: Object.keys(datasets).length ? Object.values(datasets).reduce((total, values) => total + values.length, 0) : records.length, manifest, datasets: Object.entries(datasets).map(([name, rows]) => ({ name, count: rows.length })), report });
  } catch (error) { send({ type: 'error', jobId: request.jobId, message: errorMessage(error) }); }
};
