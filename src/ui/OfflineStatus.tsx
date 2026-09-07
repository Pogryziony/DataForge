/// <reference types="vite-plugin-pwa/react" />
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useText } from './preferences';

export function OfflineStatus() {
  const t = useText();
  const {
    offlineReady: [ready, setReady],
    needRefresh: [refresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!ready && !refresh) return null;
  return (
    <div className="notice dismissible" role="status">
      <span>
        {refresh
          ? t(
              'A new version is available. Save your schema before updating.',
              'Dostępna jest nowa wersja. Zapisz schemat przed aktualizacją.',
            )
          : t(
              'All application resources are cached. Generation is ready offline.',
              'Zasoby aplikacji są zapisane. Generowanie jest dostępne offline.',
            )}
      </span>
      <button onClick={() => (refresh ? void updateServiceWorker(true) : setReady(false))}>
        {refresh ? t('Update', 'Aktualizuj') : t('Dismiss', 'Zamknij')}
      </button>
    </div>
  );
}
