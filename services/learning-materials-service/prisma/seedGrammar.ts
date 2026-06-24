import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';
import { PrismaClient } from './generated/client';

const prisma = new PrismaClient();

const SEED_FILE =
  process.env.SEED_FILE ?? path.join(__dirname, 'seed-data', 'grammar_seed.jsonl');
const ALLOW_SHARE_ALIKE = process.env.ALLOW_SHARE_ALIKE === 'true';

// Substrings that mark a license as copyleft / share-alike. Blocked unless opted in.
const SHARE_ALIKE_MARKERS = ['BY-SA', 'ShareAlike', 'GPL'];

function licenseAllowed(license: string): boolean {
  if (ALLOW_SHARE_ALIKE) return true;
  const upper = license.toUpperCase();
  return !SHARE_ALIKE_MARKERS.some((marker) => upper.includes(marker.toUpperCase()));
}

interface GrammarExampleRecord {
  sentence: string;
  note?: string | null;
}

interface GrammarPointRecord {
  title: string;
  category: string;
  cefr_level: string;
  explanation: string;
  source: string;
  license: string;
  examples?: GrammarExampleRecord[];
}

async function loadPoint(rec: GrammarPointRecord) {
  const point = await prisma.grammarPoint.upsert({
    where: { title_cefrLevel: { title: rec.title, cefrLevel: rec.cefr_level } },
    update: {
      category: rec.category,
      explanation: rec.explanation,
      source: rec.source,
      license: rec.license,
    },
    create: {
      title: rec.title,
      category: rec.category,
      cefrLevel: rec.cefr_level,
      explanation: rec.explanation,
      source: rec.source,
      license: rec.license,
    },
  });

  // Replace children so re-runs converge (delete + reinsert is fully idempotent).
  await prisma.grammarExample.deleteMany({ where: { grammarPointId: point.id } });

  for (const example of rec.examples ?? []) {
    await prisma.grammarExample.create({
      data: {
        grammarPointId: point.id,
        sentence: example.sentence,
        note: example.note ?? null,
      },
    });
  }
}

async function main() {
  const stats = { loaded: 0, skippedLicense: 0 };

  const rl = readline.createInterface({
    input: fs.createReadStream(SEED_FILE),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line) as GrammarPointRecord;
    if (!licenseAllowed(rec.license)) {
      stats.skippedLicense++;
      continue;
    }
    await loadPoint(rec);
    stats.loaded++;
  }

  console.log(
    `Seed complete — loaded ${stats.loaded}, ` +
      `skipped ${stats.skippedLicense} (share-alike, ALLOW_SHARE_ALIKE=${ALLOW_SHARE_ALIKE}).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
