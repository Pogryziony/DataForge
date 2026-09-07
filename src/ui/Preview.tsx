import { useCallback, useMemo, useState } from 'react';
import { useReactTable, getCoreRowModel, getPaginationRowModel, flexRender, type ColumnDef } from '@tanstack/react-table';
import { Check, Copy, Table2, Braces, ChevronLeft, ChevronRight } from 'lucide-react';
import type { DataRecord, JsonValue } from '../domain/types';
import { useText } from './preferences';

const display = (value: JsonValue | undefined) => value === undefined ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);
export function Preview({ rows, count, busy, progress, error, report }: { rows: DataRecord[]; count: number; busy: boolean; progress: number; error: string; report: string }) {
  const t = useText();
  const [mode, setMode] = useState<'table' | 'json'>('table');
  const [copied, setCopied] = useState('');
  const [copyError, setCopyError] = useState('');
  const copy = useCallback(async (value: string, key: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(key); setCopyError(''); setTimeout(() => setCopied(''), 1500); }
    catch { setCopyError(t('Clipboard is unavailable. Use export instead.', 'Schowek jest niedostępny. Użyj eksportu.')); }
  }, [t]);
  const columns = useMemo<ColumnDef<DataRecord>[]>(() => [...new Set(rows.flatMap(row => Object.keys(row)))].map(key => ({
    id: key, accessorFn: row => row[key], header: key,
    cell: context => <button className="cell-copy" title={t('Copy value', 'Kopiuj wartość')} onClick={() => void copy(display(context.getValue() as JsonValue), `${context.row.index}-${key}`)}>{display(context.getValue() as JsonValue)}</button>,
  })), [rows, t, copy]);
  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel(), getPaginationRowModel: getPaginationRowModel(), initialState: { pagination: { pageSize: 20 } } });
  return <section className="preview panel" aria-label={t('Data preview', 'Podgląd danych')}>
    <div className="panel-heading">
      <div><span className="eyebrow">{t('OUTPUT', 'WYNIK')}</span><h2>{t('Data preview', 'Podgląd danych')} <span className="count">{count.toLocaleString()}</span></h2></div>
      <div className="segmented" aria-label={t('Preview format', 'Format podglądu')}>
        <button aria-pressed={mode === 'table'} onClick={() => setMode('table')}><Table2 size={16} />{t('Table', 'Tabela')}</button>
        <button aria-pressed={mode === 'json'} onClick={() => setMode('json')}><Braces size={16} />JSON</button>
      </div>
    </div>
    {busy && <div className="progress-area" role="status"><progress max={100} value={progress} /><span>{t('Processing', 'Przetwarzanie')} · {Math.round(progress)}%</span></div>}
    {error && <div className="notice danger" role="alert">{error}</div>}
    {copyError && <div role="alert" className="notice danger">{copyError}</div>}
    {report && <div className="notice">{report}</div>}
    {!rows.length ? <div className="empty-output"><div className="empty-icon"><Braces size={32} /></div><h3>{t('Your next test starts here', 'Tutaj zaczyna się kolejny test')}</h3><p>{t('Choose a generator, set your constraints and generate a reproducible dataset.', 'Wybierz generator, ustaw ograniczenia i wygeneruj powtarzalny zestaw danych.')}</p><div className="empty-example"><span>seed</span><code>dataforge-demo-1</code><span>output</span><code>{'{ "id": "…", "cpr": "…" }'}</code></div></div> : <>
      <div className="preview-toolbar"><span>{t('Showing up to 250 records. Export includes the full result.', 'Podgląd do 250 rekordów. Eksport obejmuje cały wynik.')}</span><button className="subtle" onClick={() => void copy(JSON.stringify(rows, null, 2), 'all')}>{copied === 'all' ? <Check size={15} /> : <Copy size={15} />}{t('Copy preview', 'Kopiuj podgląd')}</button></div>
      {mode === 'json' ? <pre className="json-preview" tabIndex={0}>{JSON.stringify(rows, null, 2)}</pre> : <>
        <div className="table-scroll"><table><thead>{table.getHeaderGroups().map(group => <tr key={group.id}><th className="row-number">#</th>{group.headers.map(header => <th key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>)}<th>{t('Copy', 'Kopiuj')}</th></tr>)}</thead><tbody>{table.getRowModel().rows.map(row => <tr key={row.id}><td className="row-number">{row.index + 1}</td>{row.getVisibleCells().map(cell => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}<td><button className="icon-button" aria-label={t('Copy record', 'Kopiuj rekord')} onClick={() => void copy(JSON.stringify(row.original), `row-${row.id}`)}>{copied === `row-${row.id}` ? <Check size={14} /> : <Copy size={14} />}</button></td></tr>)}</tbody></table></div>
        <div className="pagination"><span>{t('Page', 'Strona')} {table.getState().pagination.pageIndex + 1} / {Math.max(1, table.getPageCount())}</span><div><button className="icon-button" aria-label={t('Previous page', 'Poprzednia strona')} disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}><ChevronLeft size={17} /></button><button className="icon-button" aria-label={t('Next page', 'Następna strona')} disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}><ChevronRight size={17} /></button></div></div>
      </>}
    </>}
    <div className="output-footer"><span className="tag">{t('SYNTHETIC / USER-IMPORTED', 'SYNTETYCZNE / IMPORTOWANE')}</span><span>{t('No registry verification', 'Bez weryfikacji rejestrowej')}</span></div>
  </section>;
}
