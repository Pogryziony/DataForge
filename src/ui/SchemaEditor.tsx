import { useState } from 'react';
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from 'lucide-react';
import type { DataSchema, FieldDefinition } from '../domain/types';
import type { GeneratorDefinition } from '../domain/generators';
import { parseSafeJson } from '../infrastructure/imports';
import { errorMessage } from '../domain/errors';
import { useText } from './preferences';

export function SchemaEditor({
  schema,
  onChange,
  catalogue,
}: {
  schema: DataSchema;
  onChange(schema: DataSchema): void;
  catalogue: Pick<GeneratorDefinition, 'id' | 'label' | 'category'>[];
}) {
  const t = useText();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [raw, setRaw] = useState('');
  const [showRaw, setShowRaw] = useState(false);
  const [error, setError] = useState('');
  const [dragged, setDragged] = useState<number | null>(null);
  const update = (index: number, value: Partial<FieldDefinition>) =>
    onChange({
      ...schema,
      fields: schema.fields.map((field, i) => (i === index ? { ...field, ...value } : field)),
    });
  const move = (from: number, to: number) => {
    if (to < 0 || to >= schema.fields.length) return;
    const fields = [...schema.fields];
    fields.splice(to, 0, fields.splice(from, 1)[0]);
    onChange({ ...schema, fields });
  };
  return (
    <section className="panel editor-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">{t('STRUCTURE', 'STRUKTURA')}</span>
          <h2>{t('Schema designer', 'Edytor schematu')}</h2>
        </div>
        <button
          className="subtle"
          onClick={() => {
            setRaw(JSON.stringify(schema, null, 2));
            setShowRaw(!showRaw);
          }}
        >
          {showRaw ? t('Visual', 'Wizualnie') : 'JSON'}
        </button>
      </div>
      <label>
        {t('Schema name', 'Nazwa schematu')}
        <input
          value={schema.name}
          onChange={(event) => onChange({ ...schema, name: event.target.value })}
        />
      </label>
      {error && (
        <div className="notice danger" role="alert">
          {error}
        </div>
      )}
      {showRaw ? (
        <>
          <label>
            {t(
              'Full schema: nesting, conditions, rates and rules',
              'Pełny schemat: zagnieżdżenia, warunki, udziały i reguły',
            )}
            <textarea
              className="code-input tall"
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
              spellCheck={false}
            />
          </label>
          <button
            onClick={() => {
              try {
                const value = parseSafeJson(raw) as unknown as DataSchema;
                if (!value || !Array.isArray(value.fields))
                  throw new Error('Schema requires fields');
                onChange(value);
                setError('');
              } catch (error) {
                setError(errorMessage(error));
              }
            }}
          >
            {t('Apply JSON', 'Zastosuj JSON')}
          </button>
        </>
      ) : (
        <div className="field-list">
          {schema.fields.map((field, index) => (
            <div
              key={field.id}
              className="field-card"
              draggable
              onDragStart={() => setDragged(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (dragged !== null) move(dragged, index);
                setDragged(null);
              }}
            >
              <div className="field-row">
                <span className="field-index">{String(index + 1).padStart(2, '0')}</span>
                <input
                  aria-label={`${t('Field name', 'Nazwa pola')} ${index + 1}`}
                  value={field.name}
                  onChange={(event) => update(index, { name: event.target.value })}
                />
                <select
                  aria-label={`${t('Generator', 'Generator')} ${index + 1}`}
                  value={field.generator}
                  onChange={(event) =>
                    update(index, { generator: event.target.value, options: {}, rule: undefined })
                  }
                >
                  {catalogue.map((generator) => (
                    <option key={generator.id} value={generator.id}>
                      {generator.label}
                    </option>
                  ))}
                  <option value="object">Object</option>
                  <option value="array">Array</option>
                </select>
              </div>
              <div className="field-actions">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={field.required !== false}
                    onChange={(event) => update(index, { required: event.target.checked })}
                  />
                  {t('Required', 'Wymagane')}
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={Boolean(field.unique)}
                    onChange={(event) => update(index, { unique: event.target.checked })}
                  />
                  {t('Unique', 'Unikalne')}
                </label>
                <button
                  className="subtle"
                  onClick={() => setExpanded(expanded === field.id ? null : field.id)}
                >
                  {t('Rules', 'Reguły')}
                </button>
                <div className="field-icons">
                  <button
                    className="icon-button"
                    aria-label={t('Move field up', 'Przesuń pole w górę')}
                    disabled={!index}
                    onClick={() => move(index, index - 1)}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={t('Move field down', 'Przesuń pole w dół')}
                    disabled={index === schema.fields.length - 1}
                    onClick={() => move(index, index + 1)}
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={t('Duplicate field', 'Duplikuj pole')}
                    onClick={() =>
                      onChange({
                        ...schema,
                        fields: [
                          ...schema.fields,
                          {
                            ...structuredClone(field),
                            id: crypto.randomUUID(),
                            name: `${field.name}_copy`,
                          },
                        ],
                      })
                    }
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    className="icon-button destructive"
                    aria-label={t('Remove field', 'Usuń pole')}
                    onClick={() =>
                      onChange({ ...schema, fields: schema.fields.filter((_, i) => i !== index) })
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {expanded === field.id && (
                <FieldJson field={field} onApply={(value) => update(index, value)} />
              )}
            </div>
          ))}
          <button
            className="add-field"
            onClick={() =>
              onChange({
                ...schema,
                fields: [
                  ...schema.fields,
                  {
                    id: crypto.randomUUID(),
                    name: `field_${schema.fields.length + 1}`,
                    generator: 'text',
                    required: true,
                  },
                ],
              })
            }
          >
            <Plus size={17} />
            {t('Add field', 'Dodaj pole')}
          </button>
        </div>
      )}
    </section>
  );
}

function FieldJson({
  field,
  onApply,
}: {
  field: FieldDefinition;
  onApply(field: FieldDefinition): void;
}) {
  const t = useText();
  const [text, setText] = useState(JSON.stringify(field, null, 2));
  const [error, setError] = useState('');
  return (
    <div className="field-json">
      <label>
        {t('Field configuration', 'Konfiguracja pola')}
        <textarea
          className="code-input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          spellCheck={false}
        />
      </label>
      <small>
        {t(
          'Use options, nullRate, emptyRate, missingRate, rule, condition, fields or item. Dependencies use field names.',
          'Użyj options, nullRate, emptyRate, missingRate, rule, condition, fields lub item. Zależności korzystają z nazw pól.',
        )}
      </small>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <button
        onClick={() => {
          try {
            const parsed = parseSafeJson(text) as unknown as FieldDefinition;
            if (!parsed?.name || !parsed?.generator)
              throw new Error('Field needs name and generator');
            onApply({ ...parsed, id: field.id });
            setError('');
          } catch (error) {
            setError(errorMessage(error));
          }
        }}
      >
        {t('Apply rules', 'Zastosuj reguły')}
      </button>
    </div>
  );
}
