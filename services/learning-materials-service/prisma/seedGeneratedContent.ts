import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';
import { PrismaClient } from './generated/client';

const prisma = new PrismaClient();

// Phase C of docs/learning-materials-content-roadmap.md: loads LLM-generated
// Module/Lesson/Exercise content (reviewed via git diff before this runs)
// grounded on the Phase 0/A/B primitives. Upserts by the generation script's
// own deterministic `id`s (slug-based, same convention prisma/seed.ts's
// hand-written fixture rows already use), so re-running the same JSONL is a
// no-op and re-running with additional rows accumulates rather than
// replacing — no natural-key/title-based uniqueness needed since the
// generation script controls ids directly.
const SEED_FILE =
  process.env.SEED_FILE ?? path.join(__dirname, 'seed-data', 'generated_content_seed.jsonl');

interface ExerciseRecord {
  id: string;
  type: string;
  prompt: unknown;
  answer_key: unknown;
  difficulty: string;
  skill: string;
}

interface LessonRecord {
  id: string;
  title: string;
  content: unknown;
  order: number;
  exercises: ExerciseRecord[];
}

interface ModuleRecord {
  id: string;
  title: string;
  description: string;
  cefr_level: string;
  skill_focus: string;
  order: number;
  lessons: LessonRecord[];
}

async function loadModule(rec: ModuleRecord) {
  await prisma.module.upsert({
    where: { id: rec.id },
    update: {
      title: rec.title,
      description: rec.description,
      cefrLevel: rec.cefr_level,
      skillFocus: rec.skill_focus,
      order: rec.order,
    },
    create: {
      id: rec.id,
      title: rec.title,
      description: rec.description,
      cefrLevel: rec.cefr_level,
      skillFocus: rec.skill_focus,
      order: rec.order,
    },
  });

  for (const lesson of rec.lessons) {
    await prisma.lesson.upsert({
      where: { id: lesson.id },
      update: {
        title: lesson.title,
        content: lesson.content as never,
        order: lesson.order,
      },
      create: {
        id: lesson.id,
        moduleId: rec.id,
        title: lesson.title,
        content: lesson.content as never,
        order: lesson.order,
      },
    });

    for (const exercise of lesson.exercises) {
      await prisma.exercise.upsert({
        where: { id: exercise.id },
        update: {
          type: exercise.type,
          prompt: exercise.prompt as never,
          answerKey: exercise.answer_key as never,
          difficulty: exercise.difficulty,
          skill: exercise.skill,
        },
        create: {
          id: exercise.id,
          lessonId: lesson.id,
          type: exercise.type,
          prompt: exercise.prompt as never,
          answerKey: exercise.answer_key as never,
          difficulty: exercise.difficulty,
          skill: exercise.skill,
        },
      });
    }
  }
}

async function main() {
  const stats = { modules: 0, lessons: 0, exercises: 0 };

  const rl = readline.createInterface({
    input: fs.createReadStream(SEED_FILE),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line) as ModuleRecord;
    await loadModule(rec);
    stats.modules++;
    stats.lessons += rec.lessons.length;
    stats.exercises += rec.lessons.reduce((sum, l) => sum + l.exercises.length, 0);
  }

  console.log(
    `Seed complete — loaded ${stats.modules} modules, ${stats.lessons} lessons, ` +
      `${stats.exercises} exercises.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
