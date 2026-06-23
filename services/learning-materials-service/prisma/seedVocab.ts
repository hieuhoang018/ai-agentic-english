import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';
import { PrismaClient } from './generated/client';

const prisma = new PrismaClient();

const SEED_FILE =
  process.env.SEED_FILE ?? path.join(__dirname, 'seed-data', 'vocab_seed.jsonl');
const ALLOW_SHARE_ALIKE = process.env.ALLOW_SHARE_ALIKE === 'true';

// Substrings that mark a license as copyleft / share-alike. Blocked unless opted in.
const SHARE_ALIKE_MARKERS = ['BY-SA', 'ShareAlike', 'GPL'];

function licenseAllowed(license: string): boolean {
  if (ALLOW_SHARE_ALIKE) return true;
  const upper = license.toUpperCase();
  return !SHARE_ALIKE_MARKERS.some((marker) => upper.includes(marker.toUpperCase()));
}

interface VocabSenseRecord {
  definition: string;
  example?: string | null;
  synonyms?: string[];
}

interface VocabPronRecord {
  ipa: string;
  variant?: string;
  is_primary?: boolean;
}

interface VocabEntryRecord {
  lemma: string;
  pos: string;
  cefr_level: string;
  freq_rank: number | null;
  domain_tag: string;
  source: string;
  license: string;
  senses?: VocabSenseRecord[];
  pronunciations?: VocabPronRecord[];
}

async function loadEntry(rec: VocabEntryRecord) {
  const entry = await prisma.vocabEntry.upsert({
    where: { lemma_pos: { lemma: rec.lemma, pos: rec.pos } },
    update: {
      cefrLevel: rec.cefr_level,
      freqRank: rec.freq_rank,
      domainTag: rec.domain_tag,
      source: rec.source,
      license: rec.license,
    },
    create: {
      lemma: rec.lemma,
      pos: rec.pos,
      cefrLevel: rec.cefr_level,
      freqRank: rec.freq_rank,
      domainTag: rec.domain_tag,
      source: rec.source,
      license: rec.license,
    },
  });

  // Replace children so re-runs converge (delete + reinsert is fully idempotent).
  await prisma.vocabSense.deleteMany({ where: { vocabEntryId: entry.id } });
  await prisma.vocabPron.deleteMany({ where: { vocabEntryId: entry.id } });

  const senses = rec.senses ?? [];
  for (let i = 0; i < senses.length; i++) {
    const sense = senses[i];
    await prisma.vocabSense.create({
      data: {
        vocabEntryId: entry.id,
        senseRank: i,
        definition: sense.definition,
        example: sense.example ?? null,
        synonyms: sense.synonyms ?? [],
      },
    });
  }

  for (const pron of rec.pronunciations ?? []) {
    await prisma.vocabPron.create({
      data: {
        vocabEntryId: entry.id,
        ipa: pron.ipa,
        variant: pron.variant ?? 'us',
        isPrimary: !!pron.is_primary,
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
    const rec = JSON.parse(line) as VocabEntryRecord;
    if (!licenseAllowed(rec.license)) {
      stats.skippedLicense++;
      continue;
    }
    await loadEntry(rec);
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
