#!/usr/bin/env node
// Renders gateway/kong/kong.yml into gateway/kong/kong.generated.yml with the
// dev-Clerk test issuer/key swapped for a real Clerk JWKS, so a prod deploy
// never silently runs against the committed dev issuer (see
// docs/kong-gateway-security-review.md §2.2).
//
// Usage (required env var, no default — this is deliberate, see below):
//   CLERK_ISSUER=https://your-app.clerk.accounts.dev \
//     node gateway/kong/scripts/render-kong-config.mjs
//
// Optional: CLERK_JWT_KID=<kid> to pick a specific key when the JWKS has more
// than one RSA key.
//
// Run this on every deploy, not just the first one — Clerk can rotate its
// signing key, and this always fetches the current JWKS rather than caching
// the PEM anywhere.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { fetchRsaPem } from './lib/jwks.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = path.join(__dirname, '..', 'kong.yml');
const OUTPUT_PATH = path.join(__dirname, '..', 'kong.generated.yml');
const DEV_TEST_ISSUER = 'https://elegant-anchovy-29.clerk.accounts.dev';

const clerkIssuer = process.env.CLERK_ISSUER;
const kid = process.env.CLERK_JWT_KID;

if (!clerkIssuer) {
  console.error(
    'CLERK_ISSUER is required and has no default — this script refuses to guess, so a ' +
      'forgotten env var fails the deploy loudly instead of silently rendering the dev issuer.',
  );
  process.exit(1);
}

if (!/^https:\/\//.test(clerkIssuer)) {
  console.error(`CLERK_ISSUER must be an https:// URL, got: ${clerkIssuer}`);
  process.exit(1);
}

if (clerkIssuer === DEV_TEST_ISSUER && process.env.ALLOW_DEV_ISSUER !== 'true') {
  console.error(
    `CLERK_ISSUER is the known dev/test issuer (${DEV_TEST_ISSUER}). Refusing to render a ` +
      'prod config against it. If this is intentional (e.g. testing this script itself), ' +
      'set ALLOW_DEV_ISSUER=true.',
  );
  process.exit(1);
}

const source = readFileSync(SOURCE_PATH, 'utf8');

const oldKeyLine = `key: ${DEV_TEST_ISSUER}`;
if (!source.includes(oldKeyLine)) {
  console.error(
    `Expected to find "${oldKeyLine}" in ${SOURCE_PATH} but it's not there — kong.yml's ` +
      'consumer block has drifted from what this script expects. Refusing to guess a ' +
      'replacement; update this script to match the new structure.',
  );
  process.exit(1);
}

const pemBlockPattern = /( *)-----BEGIN PUBLIC KEY-----\n([\s\S]*?)\n *-----END PUBLIC KEY-----\n?/;
const pemMatch = source.match(pemBlockPattern);
if (!pemMatch) {
  console.error(`Could not find an rsa_public_key PEM block in ${SOURCE_PATH} to replace.`);
  process.exit(1);
}
const indent = pemMatch[1];

console.error(`Fetching JWKS for ${clerkIssuer}...`);
const { pem, kid: usedKid, keyCount } = await fetchRsaPem(clerkIssuer, kid);
if (!kid && keyCount > 1) {
  console.error(`Note: JWKS has ${keyCount} RSA keys, using kid=${usedKid}.`);
}

const newPemBlock = pem
  .trim()
  .split('\n')
  .map((line) => indent + line)
  .join('\n');

let rendered = source.replace(oldKeyLine, `key: ${clerkIssuer}`);
rendered = rendered.replace(pemBlockPattern, `${newPemBlock}\n`);

writeFileSync(OUTPUT_PATH, rendered);

console.error(`Wrote ${OUTPUT_PATH} (issuer=${clerkIssuer}, kid=${usedKid}).`);
console.error('This file is gitignored — re-run this script on every deploy, not just once.');
