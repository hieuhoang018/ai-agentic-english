#!/usr/bin/env node
// Fetches a Clerk JWKS and prints the RSA public key as PEM, for pasting
// into kong.yml's `rsa_public_key` field.
//
// Usage:
//   node gateway/kong/jwks-to-pem.mjs <clerk-issuer-or-jwks-url> [kid]
//
// Examples:
//   node gateway/kong/jwks-to-pem.mjs https://your-app.clerk.accounts.dev
//   node gateway/kong/jwks-to-pem.mjs https://your-app.clerk.accounts.dev/.well-known/jwks.json

import { createPublicKey } from 'node:crypto';

const input = process.argv[2];
const kidArg = process.argv[3];

if (!input) {
  console.error('Usage: node jwks-to-pem.mjs <clerk-issuer-or-jwks-url> [kid]');
  process.exit(1);
}

const jwksUrl = input.endsWith('/.well-known/jwks.json')
  ? input
  : `${input.replace(/\/$/, '')}/.well-known/jwks.json`;

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

const jwk = kidArg ? rsaKeys.find((k) => k.kid === kidArg) : rsaKeys[0];
if (!jwk) {
  throw new Error(`No RSA key with kid=${kidArg} found in JWKS at ${jwksUrl}`);
}

if (!kidArg && rsaKeys.length > 1) {
  console.error(
    `Note: JWKS has ${rsaKeys.length} RSA keys, using kid=${jwk.kid}. Pass a kid as the second argument to pick another.`,
  );
}

const pem = createPublicKey({ key: jwk, format: 'jwk' }).export({ type: 'spki', format: 'pem' });

console.log(pem);
