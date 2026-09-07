import { useEffect, useState } from 'react';
import { FileUp, Play, RotateCcw } from 'lucide-react';
import type { DataRecord, DataSchema, GenerationConfig, ReferencePool } from '../domain/types';
import { TEMPLATES, RELATIONAL_TEMPLATE } from '../domain/templates';
import type { DatasetDefinition } from '../domain/datasets';
import type { PairwiseInput } from '../domain/scenarios';
import type { TransformRule } from '../domain/transforms';
import { importRecords, importReferencePool, mapColumns, MAX_IMPORT_BYTES, parseSafeJson } from '../infrastructure/imports';
import { database, TemplateRepository, type SavedTemplate, type TemplateRevision } from '../infrastructure/database';
import { errorMessage } from '../domain/errors';
import { downloadArtifact } from '../infrastructure/exports';
import type { WorkerAction } from '../workers/protocol';
import { useText } from './preferences';

export function DatasetPanel({ config, run, busy }: { config: GenerationConfig; run(action: WorkerAction): void; busy: boolean }) {
  const t = useText();
  const [mode, setMode] = useState<'relations' | 'pairwise'>('relations');
  const [relations, setRelations] = useState(JSON.stringify(RELATIONAL_TEMPLATE, null, 2));
  const [pairwise, setPairwise] = useState(JSON.stringify({ parameters: { country: ['PL', 'DK'], customerType: ['person', 'company'], status: ['active', 'inactive'] }, forbidden: [{ country: 'DK', customerType: 'company', status: 'inactive' }], maxRows: 100 }, null, 2));
  const [error, setError] = useState('');
  return <section className="panel editor-panel"><div className="panel-heading"><div><span className="eyebrow">{t('SCENARIOS', 'SCENARIUSZE')}</span><h2>{t('Dataset builder', 'Kreator zbiorów')}</h2></div></div><div className="segmented"><button aria-pressed={mode === 'relations'} onClick={() => setMode('relations')}>{t('Relations', 'Relacje')}</button><button aria-pressed={mode === 'pairwise'} onClick={() => setMode('pairwise')}>Pairwise</button></div><p className="muted">{mode === 'relations' ? t('Define named datasets and foreignKey rules. Parent datasets are generated first. The seed and locale below apply to all sets.', 'Zdefiniuj zbiory i reguły foreignKey. Zbiory nadrzędne powstaną jako pierwsze. Seed i lokalizacja dotyczą wszystkich zbiorów.') : t('Finite parameters, forbidden combinations and explicit coverage. Maximum candidate space: 10,000.', 'Parametry skończone, zabronione kombinacje i raport pokrycia. Limit przestrzeni kandydatów: 10 000.')}</p><label>{t('Configuration JSON', 'Konfiguracja JSON')}<textarea className="code-input tall" spellCheck={false} value={mode === 'relations' ? relations : pairwise} onChange={event => mode === 'relations' ? setRelations(event.target.value) : setPairwise(event.target.value)} /></label>{error && <p className="notice danger" role="alert">{error}</p>}<button className="primary" disabled={busy} onClick={() => { try { setError(''); if (mode === 'relations') run({ type: 'datasets', definitions: parseSafeJson(relations) as unknown as DatasetDefinition[], config }); else run({ type: 'pairwise', input: parseSafeJson(pairwise) as unknown as PairwiseInput }); } catch (error) { setError(errorMessage(error)); } }}><Play size={16} />{t('Build dataset', 'Generuj zbiór')}</button></section>;
}

export function ImportPanel({ config, run, busy, onPool, pools }: { config: GenerationConfig; run(action: WorkerAction): void; busy: boolean; onPool(pool: ReferencePool): void; pools: ReferencePool[] }) {
  const t = useText();
  const [records, setRecords] = useState<DataRecord[]>([]);
  const [fileName, setFileName] = useState('');
  const [mapping, setMapping] = useState('{}');
  const [rules, setRules] = useState('[\n  { "field": "email", "operation": "mask", "keepLast": 4 }\n]');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [rememberPool, setRememberPool] = useState(false);
  async function importFile(file: File | undefined, reference: boolean) {
    if (!file) return;
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error('Maximum import size: 20 MiB');
      const text = await file.text();
      if (reference) {
        const pool = importReferencePool(text);
        if (rememberPool) await database.sources.put(pool);
        onPool(pool);
      } else {
        const imported = importRecords(text, file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'json');
        setRecords(imported); setFileName(file.name);
        setMapping(JSON.stringify(Object.fromEntries([...new Set(imported.flatMap(row => Object.keys(row)))].map(key => [key, key])), null, 2));
      }
      setError('');
    } catch (error) { setError(errorMessage(error)); }
  }
  return <section className="panel editor-panel"><div className="panel-heading"><div><span className="eyebrow">{t('LOCAL FILES', 'PLIKI LOKALNE')}</span><h2>{t('Import & transform', 'Import i transformacja')}</h2></div><FileUp size={21} /></div><div className="notice">{t('Imported records stay in memory. They are never uploaded or saved automatically.', 'Importowane rekordy pozostają w pamięci. Nie są wysyłane ani automatycznie zapisywane.')}</div>
    <label className="file-drop">{t('Import JSON or CSV', 'Importuj JSON lub CSV')}<input type="file" accept=".json,.csv" onChange={event => void importFile(event.target.files?.[0], false)} /></label>
    {records.length > 0 && <><p className="muted">{fileName} · {records.length.toLocaleString()} {t('records', 'rekordów')}</p><details><summary>{t('Input preview (first 3 records)', 'Podgląd wejścia (pierwsze 3 rekordy)')}</summary><pre className="small-pre">{JSON.stringify(records.slice(0, 3), null, 2)}</pre></details><label>{t('Column mapping: source → target; empty target removes column', 'Mapowanie: źródło → cel; pusty cel usuwa kolumnę')}<textarea className="code-input" value={mapping} onChange={event => setMapping(event.target.value)} /></label><label>{t('Transform rules', 'Reguły transformacji')}<textarea className="code-input" value={rules} onChange={event => setRules(event.target.value)} /></label><small>mask · remove · pseudonymize · replace · generate · shiftDate · trim · uppercase · lowercase</small><label>{t('Private pseudonymization key (not saved)', 'Prywatny klucz pseudonimizacji (niezapisywany)')}<input type="password" autoComplete="off" value={secret} onChange={event => setSecret(event.target.value)} /></label><button className="primary" disabled={busy} onClick={() => { try { const mapped = mapColumns(records, parseSafeJson(mapping) as Record<string, string>); run({ type: 'transform', records: mapped, rules: parseSafeJson(rules) as unknown as TransformRule[], secret, config }); setSecret(''); setError(''); } catch (error) { setError(errorMessage(error)); } }}>{t('Transform locally', 'Przekształć lokalnie')}</button></>}
    <hr /><h3>{t('Reference pools', 'Zbiory referencyjne')}</h3><p className="muted">{t('Import a normalized DAR pool or a documented CPR test pool with source metadata. Imported source claims are not independently verified.', 'Importuj znormalizowany DAR lub udokumentowaną pulę CPR z metadanymi źródła. Deklaracje źródłowe nie są niezależnie weryfikowane.')}</p><label className="checkbox"><input type="checkbox" checked={rememberPool} onChange={event => setRememberPool(event.target.checked)} />{t('Save this reference pool on this device', 'Zapisz tę pulę na tym urządzeniu')}</label><label>{t('Reference pool JSON', 'JSON puli referencyjnej')}<input type="file" accept=".json" onChange={event => void importFile(event.target.files?.[0], true)} /></label>{pools.map(pool => <div className="source-row" key={pool.source.id}><span className="tag">{pool.kind.toUpperCase()}</span><span>{pool.source.title}<small>{pool.records.length} · {pool.source.version}</small></span></div>)}
    {error && <div className="notice danger" role="alert">{error}</div>}
  </section>;
}

export function TemplatePanel({ onSelect, refreshKey }: { onSelect(schema: DataSchema, savedId?: string): void; refreshKey: number }) {
  const t = useText();
  const [saved, setSaved] = useState<SavedTemplate[]>([]);
  const [revisions, setRevisions] = useState<TemplateRevision[]>([]);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => { let active = true; void new TemplateRepository().list().then(values => { if (active) setSaved(values); }).catch(error => { if (active) setError(errorMessage(error)); }); return () => { active = false; }; }, [refreshKey]);
  return <section className="panel editor-panel"><div className="panel-heading"><div><span className="eyebrow">{t('STARTING POINTS', 'SZABLONY')}</span><h2>{t('Template library', 'Biblioteka szablonów')}</h2></div></div><label>{t('Search templates', 'Szukaj szablonów')}<input value={query} onChange={event => setQuery(event.target.value)} placeholder="CPR, address, invoice…" /></label><div className="template-grid">{TEMPLATES.filter(template => `${template.name} ${template.description}`.toLowerCase().includes(query.toLowerCase())).map(template => <button className="template-card" key={template.id} onClick={() => onSelect(structuredClone(template.schema))}><span className="tag">{template.country}</span><strong>{template.name}</strong><span>{template.description}</span><small>{template.schema.fields.length} {t('fields', 'pól')}</small></button>)}</div><h3>{t('Saved on this device', 'Zapisane na tym urządzeniu')}</h3>{!saved.length && <p className="muted">{t('Save a schema to create your first local template.', 'Zapisz schemat, aby utworzyć pierwszy lokalny szablon.')}</p>}{saved.map(template => <div className="saved-row" key={template.id}><button className="subtle" onClick={() => onSelect(template.schema, template.id)}>{template.name} <span className="tag">v{template.schema.version}</span></button><button className="icon-button" aria-label={t('Version history', 'Historia wersji')} onClick={() => void new TemplateRepository().revisions(template.id).then(setRevisions).catch(error => setError(errorMessage(error)))}><RotateCcw size={16} /></button></div>)}
    {!!revisions.length && <div className="notice"><h3>{t('Restore as a new revision', 'Przywróć jako nową wersję')}</h3>{revisions.map(revision => <button key={revision.key} onClick={() => void new TemplateRepository().restore(revision.templateId, revision.version).then(saved => { onSelect(saved.schema, saved.id); setRevisions([]); }).catch(error => setError(errorMessage(error)))}>v{revision.version} · {revision.savedAt.slice(0, 10)}</button>)}</div>}
    <button onClick={() => void new TemplateRepository().list().then(values => downloadArtifact({ filename: 'dataforge-templates-backup.json', mime: 'application/json', contents: JSON.stringify({ version: 1, templates: values.map(value => value.schema) }, null, 2) })).catch(error => setError(errorMessage(error)))}>{t('Export template backup', 'Eksportuj kopię szablonów')}</button>
    <label>{t('Restore template backup (adds copies)', 'Przywróć kopię szablonów (dodaje kopie)')}<input type="file" accept=".json" onChange={event => { const file = event.target.files?.[0]; if (file) void file.text().then(async text => { const backup = parseSafeJson(text) as unknown as { version: number; templates: DataSchema[] }; if (backup.version !== 1 || !Array.isArray(backup.templates) || backup.templates.length > 100) throw new Error('Invalid template backup'); const repository = new TemplateRepository(); for (const schema of backup.templates) { if (!schema?.name || !Array.isArray(schema.fields)) throw new Error('Invalid template schema'); await repository.save(schema); } setSaved(await repository.list()); }).catch(error => setError(errorMessage(error))); }} /></label>
    {error && <div className="notice danger" role="alert">{error}</div>}
  </section>;
}
