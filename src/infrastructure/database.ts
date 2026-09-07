import Dexie, { type Table } from 'dexie';
import type { DataSchema, GenerationManifest, ReferencePool } from '../domain/types';
import { DomainError } from '../domain/errors';

export interface SavedTemplate { id: string; name: string; schema: DataSchema; updatedAt: string }
export interface TemplateRevision { key: string; templateId: string; version: number; schema: DataSchema; savedAt: string }
export interface HistoryEntry { id: string; manifest: GenerationManifest; savedAt: string }
export class DataForgeDatabase extends Dexie {
  templates!: Table<SavedTemplate, string>;
  revisions!: Table<TemplateRevision, string>;
  sources!: Table<ReferencePool, string>;
  history!: Table<HistoryEntry, string>;
  constructor(name = 'dataforge') {
    super(name);
    this.version(1).stores({ templates: 'id, name, updatedAt' });
    this.version(2).stores({ templates: 'id, name, updatedAt', revisions: 'key, templateId, version', sources: 'source.id, kind', history: 'id, savedAt' }).upgrade(async transaction => {
      const templates = await transaction.table('templates').toArray() as SavedTemplate[];
      await transaction.table('revisions').bulkPut(templates.map(template => ({ key: `${template.id}:1`, templateId: template.id, version: 1, schema: template.schema, savedAt: template.updatedAt })));
    });
  }
}
export const database = new DataForgeDatabase();
export class TemplateRepository {
  constructor(private readonly db: DataForgeDatabase = database) {}
  async list(): Promise<SavedTemplate[]> { return this.db.templates.orderBy('updatedAt').reverse().toArray(); }
  async save(schema: DataSchema, existingId?: string): Promise<SavedTemplate> {
    try {
      return await this.db.transaction('rw', this.db.templates, this.db.revisions, async () => {
        const previous = existingId ? await this.db.templates.get(existingId) : undefined;
        const id = previous?.id ?? crypto.randomUUID();
        const version = (previous?.schema.version ?? 0) + 1;
        const updatedAt = new Date().toISOString();
        const saved = { id, name: schema.name, schema: { ...structuredClone(schema), id, version }, updatedAt };
        await this.db.templates.put(saved);
        await this.db.revisions.put({ key: `${id}:${version}`, templateId: id, version, schema: saved.schema, savedAt: updatedAt });
        return saved;
      });
    } catch (error) {
      if (error instanceof Error && /quota/i.test(error.name + error.message)) throw new DomainError('STORAGE_QUOTA', 'Storage is full. Export your templates before removing stored data');
      throw new DomainError('STORAGE_SAVE', 'Local storage could not save the template; export it as JSON');
    }
  }
  async revisions(id: string): Promise<TemplateRevision[]> { return this.db.revisions.where('templateId').equals(id).sortBy('version'); }
  async restore(id: string, version: number): Promise<SavedTemplate> {
    const revision = await this.db.revisions.get(`${id}:${version}`);
    if (!revision) throw new DomainError('REVISION_MISSING', 'Template version not found');
    return this.save(revision.schema, id);
  }
}
