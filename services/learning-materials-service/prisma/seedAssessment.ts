import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';
import { PrismaClient } from './generated/client';

const prisma = new PrismaClient();

const SEED_FILE =
  process.env.SEED_FILE ?? path.join(__dirname, 'seed-data', 'assessment_seed.jsonl');

interface AssessmentQuestionRecord {
  id: string;
  skill: string;
  cefr_level_target: string;
  order: number;
  prompt: unknown;
  correct_answer: unknown;
}

async function loadQuestion(rec: AssessmentQuestionRecord) {
  await prisma.assessmentQuestion.upsert({
    where: { id: rec.id },
    update: {
      skill: rec.skill,
      cefrLevelTarget: rec.cefr_level_target,
      order: rec.order,
      prompt: rec.prompt as never,
      correctAnswer: rec.correct_answer as never,
    },
    create: {
      id: rec.id,
      skill: rec.skill,
      cefrLevelTarget: rec.cefr_level_target,
      order: rec.order,
      prompt: rec.prompt as never,
      correctAnswer: rec.correct_answer as never,
    },
  });
}

async function main() {
  const stats = { loaded: 0 };

  const rl = readline.createInterface({
    input: fs.createReadStream(SEED_FILE),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line) as AssessmentQuestionRecord;
    await loadQuestion(rec);
    stats.loaded++;
  }

  console.log(`Seed complete — loaded ${stats.loaded} assessment questions.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
