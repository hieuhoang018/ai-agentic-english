-- AlterTable
ALTER TABLE "learner_models" ADD COLUMN     "currentStreakDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastActivityDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "progress" ADD COLUMN     "firstLessonCompletedAt" TIMESTAMP(3);
