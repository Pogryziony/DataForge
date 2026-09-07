import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { expect, it } from 'vitest';
import { DataForgeDatabase, TemplateRepository } from './database';
import { TEMPLATES } from '../domain/templates';

it('saves revisions and restores without overwriting history', async () => {
  const db = new DataForgeDatabase('test-revisions');
  const repository = new TemplateRepository(db);
  const saved = await repository.save(TEMPLATES[0].schema);
  await repository.save({ ...saved.schema, name: 'Changed' }, saved.id);
  const restored = await repository.restore(saved.id, 1);
  expect(restored.name).toBe(TEMPLATES[0].name);
  expect(restored.schema.version).toBe(3);
  expect(await repository.revisions(saved.id)).toHaveLength(3);
  await db.delete();
});
it('migrates an existing v1 template to version history', async () => {
  const old = new Dexie('test-migration');
  old.version(1).stores({ templates: 'id, name, updatedAt' });
  await old.table('templates').put({ id: 'one', name: 'Old', schema: TEMPLATES[0].schema, updatedAt: '2026-01-01' });
  old.close();
  const current = new DataForgeDatabase('test-migration');
  expect(await current.revisions.count()).toBe(1);
  await current.delete();
});
