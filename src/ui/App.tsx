import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Braces,
  Zap,
  SlidersHorizontal,
  Network,
  FlaskConical,
  FileInput,
  Layers,
  Moon,
  Sun,
  ShieldCheck,
  Play,
  Square,
  Save,
  FileJson,
  History,
  UserRound,
} from 'lucide-react';
import { Preview } from './Preview';
import { SchemaEditor } from './SchemaEditor';
import { QuickPanel } from './QuickPanel';
import { ResidentPanel, ResidentDetails } from './ResidentPanel';
import { createResidentSchema, type Housing } from '../domain/residents';
import { ExportPanel } from './ExportPanel';
import { OfflineStatus } from './OfflineStatus';
import { DatasetPanel, ImportPanel, TemplatePanel } from './AdvancedPanels';
import { usePreferences, useText } from './preferences';
import { useWorkbench } from './useWorkbench';
import { createGeneratorRegistry, type GeneratorDefinition } from '../domain/generators';
import { loadTextProvider } from '../infrastructure/faker';
import { TEMPLATES } from '../domain/templates';
import { errorMessage } from '../domain/errors';
import { downloadArtifact } from '../infrastructure/exports';
import { importJsonSchema } from '../domain/json-schema';
import { parseSafeJson } from '../infrastructure/imports';
import { database, TemplateRepository, type HistoryEntry } from '../infrastructure/database';
import { boundaryValues, type Mutation } from '../domain/scenarios';
import type { DataSchema, GenerationConfig, JsonValue, ReferencePool } from '../domain/types';

const settingsSchema = z.object({
  count: z.number().int().min(1).max(100000),
  seed: z.string().min(1).max(1000),
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  locale: z.enum(['pl', 'da', 'de', 'en_GB', 'en_US']),
});
type Settings = z.infer<typeof settingsSchema>;
const cataloguePromise = loadTextProvider(['pl']).then((provider) =>
  [...createGeneratorRegistry(provider).values()].map(({ id, label, category }) => ({
    id,
    label,
    category,
  })),
);

export function App() {
  const t = useText();
  const preferences = usePreferences();
  const workbench = useWorkbench();
  const navigate = useNavigate();
  const location = useLocation();
  const route = location.pathname === '/' ? '/quick' : location.pathname;
  const [catalogue, setCatalogue] = useState<
    Pick<GeneratorDefinition, 'id' | 'label' | 'category'>[]
  >([]);
  const [generator, setGenerator] = useState('cpr');
  const [options, setOptions] = useState<Record<string, JsonValue>>({
    profile: 'standard',
    formatted: true,
  });
  const [schema, setSchema] = useState<DataSchema>(structuredClone(TEMPLATES[1].schema));
  const [savedId, setSavedId] = useState<string>();
  const [dirty, setDirty] = useState(false);
  const [jsonSchema, setJsonSchema] = useState<object>();
  const [pools, setPools] = useState<ReferencePool[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [negativeField, setNegativeField] = useState('cpr');
  const [mutation, setMutation] = useState<Mutation>('missing');
  const [negativeRate, setNegativeRate] = useState(1);
  const [housing, setHousing] = useState<Housing>('mixed');
  const {
    register,
    handleSubmit,
    watch,
    getValues,
    reset,
    setValue,
    formState: { errors },
  } = useForm<Settings>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      count: 10,
      seed: 'dataforge-demo-1',
      referenceDate: '2026-09-07',
      locale: 'da',
    },
  });
  const settings = watch();
  const { setError, setNotice } = workbench;
  useEffect(() => {
    void cataloguePromise.then(setCatalogue).catch((error) => setError(errorMessage(error)));
    void database.sources
      .toArray()
      .then(setPools)
      .catch(() =>
        setNotice('Saved reference pools are unavailable. Import them again for this session.'),
      );
  }, [setError, setNotice]);
  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme;
    document.documentElement.lang = preferences.language;
  }, [preferences.theme, preferences.language]);
  useEffect(() => {
    const listener = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener('beforeunload', listener);
    return () => window.removeEventListener('beforeunload', listener);
  }, [dirty]);
  const config: GenerationConfig = { ...settings, schema, pools };
  const changeSchema = (next: DataSchema) => {
    setSchema(next);
    setDirty(true);
    setJsonSchema(undefined);
  };
  const selectSchema = (next: DataSchema, nextSavedId?: string) => {
    if (
      dirty &&
      !window.confirm(t('Discard unsaved schema changes?', 'Odrzucić niezapisane zmiany schematu?'))
    )
      return;
    setSchema(structuredClone(next));
    setSavedId(nextSavedId);
    setDirty(false);
    setJsonSchema(undefined);
    setNegativeField(next.fields[0]?.name ?? '');
    navigate('/schema');
  };
  const submit = handleSubmit((values) => {
    const activeSchema =
      route === '/quick'
        ? {
            id: 'quick',
            name: catalogue.find((item) => item.id === generator)?.label ?? generator,
            version: 1,
            fields: [{ id: 'value', name: 'value', generator, options, required: true }],
          }
        : route === '/resident'
          ? createResidentSchema(values.locale, housing)
          : schema;
    workbench.run({
      type: 'generate',
      config: { ...values, schema: activeSchema, pools },
      ...(route === '/negative'
        ? { negative: { field: negativeField, category: mutation, rate: negativeRate } }
        : {}),
      ...(['/schema', '/negative'].includes(route) && jsonSchema ? { jsonSchema } : {}),
    });
  });
  async function saveSchema() {
    try {
      const saved = await new TemplateRepository().save(schema, savedId);
      setSchema(saved.schema);
      setSavedId(saved.id);
      setDirty(false);
      setRefreshKey((value) => value + 1);
      setNotice(t('Template saved on this device.', 'Szablon zapisano na tym urządzeniu.'));
    } catch (error) {
      setError(errorMessage(error));
    }
  }
  const navigation = [
    { path: '/quick', icon: Zap, label: t('Quick generate', 'Szybkie generowanie') },
    { path: '/resident', icon: UserRound, label: t('Resident dataset', 'Dane mieszkańca') },
    { path: '/schema', icon: SlidersHorizontal, label: t('Schema designer', 'Edytor schematu') },
    { path: '/datasets', icon: Network, label: t('Dataset builder', 'Kreator zbiorów') },
    { path: '/negative', icon: FlaskConical, label: t('Negative cases', 'Przypadki negatywne') },
    { path: '/import', icon: FileInput, label: t('Import & transform', 'Import i transformacja') },
    { path: '/templates', icon: Layers, label: t('Templates', 'Szablony') },
  ];
  const title =
    navigation.find((item) => item.path === route)?.label ??
    t('Quick generate', 'Szybkie generowanie');
  const showGenerate = ['/quick', '/resident', '/schema', '/negative'].includes(route);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <NavLink to="/quick" className="brand">
          <span className="brand-icon">
            <Braces size={25} />
          </span>
          <span>
            DataForge<small>TEST DATA WORKBENCH</small>
          </span>
        </NavLink>
        <div className="nav-label">{t('WORKSPACE', 'PRZESTRZEŃ ROBOCZA')}</div>
        <nav aria-label={t('Main navigation', 'Nawigacja główna')}>
          {navigation.map(({ path, icon: Icon, label }) => (
            <NavLink
              className={({ isActive }) =>
                isActive || route === path ? 'nav-item active' : 'nav-item'
              }
              to={path}
              key={path}
            >
              <Icon size={18} />
              <span>{label}</span>
              {path === '/templates' && <small>{TEMPLATES.length}</small>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-card">
            <ShieldCheck size={20} />
            <strong>{t('Local by design', 'Dane lokalne')}</strong>
            <p>
              {t(
                'Your datasets stay in this browser. No accounts. No uploads.',
                'Twoje zbiory pozostają w przeglądarce. Bez kont i wysyłania danych.',
              )}
            </p>
          </div>
          <a href="https://github.com/Pogryziony/DataForge" target="_blank" rel="noreferrer">
            GitHub <span>DataForge v1.1</span>
          </a>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            {t('Workspace', 'Przestrzeń robocza')} <span>/</span> <strong>{title}</strong>
          </div>
          <div className="top-actions">
            <span className="local-badge">
              <ShieldCheck size={14} />
              {t('Local processing', 'Przetwarzanie lokalne')}
            </span>
            <select
              aria-label={t('Interface language', 'Język interfejsu')}
              value={preferences.language}
              onChange={(event) => preferences.setLanguage(event.target.value as 'en' | 'pl')}
            >
              <option value="en">EN</option>
              <option value="pl">PL</option>
            </select>
            <button
              className="icon-button"
              aria-label={t('Toggle theme', 'Zmień motyw')}
              onClick={() => preferences.setTheme(preferences.theme === 'light' ? 'dark' : 'light')}
            >
              {preferences.theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
          </div>
        </header>
        <div className="workspace">
          <div className="page-heading">
            <div>
              <div className="eyebrow">{t('REPRODUCIBLE BY DEFAULT', 'DOMYŚLNIE POWTARZALNE')}</div>
              <h1>{title}</h1>
              <p>
                {t('Purpose-built data for your next test.', 'Dane dopasowane do kolejnego testu.')}
              </p>
            </div>
            <div className="heading-actions">
              <button
                onClick={() => {
                  setShowHistory(!showHistory);
                  void database.history
                    .orderBy('savedAt')
                    .reverse()
                    .limit(20)
                    .toArray()
                    .then(setHistory)
                    .catch((error) => setError(errorMessage(error)));
                }}
              >
                <History size={16} />
                {t('History', 'Historia')}
              </button>
              {showGenerate &&
                (workbench.busy ? (
                  <button
                    key="cancel"
                    type="button"
                    className="danger-button"
                    onClick={workbench.cancel}
                  >
                    <Square size={15} />
                    {t('Cancel', 'Anuluj')}
                  </button>
                ) : (
                  <button
                    key="generate"
                    className="primary"
                    type="submit"
                    form="generation-settings"
                    disabled={!catalogue.length}
                  >
                    <Play size={16} />
                    {t('Generate data', 'Generuj dane')}
                  </button>
                ))}
            </div>
          </div>
          <OfflineStatus />
          {workbench.notice && (
            <div className="notice dismissible" role="status">
              <span>{workbench.notice}</span>
              <button onClick={() => setNotice('')}>{t('Dismiss', 'Zamknij')}</button>
            </div>
          )}
          {showHistory && (
            <section className="panel history">
              <h2>{t('Recent configurations', 'Ostatnie konfiguracje')}</h2>
              {!history.length && (
                <p>{t('No saved generation history.', 'Brak zapisanej historii generowania.')}</p>
              )}
              {history.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => {
                    selectSchema(entry.manifest.schema);
                    reset({
                      count: entry.manifest.count,
                      locale: entry.manifest.locale,
                      seed: entry.manifest.seed,
                      referenceDate: entry.manifest.referenceDate,
                    });
                    setShowHistory(false);
                  }}
                >
                  {entry.manifest.schema.name} · {entry.manifest.count} ·{' '}
                  <code>{entry.manifest.seed}</code>
                </button>
              ))}
            </section>
          )}
          <div className="work-grid">
            <div className="configuration-column">
              {route === '/resident' && (
                <ResidentPanel
                  locale={settings.locale}
                  onLocale={(locale) => setValue('locale', locale)}
                  housing={housing}
                  onHousing={setHousing}
                  onEdit={() => selectSchema(createResidentSchema(settings.locale, housing))}
                />
              )}
              {route === '/quick' && (
                <QuickPanel
                  generator={generator}
                  setGenerator={setGenerator}
                  options={options}
                  setOptions={setOptions}
                  catalogue={catalogue}
                />
              )}
              {['/schema', '/negative'].includes(route) && (
                <>
                  <SchemaEditor schema={schema} onChange={changeSchema} catalogue={catalogue} />
                  <div className="schema-tools">
                    <button onClick={() => void saveSchema()}>
                      <Save size={16} />
                      {t('Save template', 'Zapisz szablon')}
                      {dirty ? ' *' : ''}
                    </button>
                    <button
                      onClick={() =>
                        downloadArtifact({
                          filename: 'dataforge-schema.json',
                          mime: 'application/json',
                          contents: JSON.stringify(schema, null, 2),
                        })
                      }
                    >
                      <FileJson size={16} />
                      {t('Export schema', 'Eksport schematu')}
                    </button>
                  </div>
                  <label className="file-label">
                    {t(
                      'Import configuration or JSON Schema',
                      'Importuj konfigurację lub JSON Schema',
                    )}
                    <input
                      type="file"
                      accept=".json"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file)
                          void file
                            .text()
                            .then((text) => {
                              const parsed = parseSafeJson(text);
                              if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
                                throw new Error('Expected schema object');
                              if (Array.isArray(parsed.fields))
                                changeSchema(parsed as unknown as DataSchema);
                              else {
                                changeSchema(importJsonSchema(parsed));
                                setJsonSchema(parsed);
                              }
                              setSavedId(undefined);
                            })
                            .catch((error) => setError(errorMessage(error)));
                      }}
                    />
                  </label>
                </>
              )}
              {route === '/negative' && (
                <section className="panel editor-panel">
                  <h2>{t('Controlled mutation', 'Kontrolowana mutacja')}</h2>
                  <label>
                    {t('Target field', 'Pole docelowe')}
                    <select
                      value={negativeField}
                      onChange={(event) => setNegativeField(event.target.value)}
                    >
                      {schema.fields.map((field) => (
                        <option key={field.id} value={field.name}>
                          {field.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t('Mutation', 'Mutacja')}
                    <select
                      aria-label={t('Mutation', 'Mutacja')}
                      value={mutation}
                      onChange={(event) => setMutation(event.target.value as Mutation)}
                    >
                      {[
                        'missing',
                        'null',
                        'empty',
                        'type',
                        'length',
                        'range',
                        'date',
                        'checksum',
                        'unicode',
                        'foreignKey',
                      ].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t('Negative record share', 'Udział rekordów negatywnych')}
                    <select
                      value={negativeRate}
                      onChange={(event) => setNegativeRate(Number(event.target.value))}
                    >
                      <option value={1}>100%</option>
                      <option value={0.5}>50%</option>
                      <option value={0.1}>10%</option>
                    </select>
                  </label>
                  <p className="muted">
                    {t(
                      'All resulting rule violations are reported, including secondary dependency errors.',
                      'Raport zawiera wszystkie naruszenia, również wtórne błędy zależności.',
                    )}
                  </p>
                  <button
                    onClick={() => {
                      try {
                        const field = schema.fields.find((field) => field.name === negativeField);
                        const values = boundaryValues(
                          Number(field?.options?.min ?? 0),
                          Number(field?.options?.max ?? 100),
                        );
                        downloadArtifact({
                          filename: 'dataforge-boundaries.json',
                          mime: 'application/json',
                          contents: JSON.stringify(values, null, 2),
                        });
                      } catch (error) {
                        setError(errorMessage(error));
                      }
                    }}
                  >
                    {t('Export numeric boundaries', 'Eksportuj granice liczbowe')}
                  </button>
                </section>
              )}
              {route === '/datasets' && (
                <DatasetPanel
                  config={{ ...config, ...getValues() }}
                  run={workbench.run}
                  busy={workbench.busy}
                />
              )}
              {route === '/import' && (
                <ImportPanel
                  config={config}
                  run={workbench.run}
                  busy={workbench.busy}
                  pools={pools}
                  onPool={(pool) =>
                    setPools((values) => [
                      ...values.filter((value) => value.source.id !== pool.source.id),
                      pool,
                    ])
                  }
                />
              )}
              {route === '/templates' && (
                <TemplatePanel onSelect={selectSchema} refreshKey={refreshKey} />
              )}
              <form id="generation-settings" className="panel settings-panel" onSubmit={submit}>
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">{t('GENERATION', 'GENEROWANIE')}</span>
                    <h2>{t('Run settings', 'Ustawienia uruchomienia')}</h2>
                  </div>
                </div>
                <div className="form-grid">
                  <label>
                    {t('Records', 'Rekordy')}
                    <input
                      type="number"
                      min={1}
                      max={100000}
                      {...register('count', { valueAsNumber: true })}
                    />
                  </label>
                  <label>
                    {t('Data locale', 'Lokalizacja danych')}
                    <select {...register('locale')}>
                      <option value="da">Denmark · da-DK</option>
                      <option value="pl">Poland · pl-PL</option>
                      <option value="de">Germany · de-DE</option>
                      <option value="en_GB">United Kingdom · en-GB</option>
                      <option value="en_US">United States · en-US</option>
                    </select>
                  </label>
                </div>
                <label>
                  Seed
                  <input {...register('seed')} spellCheck={false} />
                </label>
                <label>
                  {t('Reference date', 'Data referencyjna')}
                  <input type="date" {...register('referenceDate')} />
                </label>
                {Object.entries(errors).map(([key, error]) => (
                  <p role="alert" className="error-text" key={key}>
                    {key}: {error.message}
                  </p>
                ))}
                <small>
                  {t(
                    'Same schema + seed + reference date + engine and source versions = the same records.',
                    'Ten sam schemat + seed + data referencyjna + wersje silnika i źródeł = te same rekordy.',
                  )}
                </small>
                {showGenerate && (
                  <button
                    className="primary wide"
                    disabled={workbench.busy || !catalogue.length}
                    type="submit"
                  >
                    <Play size={15} />
                    {t('Generate data', 'Generuj dane')}
                  </button>
                )}
                {workbench.busy && (
                  <button type="button" className="wide" onClick={workbench.cancel}>
                    <Square size={15} />
                    {t('Cancel current operation', 'Anuluj bieżącą operację')}
                  </button>
                )}
              </form>
            </div>
            <div className="results-column">
              {route === '/resident' && <ResidentDetails rows={workbench.rows} />}
              <Preview
                rows={workbench.rows}
                count={workbench.count}
                busy={workbench.busy}
                progress={workbench.progress}
                error={workbench.error}
                report={workbench.report}
              />
              <ExportPanel
                count={workbench.count}
                busy={workbench.busy}
                manifest={workbench.manifest}
                datasets={workbench.datasets}
                run={workbench.run}
              />
              <div className="safety-note">
                <ShieldCheck size={18} />
                <p>
                  {t(
                    'Test environments only. Synthetic identifiers can coincide with real identifiers. Local validation does not confirm that a person, address, business or account exists.',
                    'Wyłącznie do środowisk testowych. Identyfikatory syntetyczne mogą pokrywać się z rzeczywistymi. Walidacja lokalna nie potwierdza istnienia osoby, adresu, firmy ani rachunku.',
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
