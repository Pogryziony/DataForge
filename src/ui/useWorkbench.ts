import { useCallback, useEffect, useRef, useState } from 'react';
import type { DataRecord, GenerationManifest } from '../domain/types';
import type { WorkerAction, WorkerRequest, WorkerResponse } from '../workers/protocol';
import { downloadArtifact } from '../infrastructure/exports';
import { database } from '../infrastructure/database';

export function useWorkbench() {
  const [rows, setRows] = useState<DataRecord[]>([]);
  const [count, setCount] = useState(0);
  const [datasets, setDatasets] = useState<{ name: string; count: number }[]>([]);
  const [manifest, setManifest] = useState<GenerationManifest>();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [report, setReport] = useState('');
  const [notice, setNotice] = useState('');
  const worker = useRef<Worker | null>(null);
  const activeJob = useRef('');
  const connect = useCallback(() => {
    const instance = new Worker(new URL('../workers/generation.worker.ts', import.meta.url), { type: 'module' });
    instance.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.jobId !== activeJob.current) return;
      if (message.type === 'progress') setProgress(message.completed / message.total * 100);
      else if (message.type === 'result') {
        setRows(message.preview); setCount(message.count); setManifest(message.manifest); setDatasets(message.datasets ?? []); setReport(message.report ?? ''); setProgress(100); setBusy(false);
        if (message.manifest) void database.history.put({ id: crypto.randomUUID(), manifest: message.manifest, savedAt: new Date().toISOString() }).catch(() => setNotice('History could not be saved. Export the manifest to retain this configuration.'));
      } else if (message.type === 'error') { setError(message.message); setBusy(false); }
      else if (message.type === 'artifact') { downloadArtifact(message.artifact); setBusy(false); }
    };
    instance.onerror = () => { setError('Background worker failed. Cancel and retry; no partial result is marked complete.'); setBusy(false); };
    worker.current = instance;
    return instance;
  }, []);
  useEffect(() => { const instance = connect(); return () => { instance.terminate(); worker.current?.terminate(); }; }, [connect]);
  const clear = () => { setRows([]); setCount(0); setManifest(undefined); setDatasets([]); setReport(''); };
  const run = (action: WorkerAction) => {
    if (busy) return;
    if (['generate', 'datasets', 'pairwise', 'transform'].includes(action.type)) clear();
    activeJob.current = crypto.randomUUID(); setBusy(true); setProgress(0); setError('');
    worker.current?.postMessage({ ...action, jobId: activeJob.current } satisfies WorkerRequest);
  };
  const cancel = () => { worker.current?.terminate(); activeJob.current = ''; connect(); setBusy(false); setProgress(0); clear(); setReport('Cancelled. Partial results were discarded.'); };
  return { rows, count, datasets, manifest, busy, progress, error, setError, report, notice, setNotice, run, cancel };
}
