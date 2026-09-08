// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SchemaEditor } from './SchemaEditor';
import { Preview } from './Preview';
import { TEMPLATES } from '../domain/templates';
import { ResidentDetails, ResidentPanel } from './ResidentPanel';

afterEach(cleanup);
it('exposes country and housing selection for complete resident records', () => {
  const onLocale = vi.fn(),
    onHousing = vi.fn();
  render(
    <ResidentPanel
      locale="da"
      onLocale={onLocale}
      housing="mixed"
      onHousing={onHousing}
      onEdit={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText('Resident country'), { target: { value: 'en_GB' } });
  fireEvent.change(screen.getByLabelText('Housing type'), { target: { value: 'apartment' } });
  expect(onLocale).toHaveBeenCalledWith('en_GB');
  expect(onHousing).toHaveBeenCalledWith('apartment');
});
it('copies an individual resident address field without losing leading zeros', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  render(
    <ResidentDetails
      rows={[
        {
          firstName: 'Anna',
          lastName: 'Test',
          country: 'PL',
          streetName: 'Testowa',
          houseNumber: '10',
          floor: '',
          door: '',
          postalCode: '00-001',
          postalDistrict: 'Warszawa',
        },
      ]}
    />,
  );
  expect(screen.getByLabelText('Floor')).toHaveValue('');
  fireEvent.click(screen.getByRole('button', { name: 'Copy Postcode' }));
  expect(writeText).toHaveBeenCalledWith('00-001');
  expect(await screen.findByRole('status')).toHaveTextContent('Copied.');
});
it('adds fields and supports accessible keyboard-order buttons', () => {
  const onChange = vi.fn();
  render(<SchemaEditor schema={TEMPLATES[0].schema} onChange={onChange} catalogue={[]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Add field' }));
  expect(onChange.mock.calls[0][0].fields.length).toBe(TEMPLATES[0].schema.fields.length + 1);
  expect(screen.getAllByRole('button', { name: 'Move field up' })[0]).toBeDisabled();
});
it('renders security strings as text without inserting markup', () => {
  const { container } = render(
    <Preview
      rows={[{ value: '<script>window.bad=true</script>' }]}
      count={1}
      busy={false}
      progress={100}
      error=""
      report=""
    />,
  );
  expect(container.querySelector('script')).toBeNull();
  expect(screen.getByText('<script>window.bad=true</script>')).toBeInTheDocument();
});
