import { createPublicKey } from 'node:crypto';

// Fetches a Clerk (or any OIDC-compatible) JWKS and returns the selected RSA
// key as a PEM string, plus which kid was used. Shared by jwks-to-pem.mjs
// (manual CLI use) and render-kong-config.mjs (deploy-time automation).
export async function fetchRsaPem(issuerOrJwksUrl, kid) {
  const jwksUrl = issuerOrJwksUrl.endsWith('/.well-known/jwks.json')
    ? issuerOrJwksUrl
    : `${issuerOrJwksUrl.replace(/\/$/, '')}/.well-known/jwks.json`;

  const res = await fetch(jwksUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${jwksUrl}: ${res.status} ${res.statusText}`);
  }

  const { keys } = await res.json();
  if (!keys?.length) {
    throw new Error(`No keys found in JWKS at ${jwksUrl}`);
  }

  const rsaKeys = keys.filter((k) => k.kty === 'RSA');
  if (!rsaKeys.length) {
    throw new Error(`No RSA keys found in JWKS at ${jwksUrl}`);
  }

  const jwk = kid ? rsaKeys.find((k) => k.kid === kid) : rsaKeys[0];
  if (!jwk) {
    throw new Error(`No RSA key with kid=${kid} found in JWKS at ${jwksUrl}`);
  }

  const pem = createPublicKey({ key: jwk, format: 'jwk' }).export({ type: 'spki', format: 'pem' });

  return { pem, kid: jwk.kid, keyCount: rsaKeys.length };
}
