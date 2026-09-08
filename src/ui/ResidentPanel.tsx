import { useState } from 'react';
import { Copy, UserRound } from 'lucide-react';
import { RESIDENT_COUNTRIES, type Housing } from '../domain/residents';
import type { DataRecord, Locale } from '../domain/types';
import { useText } from './preferences';

export function ResidentPanel({
  locale,
  onLocale,
  housing,
  onHousing,
  onEdit,
}: {
  locale: Locale;
  onLocale(locale: Locale): void;
  housing: Housing;
  onHousing(housing: Housing): void;
  onEdit(): void;
}) {
  const t = useText();
  return (
    <section className="panel editor-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">{t('COMPLETE RECORD', 'KOMPLETNY REKORD')}</span>
          <h2>{t('Resident with address', 'Mieszkaniec z adresem')}</h2>
        </div>
        <UserRound size={21} />
      </div>
      <label>
        {t('Resident country', 'Kraj mieszkańca')}
        <select
          aria-label={t('Resident country', 'Kraj mieszkańca')}
          value={locale}
          onChange={(event) => onLocale(event.target.value as Locale)}
        >
          {RESIDENT_COUNTRIES.map((country) => (
            <option key={country.code} value={country.locale}>
              {country.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('Housing type', 'Typ lokalu')}
        <select
          aria-label={t('Housing type', 'Typ lokalu')}
          value={housing}
          onChange={(event) => onHousing(event.target.value as Housing)}
        >
          <option value="mixed">{t('Houses and apartments', 'Domy i mieszkania')}</option>
          <option value="house">
            {t('House — no floor or door', 'Dom — bez piętra i lokalu')}
          </option>
          <option value="apartment">
            {t('Apartment — floor and door', 'Mieszkanie — piętro i lokal')}
          </option>
        </select>
      </label>
      <p className="muted">
        {t(
          'Name, birth date, age, email, phone and a complete address in separate columns. PL includes PESEL; DK includes CPR. Select the record count below.',
          'Imię, nazwisko, data urodzenia, wiek, e-mail, telefon i pełny adres w osobnych kolumnach. PL zawiera PESEL; DK zawiera CPR. Liczbę rekordów ustaw poniżej.',
        )}
      </p>
      <button onClick={onEdit}>
        {t('Customize resident schema', 'Dostosuj schemat mieszkańca')}
      </button>
      <div className="notice compact">
        {t(
          'Synthetic addresses. Postcode and postal district are not checked against postal registries. A house has empty floor and door fields.',
          'Adresy syntetyczne. Zgodność kodu z miejscowością pocztową nie jest sprawdzana w rejestrze. Dla domu piętro i lokal pozostają puste.',
        )}
      </div>
    </section>
  );
}

export function ResidentDetails({ rows }: { rows: DataRecord[] }) {
  const t = useText();
  const [selected, setSelected] = useState(0);
  const [message, setMessage] = useState('');
  const index = Math.min(selected, Math.max(0, rows.length - 1));
  const record = rows[index];
  if (!record || !Object.hasOwn(record, 'streetName')) return null;
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(t('Copied.', 'Skopiowano.'));
    } catch {
      setMessage(
        t(
          'Clipboard unavailable. Select a field value and copy it manually.',
          'Schowek niedostępny. Zaznacz wartość pola i skopiuj ją ręcznie.',
        ),
      );
    }
  }
  const personal = [
    ['firstName', t('First name', 'Imię')],
    ['lastName', t('Last name', 'Nazwisko')],
    ['birthDate', t('Birth date', 'Data urodzenia')],
    ['email', 'E-mail'],
    ['phone', t('Phone', 'Telefon')],
    ...(record.pesel ? [['pesel', 'PESEL']] : []),
    ...(record.cpr ? [['cpr', 'CPR']] : []),
  ];
  const address = [
    ['streetName', t('Street name', 'Ulica')],
    ['houseNumber', t('House number', 'Numer domu')],
    ['floor', t('Floor', 'Piętro')],
    ['door', t('Door', 'Lokal')],
    ['postalCode', t('Postcode', 'Kod pocztowy')],
    ['postalDistrict', t('Postal district', 'Miejscowość pocztowa')],
  ];
  const fields = (entries: string[][]) => (
    <div className="form-grid">
      {entries.map(([key, label]) => (
        <div key={key}>
          <label>
            {label}
            <input readOnly value={String(record[key] ?? '')} aria-label={label} />
          </label>
          <button
            className="subtle"
            aria-label={`${t('Copy', 'Kopiuj')} ${label}`}
            onClick={() => void copy(String(record[key] ?? ''))}
          >
            <Copy size={13} />
            {t('Copy', 'Kopiuj')}
          </button>
        </div>
      ))}
    </div>
  );
  return (
    <section className="panel editor-panel" aria-label={t('Resident details', 'Dane mieszkańca')}>
      <h2>{t('Resident details', 'Dane mieszkańca')}</h2>
      <label>
        {t('Resident record', 'Rekord mieszkańca')}
        <select
          aria-label={t('Resident record', 'Rekord mieszkańca')}
          value={index}
          onChange={(event) => {
            setSelected(Number(event.target.value));
            setMessage('');
          }}
        >
          {rows.map((row, i) => (
            <option key={i} value={i}>
              {i + 1}. {String(row.firstName)} {String(row.lastName)} · {String(row.country)}
            </option>
          ))}
        </select>
      </label>
      <small>
        {t(
          'Browse the first 250 records. Export includes every generated resident.',
          'Przeglądaj pierwsze 250 rekordów. Eksport obejmuje wszystkich wygenerowanych mieszkańców.',
        )}
      </small>
      {fields(personal)}
      <h3>{t('Address details', 'Dane adresowe')}</h3>
      {fields(address)}
      <button onClick={() => void copy(String(record.formattedAddress ?? ''))}>
        <Copy size={15} />
        {t('Copy full address', 'Kopiuj pełny adres')}
      </button>
      <button onClick={() => void copy(JSON.stringify(record, null, 2))}>
        {t('Copy resident JSON', 'Kopiuj JSON mieszkańca')}
      </button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
