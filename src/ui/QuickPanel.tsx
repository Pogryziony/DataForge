import { useState } from 'react';
import { Braces, Search, Zap } from 'lucide-react';
import type { GeneratorDefinition } from '../domain/generators';
import type { JsonValue } from '../domain/types';
import { parseSafeJson } from '../infrastructure/imports';
import { errorMessage } from '../domain/errors';
import { useText } from './preferences';

export function QuickPanel({ generator, setGenerator, options, setOptions, catalogue }: {
  generator: string; setGenerator(value: string): void; options: Record<string, JsonValue>;
  setOptions(value: Record<string, JsonValue>): void; catalogue: Pick<GeneratorDefinition, 'id' | 'label' | 'category'>[];
}) {
  const t = useText();
  const [search, setSearch] = useState('');
  const [raw, setRaw] = useState('');
  const [error, setError] = useState('');
  const current = catalogue.find(item => item.id === generator);
  return <section className="panel editor-panel"><div className="panel-heading"><div><span className="eyebrow">01 / {t('GENERATOR', 'GENERATOR')}</span><h2>{t('What do you need?', 'Jakich danych potrzebujesz?')}</h2></div><Zap size={20} /></div>
    <label className="search-label"><Search size={16} /><input aria-label={t('Search generators', 'Szukaj generatorów')} placeholder={t('Search generators…', 'Szukaj generatorów…')} value={search} onChange={event => setSearch(event.target.value)} /></label>
    <label>{t('Data type', 'Typ danych')}<select aria-label={t("Data type", "Typ danych")} value={generator} onChange={event => { setGenerator(event.target.value); setOptions(event.target.value === 'cpr' ? { profile: 'standard', formatted: true } : event.target.value === 'enum' ? { values: ['active', 'inactive'] } : event.target.value === 'iban' ? { country: 'DK' } : {}); }}>
      {[...new Set(catalogue.map(item => item.category))].map(category => <optgroup label={category} key={category}>{catalogue.filter(item => item.category === category && (`${item.label} ${category}`.toLowerCase().includes(search.toLowerCase()) || item.id === generator)).map(item => <option value={item.id} key={item.id}>{item.label}</option>)}</optgroup>)}
    </select></label>
    <div className="generator-summary"><span className="type-icon"><Braces size={22} /></span><div><strong>{current?.label ?? 'CPR'}</strong><span>{current?.category ?? 'Denmark'} · {t('Synthetic test data', 'Syntetyczne dane testowe')}</span></div><span className="tag">{generator === 'dar' ? 'IMPORT' : 'LOCAL'}</span></div>
    {generator === 'cpr' && <><label>{t('Validation profile', 'Profil walidacji')}<select value={String(options.profile ?? 'standard')} onChange={event => setOptions({ ...options, profile: event.target.value })}><option value="standard">Standard · no mandatory mod11</option><option value="legacy-mod11">Legacy · modulus 11</option><option value="official-test-pool">Imported official test pool</option></select></label><div className="notice compact">{t('Standard CPR does not require modulus 11. Generated numbers are not checked against the registry.', 'Standard CPR nie wymaga modulus 11. Wygenerowane numery nie są sprawdzane w rejestrze.')}</div><label className="checkbox"><input type="checkbox" checked={Boolean(options.formatted)} onChange={event => setOptions({ ...options, formatted: event.target.checked })} />DDMMYY-XXXX</label></>}
    {['cpr', 'pesel', 'age', 'birthDate'].includes(generator) && <div className="form-grid"><label>{t('Birth date (optional)', 'Data urodzenia (opcjonalnie)')}<input type="date" value={String(options.birthDate ?? '')} onChange={event => setOptions({ ...options, birthDate: event.target.value })} /></label><label>{t('Encoded sex', 'Płeć kodowana')}<select value={String(options.sex ?? '')} onChange={event => { const next = { ...options }; if (event.target.value) next.sex = event.target.value; else delete next.sex; setOptions(next); }}><option value="">{t('Random', 'Losowo')}</option><option value="female">{t('Female', 'Kobieta')}</option><option value="male">{t('Male', 'Mężczyzna')}</option></select></label></div>}
    {['integer', 'decimal', 'amount'].includes(generator) && <div className="form-grid"><label>Min<input type="number" value={Number(options.min ?? 0)} onChange={event => setOptions({ ...options, min: Number(event.target.value) })} /></label><label>Max<input type="number" value={Number(options.max ?? 1000)} onChange={event => setOptions({ ...options, max: Number(event.target.value) })} /></label></div>}
    {generator === 'regon' && <label>{t('Length', 'Długość')}<select value={Number(options.length ?? 9)} onChange={event => setOptions({ ...options, length: Number(event.target.value) })}><option value={9}>9</option><option value={14}>14</option></select></label>}
    {generator === 'iban' && <label>{t('IBAN country', 'Kraj IBAN')}<select value={String(options.country ?? 'DK')} onChange={event => setOptions({ ...options, country: event.target.value })}><option>DK</option><option>PL</option><option>DE</option><option>GB</option></select></label>}
    {generator === 'dar' && <div className="notice">{t('Import a normalized DAR pool first. Original identifiers are preserved; authenticity is not checked online.', 'Najpierw zaimportuj znormalizowaną pulę DAR. Identyfikatory są zachowane; autentyczność nie jest sprawdzana online.')}</div>}
    <details onToggle={event => { if (event.currentTarget.open) setRaw(JSON.stringify(options, null, 2)); }}><summary>{t('Advanced generator options', 'Zaawansowane opcje generatora')}</summary><label>JSON<textarea className="code-input" value={raw} onChange={event => setRaw(event.target.value)} /></label><button onClick={() => { try { const value = parseSafeJson(raw); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Options must be an object'); setOptions(value); setError(''); } catch (error) { setError(errorMessage(error)); } }}>{t('Apply options', 'Zastosuj opcje')}</button></details>{error && <p role="alert" className="error-text">{error}</p>}
  </section>;
}
