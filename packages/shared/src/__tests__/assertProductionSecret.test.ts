import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertProductionSecret } from '../env';

describe('assertProductionSecret', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('throws when DEPLOY_ENV=production and the secret is the known dev default', () => {
    vi.stubEnv('DEPLOY_ENV', 'production');

    expect(() => assertProductionSecret('dev-internal-secret', 'INTERNAL_SECRET')).toThrow(
      'INTERNAL_SECRET',
    );
  });

  it('throws when DEPLOY_ENV=production and the secret is empty', () => {
    vi.stubEnv('DEPLOY_ENV', 'production');

    expect(() => assertProductionSecret('', 'INTERNAL_SECRET')).toThrow('INTERNAL_SECRET');
  });

  it('throws when DEPLOY_ENV=production and the secret is whitespace-only', () => {
    vi.stubEnv('DEPLOY_ENV', 'production');

    expect(() => assertProductionSecret('   ', 'INTERNAL_SECRET')).toThrow('INTERNAL_SECRET');
  });

  it('does not throw when DEPLOY_ENV is unset, even with the default secret', () => {
    expect(() => assertProductionSecret('dev-internal-secret', 'INTERNAL_SECRET')).not.toThrow();
  });

  it('does not throw when DEPLOY_ENV=production and the secret is a real value', () => {
    vi.stubEnv('DEPLOY_ENV', 'production');

    expect(() => assertProductionSecret('a-real-production-secret', 'INTERNAL_SECRET')).not.toThrow();
  });

  it('throws when DEPLOY_ENV=production and the dev default is padded with whitespace', () => {
    // Regression test: the emptiness check and the dev-default comparison must
    // use the same normalized value. Previously the emptiness check trimmed
    // the secret but the equality check compared the raw string, so
    // ' dev-internal-secret ' (e.g. a stray space from a pasted .env value)
    // passed the emptiness check (non-empty) and failed the equality check
    // (not an exact match) -- silently bypassing the guard entirely.
    vi.stubEnv('DEPLOY_ENV', 'production');

    expect(() => assertProductionSecret(' dev-internal-secret ', 'INTERNAL_SECRET')).toThrow(
      'INTERNAL_SECRET',
    );
  });

  it('throws when DEPLOY_ENV=production and the dev default has a trailing newline', () => {
    vi.stubEnv('DEPLOY_ENV', 'production');

    expect(() => assertProductionSecret('dev-internal-secret\n', 'INTERNAL_SECRET')).toThrow(
      'INTERNAL_SECRET',
    );
  });
});
