import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';
import { PrismaClient } from './generated/client';

const prisma = new PrismaClient();

const SEED_FILE =
  process.env.SEED_FILE ?? path.join(__dirname, 'seed-data', 'passage_seed.jsonl');
const ALLOW_SHARE_ALIKE = process.env.ALLOW_SHARE_ALIKE === 'true';

// Substrings that mark a license as copyleft / share-alike. Blocked unless opted in.
const SHARE_ALIKE_MARKERS = ['BY-SA', 'ShareAlike', 'GPL'];

function licenseAllowed(license: string): boolean {
  if (ALLOW_SHARE_ALIKE) return true;
  const upper = license.toUpperCase();
  return !SHARE_ALIKE_MARKERS.some((marker) => upper.includes(marker.toUpperCase()));
}

interface MediaAssetRecord {
  object_key: string;
  mime: string;
  duration_ms: number | null;
  transcript?: string | null;
  alignment?: unknown;
  source: string;
  license: string;
}

interface PassageRecord {
  title: string;
  body: string;
  cefr_level: string;
  topic_tags: string[];
  is_generated: boolean;
  source: string;
  license: string;
  media?: MediaAssetRecord | null;
}

async function loadPassage(rec: PassageRecord) {
  let mediaAssetId: string | undefined;
  if (rec.media) {
    const media = await prisma.mediaAsset.upsert({
      where: { objectKey: rec.media.object_key },
      update: {
        mime: rec.media.mime,
        durationMs: rec.media.duration_ms,
        transcript: rec.media.transcript ?? null,
        alignment: (rec.media.alignment ?? null) as never,
        source: rec.media.source,
        license: rec.media.license,
      },
      create: {
        objectKey: rec.media.object_key,
        mime: rec.media.mime,
        durationMs: rec.media.duration_ms,
        transcript: rec.media.transcript ?? null,
        alignment: (rec.media.alignment ?? null) as never,
        source: rec.media.source,
        license: rec.media.license,
      },
    });
    mediaAssetId = media.id;
  }

  await prisma.passage.upsert({
    where: { title_source: { title: rec.title, source: rec.source } },
    update: {
      body: rec.body,
      cefrLevel: rec.cefr_level,
      topicTags: rec.topic_tags,
      isGenerated: rec.is_generated,
      license: rec.license,
      mediaAssetId,
    },
    create: {
      title: rec.title,
      body: rec.body,
      cefrLevel: rec.cefr_level,
      topicTags: rec.topic_tags,
      isGenerated: rec.is_generated,
      source: rec.source,
      license: rec.license,
      mediaAssetId,
    },
  });
}

async function main() {
  const stats = { loaded: 0, skippedLicense: 0 };

  const rl = readline.createInterface({
    input: fs.createReadStream(SEED_FILE),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line) as PassageRecord;
    if (!licenseAllowed(rec.license)) {
      stats.skippedLicense++;
      continue;
    }
    await loadPassage(rec);
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
