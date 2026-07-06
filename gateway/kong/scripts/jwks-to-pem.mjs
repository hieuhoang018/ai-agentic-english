#!/usr/bin/env node
// Fetches a Clerk JWKS and prints the RSA public key as PEM, for pasting
// into kong.yml's `rsa_public_key` field.
//
// Usage:
//   node gateway/kong/scripts/jwks-to-pem.mjs <clerk-issuer-or-jwks-url> [kid]
//
// Examples:
//   node gateway/kong/scripts/jwks-to-pem.mjs https://your-app.clerk.accounts.dev
//   node gateway/kong/scripts/jwks-to-pem.mjs https://your-app.clerk.accounts.dev/.well-known/jwks.json
//
// For automated prod deploys, prefer render-kong-config.mjs, which does this
// fetch and writes the resulting kong.generated.yml directly.

import { fetchRsaPem } from './lib/jwks.mjs';

const input = process.argv[2];
const kidArg = process.argv[3];

if (!input) {
  console.error('Usage: node jwks-to-pem.mjs <clerk-issuer-or-jwks-url> [kid]');
  process.exit(1);
}

const { pem, kid, keyCount } = await fetchRsaPem(input, kidArg);

if (!kidArg && keyCount > 1) {
  console.error(
    `Note: JWKS has ${keyCount} RSA keys, using kid=${kid}. Pass a kid as the second argument to pick another.`,
  );
}

console.log(pem);
