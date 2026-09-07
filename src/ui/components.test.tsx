// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SchemaEditor } from './SchemaEditor';
import { Preview } from './Preview';
import { TEMPLATES } from '../domain/templates';

afterEach(cleanup);
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
