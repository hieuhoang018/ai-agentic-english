#!/usr/bin/env node
// Mints JWTs for synthetic perf-test users using the self-signed TEST_ISSUER
// keypair already used by every service's test suite (packages/shared/src/
// testing/index.ts's signTestToken). Only valid against perf/kong-perf.yml's
// perf-test-clerk consumer - see perf/README.md.
//
// Usage: node perf/generate-tokens.mjs [count] [outFile]
//   node perf/generate-tokens.mjs 20 perf/tokens.csv
//
// Writes a CSV with header `clerkUserId,jwt` for JMeter's CSV Data Set
// Config. clerkUserIds are deterministic (perf-user-0000, perf-user-0001,
// ...) so a re-run with the same count reproduces the same user set - useful
// for pairing with perf/seed-perf-users.* once that exists.

import { writeFile } from 'node:fs/promises';
import { signTestToken } from '@ai-agentic-english/shared';

const count = Number(process.argv[2] ?? 20);
const outFile = process.argv[3] ?? new URL('./tokens.csv', import.meta.url).pathname;

// Longer than any planned soak test (docs/jmeter-perf-test-plan.md caps
// soak at 60 min) so tokens don't expire mid-run.
const EXPIRES_IN_SECONDS = 4 * 60 * 60;

function clerkUserId(i) {
  return `perf-user-${String(i).padStart(4, '0')}`;
}

async function main() {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`count must be a positive integer, got: ${process.argv[2]}`);
  }

  const rows = ['clerkUserId,jwt'];
  for (let i = 0; i < count; i++) {
    const sub = clerkUserId(i);
    const jwt = await signTestToken({ sub, expiresInSeconds: EXPIRES_IN_SECONDS });
    rows.push(`${sub},${jwt}`);
  }

  await writeFile(outFile, rows.join('\n') + '\n', 'utf8');
  console.log(`Wrote ${count} tokens to ${outFile} (expires in ${EXPIRES_IN_SECONDS / 3600}h)`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
