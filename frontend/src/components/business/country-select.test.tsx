import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { COUNTRY_NAMES } from '@/lib/countries';

import { CountrySelect } from './country-select';

function renderCountrySelect(value: string) {
  const onChange = vi.fn();

  render(
    <>
      <label htmlFor="country">Country</label>
      <CountrySelect id="country" value={value} onChange={onChange} />
    </>,
  );

  return {
    select: screen.getByRole('combobox', { name: /country/i }),
    onChange,
  };
}

describe('CountrySelect', () => {
  it('renders every country and selects the current value', () => {
    const { select } = renderCountrySelect('Bangladesh');

    expect(select).toHaveValue('Bangladesh');
    expect(within(select).getAllByRole('option')).toHaveLength(COUNTRY_NAMES.length);
    expect(within(select).getByRole('option', { name: 'Germany' })).toBeInTheDocument();
  });

  it('shows the placeholder only when the value is empty', () => {
    const { select } = renderCountrySelect('');

    const placeholder = within(select).getByRole('option', { name: /select a country/i });
    expect(placeholder).toHaveValue('');
    expect(within(select).getAllByRole('option')).toHaveLength(COUNTRY_NAMES.length + 1);
  });

  it('keeps a saved value outside the list as the first option', () => {
    const { select } = renderCountrySelect('Atlantis');

    const options = within(select).getAllByRole('option');

    expect(select).toHaveValue('Atlantis');
    expect(options).toHaveLength(COUNTRY_NAMES.length + 1);
    expect(options[0]).toHaveValue('Atlantis');
    expect(options[0]).toHaveTextContent('Atlantis');
  });

  it('reports the chosen country', async () => {
    const user = userEvent.setup();
    const { select, onChange } = renderCountrySelect('Bangladesh');

    await user.selectOptions(select, 'Germany');

    expect(onChange).toHaveBeenCalledWith('Germany');
  });

  it('is reachable by keyboard with an accessible label', async () => {
    const user = userEvent.setup();
    const { select } = renderCountrySelect('Bangladesh');

    await user.tab();

    expect(select).toHaveFocus();
  });
});
