import { importJWK, jwtVerify } from 'jose';
import { describe, expect, it } from 'vitest';
import { TEST_ISSUER, TEST_JWKS, TEST_KEY_ID, signTestToken } from '../testing';

describe('signTestToken', () => {
  it('produces a JWT that verifies against TEST_JWKS', async () => {
    const token = await signTestToken({ sub: 'user_123' });

    const jwk = TEST_JWKS.keys.find((key) => key.kid === TEST_KEY_ID);
    expect(jwk).toBeDefined();
    const publicKey = await importJWK(jwk!, 'RS256');

    const { payload } = await jwtVerify(token, publicKey, { issuer: TEST_ISSUER });

    expect(payload.sub).toBe('user_123');
    expect(payload.iss).toBe(TEST_ISSUER);
  });

  it('respects a custom issuer and expiry', async () => {
    const token = await signTestToken({ sub: 'user_456', issuer: 'https://other.example.com', expiresInSeconds: 60 });

    const jwk = TEST_JWKS.keys.find((key) => key.kid === TEST_KEY_ID);
    const publicKey = await importJWK(jwk!, 'RS256');

    const { payload } = await jwtVerify(token, publicKey, { issuer: 'https://other.example.com' });

    expect(payload.sub).toBe('user_456');
    expect(typeof payload.exp).toBe('number');
  });
});
