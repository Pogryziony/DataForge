import type { DatasetDefinition } from '../domain/datasets';
import type { GenerationConfig, GenerationManifest, DataRecord } from '../domain/types';
import type { ExportArtifact, ExportFormat, ExportOptions } from '../infrastructure/exports';
import type { CodeTarget } from '../domain/codegen';
import type { Mutation, PairwiseInput } from '../domain/scenarios';
import type { TransformRule } from '../domain/transforms';

export type WorkerRequest =
  | { type: 'generate'; jobId: string; config: GenerationConfig; negative?: { field: string; category: Mutation; rate: number }; jsonSchema?: object }
  | { type: 'datasets'; jobId: string; definitions: DatasetDefinition[]; config: GenerationConfig }
  | { type: 'pairwise'; jobId: string; input: PairwiseInput }
  | { type: 'transform'; jobId: string; records: DataRecord[]; rules: TransformRule[]; secret: string }
  | { type: 'export'; jobId: string; format: ExportFormat; options: ExportOptions; dataset?: string }
  | { type: 'code'; jobId: string; target: CodeTarget }
  | { type: 'manifest'; jobId: string };
export type WorkerResponse =
  | { type: 'progress'; jobId: string; completed: number; total: number }
  | { type: 'result'; jobId: string; preview: DataRecord[]; count: number; manifest?: GenerationManifest; datasets?: { name: string; count: number }[]; report?: string }
  | { type: 'artifact'; jobId: string; artifact: ExportArtifact }
  | { type: 'error'; jobId: string; message: string };
