import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TimezoneSelect, groupTimeZones, timeZoneGroup, timeZoneLabel } from './timezone-select';

describe('timeZoneLabel', () => {
  it('keeps the remainder after the first segment', () => {
    expect(timeZoneLabel('America/Argentina/Buenos_Aires')).toBe('Argentina/Buenos Aires');
    expect(timeZoneLabel('Asia/Dhaka')).toBe('Dhaka');
  });

  it('keeps a zone without a slash and replaces underscores', () => {
    expect(timeZoneLabel('UTC')).toBe('UTC');
    expect(timeZoneLabel('Etc/GMT_Plus_5')).toBe('GMT Plus 5');
  });
});

describe('timeZoneGroup', () => {
  it('uses the first segment as the group', () => {
    expect(timeZoneGroup('America/Argentina/Buenos_Aires')).toBe('America');
    expect(timeZoneGroup('Asia/Dhaka')).toBe('Asia');
  });

  it('groups Etc and a zone without a slash under Other', () => {
    expect(timeZoneGroup('Etc/GMT+5')).toBe('Other');
    expect(timeZoneGroup('UTC')).toBe('Other');
  });
});

describe('groupTimeZones', () => {
  it('sorts groups and options and keeps the current value present', () => {
    const groups = groupTimeZones(
      ['Europe/London', 'Asia/Dhaka', 'America/New_York', 'Etc/UTC', 'UTC'],
      'Asia/Kolkata',
    );

    expect(groups.map((group) => group.name)).toEqual(['America', 'Asia', 'Europe', 'Other']);
    expect(groups[1]?.zones).toEqual(['Asia/Dhaka', 'Asia/Kolkata']);
    expect(groups[3]?.zones).toEqual(['Etc/UTC', 'UTC']);
  });

  it('falls back to Asia/Dhaka for an invalid current value', () => {
    const groups = groupTimeZones(['Europe/London'], 'Mars/Olympus');

    expect(groups.flatMap((group) => group.zones)).toContain('Asia/Dhaka');
  });
});

describe('TimezoneSelect', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders grouped options and the current value', () => {
    render(<TimezoneSelect id="timezone" value="UTC" onChange={() => {}} />);

    const select = screen.getByRole('combobox');
    expect(select).toHaveValue('UTC');
    expect(screen.getByRole('option', { name: 'Dhaka' })).toHaveValue('Asia/Dhaka');
    expect(screen.getByRole('option', { name: 'UTC' })).toHaveValue('UTC');
  });

  it('uses the short list when the runtime cannot enumerate zones', () => {
    vi.spyOn(Intl, 'supportedValuesOf').mockImplementation(() => {
      throw new Error('not supported');
    });

    render(<TimezoneSelect id="timezone" value="Asia/Dhaka" onChange={() => {}} />);

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(9);
    expect(options.map((option) => option.getAttribute('value'))).toContain('UTC');
  });

  it('reports the selected IANA id', () => {
    const onChange = vi.fn();
    render(<TimezoneSelect id="timezone" value="Asia/Dhaka" onChange={onChange} />);

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'Europe/Berlin' } });

    expect(onChange).toHaveBeenCalledWith('Europe/Berlin');
  });

  it('is enabled by default and disabled when the caller freezes it', () => {
    const { rerender } = render(
      <TimezoneSelect id="timezone" value="Asia/Dhaka" onChange={() => {}} />,
    );
    expect(screen.getByRole('combobox')).toBeEnabled();

    rerender(<TimezoneSelect disabled id="timezone" value="Asia/Dhaka" onChange={() => {}} />);
    expect(screen.getByRole('combobox')).toBeDisabled();
  });
});
