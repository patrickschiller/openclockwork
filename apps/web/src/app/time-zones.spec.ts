import { describe, expect, it, vi } from 'vitest';
import { getBrowserTimeZone, getTimeZoneOptions } from './time-zones';

describe('time zones', () => {
  it('provides IANA options required by the terminal editor', () => {
    const options = getTimeZoneOptions();

    expect(options).toContain('UTC');
    expect(options).toContain('Europe/Berlin');
    expect(options).toContain('America/New_York');
    expect(options).toContain(getBrowserTimeZone());
  });

  it('falls back to UTC when no browser time zone is available', () => {
    const spy = vi
      .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
      .mockImplementation(() => {
        throw new Error('Unavailable');
      });
    try {
      expect(getBrowserTimeZone()).toBe('UTC');
    } finally {
      spy.mockRestore();
    }
  });

  it('retains valid legacy aliases but rejects invalid preferred values', () => {
    const options = getTimeZoneOptions(['US/Eastern', 'Not/A_Time_Zone', '']);

    expect(options).toContain('US/Eastern');
    expect(options).not.toContain('Not/A_Time_Zone');
    expect(options).not.toContain('');
  });
});
