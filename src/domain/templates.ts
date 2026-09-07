import type { DataSchema, FieldDefinition } from './types';
import type { DatasetDefinition } from './datasets';

export interface Template {
  id: string;
  name: string;
  description: string;
  country: 'PL' | 'DK' | 'Global';
  schema: DataSchema;
}
const field = (
  name: string,
  generator: string,
  options?: FieldDefinition['options'],
): FieldDefinition => ({
  id: name,
  name,
  generator,
  required: true,
  ...(options ? { options } : {}),
});
const id = () => ({ ...field('id', 'uuid'), unique: true });
const derived = (
  name: string,
  generator: string,
  rule: NonNullable<FieldDefinition['rule']>,
): FieldDefinition => ({ ...field(name, generator), rule });
const personFields = (country: 'PL' | 'DK'): FieldDefinition[] => [
  id(),
  field('sex', 'enum', { values: ['female', 'male'] }),
  {
    ...field('firstName', 'firstName', { sexField: 'sex' }),
    locale: country === 'PL' ? 'pl' : 'da',
  },
  { ...field('lastName', 'lastName'), locale: country === 'PL' ? 'pl' : 'da' },
  field('birthDate', 'birthDate'),
  field(country === 'PL' ? 'pesel' : 'cpr', country === 'PL' ? 'pesel' : 'cpr', {
    birthDateField: 'birthDate',
    sexField: 'sex',
    profile: 'standard',
  }),
  derived('email', 'email', { operation: 'email', fields: ['firstName', 'lastName'] }),
  derived('age', 'age', { operation: 'age', fields: ['birthDate'] }),
];
function template(
  id: string,
  name: string,
  description: string,
  country: Template['country'],
  fields: FieldDefinition[],
): Template {
  return { id, name, description, country, schema: { id, name, version: 1, fields } };
}
export const TEMPLATES: Template[] = [
  template(
    'customer-pl',
    'Polish customer',
    'PESEL, birth date, encoded sex and email dependencies.',
    'PL',
    personFields('PL'),
  ),
  template(
    'customer-dk',
    'Danish customer',
    'Standard CPR profile with coherent birth date and encoded sex.',
    'DK',
    personFields('DK'),
  ),
  template(
    'address-dk',
    'Synthetic Danish address',
    'Danish formatting; UUIDs and street addresses are not registry records.',
    'DK',
    [id(), field('address', 'addressDk')],
  ),
  template(
    'dar-address',
    'Imported DAR address',
    'Requires your normalized DAR reference pool. Preserves original identifiers.',
    'DK',
    [id(), field('address', 'dar')],
  ),
  template(
    'company-dk',
    'Danish company',
    'CVR checksum profile and synthetic production-unit numbers.',
    'DK',
    [
      id(),
      { ...field('name', 'company'), locale: 'da' },
      field('cvr', 'cvr'),
      derived('vat', 'vatDk', { operation: 'template', fields: ['cvr'], value: 'DK{0}' }),
      {
        ...field('units', 'array', { minItems: 1, maxItems: 4 }),
        item: {
          ...field('unit', 'object'),
          fields: [field('pNumber', 'pNumber'), field('address', 'addressDk')],
        },
      },
    ],
  ),
  template(
    'bank-account',
    'Bank account',
    'Danish registration number, account and IBAN from one coherent value.',
    'DK',
    [id(), field('account', 'bankDk'), field('currency', 'constant', { value: 'DKK' })],
  ),
  template('invoice', 'Invoice', 'Net and gross amounts with ordered issue/due dates.', 'Global', [
    id(),
    field('issuedOn', 'date'),
    derived('dueOn', 'date', { operation: 'addDays', fields: ['issuedOn'], value: 14 }),
    field('net', 'decimal', { min: 10, max: 10000, precision: 2 }),
    derived('gross', 'decimal', { operation: 'multiply', fields: ['net'], value: 1.25 }),
    field('currency', 'currency'),
  ]),
  template(
    'order',
    'Order with line items',
    'Nested rows with quantities, unit prices and synthetic product references.',
    'Global',
    [
      id(),
      field('orderedOn', 'date'),
      field('status', 'enum', { values: ['created', 'paid', 'shipped'] }),
      {
        ...field('items', 'array', { minItems: 1, maxItems: 5 }),
        item: {
          ...field('item', 'object'),
          fields: [
            field('productId', 'uuid'),
            field('quantity', 'integer', { min: 1, max: 10 }),
            field('unitPrice', 'decimal', { min: 1, max: 500 }),
          ],
        },
      },
    ],
  ),
  template('employee', 'Employee', 'Danish identity, company and employment dates.', 'DK', [
    ...personFields('DK'),
    field('employerCvr', 'cvr'),
    field('startedOn', 'date', { min: '2020-01-01' }),
  ]),
  template(
    'energy',
    'Energy customer and meter',
    'Synthetic metering data; no claimed DataHub contract compatibility.',
    'DK',
    [
      ...personFields('DK'),
      field('address', 'addressDk'),
      field('meteringPointId', 'uuid'),
      {
        ...field('meter', 'object'),
        fields: [
          field('serialNumber', 'sequence'),
          field('installedOn', 'date'),
          field('readingKwh', 'decimal', { min: 0, max: 100000 }),
        ],
      },
    ],
  ),
];

export const RELATIONAL_TEMPLATE: DatasetDefinition[] = [
  { name: 'customers', count: 5, schema: TEMPLATES[1].schema },
  {
    name: 'orders',
    count: 15,
    schema: {
      id: 'rel-orders',
      name: 'Orders',
      version: 1,
      fields: [
        id(),
        derived('customerId', 'uuid', {
          operation: 'foreignKey',
          dataset: 'customers',
          targetField: 'id',
        }),
        field('placedOn', 'date'),
      ],
    },
  },
  {
    name: 'items',
    count: 40,
    schema: {
      id: 'rel-items',
      name: 'Items',
      version: 1,
      fields: [
        id(),
        derived('orderId', 'uuid', {
          operation: 'foreignKey',
          dataset: 'orders',
          targetField: 'id',
        }),
        field('quantity', 'integer', { min: 1, max: 20 }),
      ],
    },
  },
];
