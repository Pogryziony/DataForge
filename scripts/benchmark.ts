import { cpus } from 'node:os';
import { performance } from 'node:perf_hooks';
import { GenerationSession } from '../src/domain/engine';
import { createGeneratorRegistry } from '../src/domain/generators';
import { loadTextProvider } from '../src/infrastructure/faker';
import { exportRecords } from '../src/infrastructure/exports';
import type { DataRecord, GenerationConfig } from '../src/domain/types';

const registry = createGeneratorRegistry(await loadTextProvider(['da']));
console.log(
  JSON.stringify({
    runtime: process.version,
    cpu: cpus()[0]?.model,
    platform: process.platform,
    note: 'Node engine/export benchmark; not a browser responsiveness or peak-memory claim.',
  }),
);
for (const count of [1000, 10000, 100000]) {
  const config: GenerationConfig = {
    count,
    seed: 'benchmark-v1',
    locale: 'da',
    referenceDate: '2026-09-07',
    schema: {
      id: 'benchmark',
      name: 'Simple records',
      version: 1,
      fields: [
        { id: 'id', name: 'id', generator: 'uuid' },
        { id: 'cpr', name: 'cpr', generator: 'cpr' },
        { id: 'amount', name: 'amount', generator: 'integer', options: { min: 0, max: 100000 } },
      ],
    },
  };
  const start = performance.now();
  const session = new GenerationSession(config, registry);
  const records: DataRecord[] = [];
  while (session.completed < count) records.push(...session.nextBatch(500));
  const generated = performance.now();
  const artifact = await exportRecords(records, 'csv');
  const end = performance.now();
  console.log(
    JSON.stringify({
      count,
      generationMs: Math.round(generated - start),
      csvExportMs: Math.round(end - generated),
      csvBytes: new TextEncoder().encode(String(artifact.contents)).length,
      heapUsedMiB: Math.round(process.memoryUsage().heapUsed / 1048576),
    }),
  );
}
