import { supportUrl } from './runtime-config';

describe('support runtime configuration', () => {
  afterEach(() => {
    delete window.__OPENClockwork_CONFIG__;
  });

  it('uses the official HTTPS support page by default', () => {
    expect(supportUrl()).toBe('https://github.com/sponsors/patrickschiller');
  });

  it('can be disabled and rejects unsafe schemes', () => {
    window.__OPENClockwork_CONFIG__ = { supportUrl: '' };
    expect(supportUrl()).toBeNull();

    window.__OPENClockwork_CONFIG__ = {
      supportUrl: ['javascript', 'alert(1)'].join(':'),
    };
    expect(supportUrl()).toBeNull();

    window.__OPENClockwork_CONFIG__ = { supportUrl: 'http://example.test' };
    expect(supportUrl()).toBeNull();
  });
});
