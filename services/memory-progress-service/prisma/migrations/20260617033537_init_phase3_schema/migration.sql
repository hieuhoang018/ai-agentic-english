-- CreateTable
CREATE TABLE "learner_models" (
    "userId" TEXT NOT NULL,
    "currentLevel" JSONB NOT NULL,
    "dailyTimeBudgetMinutes" INTEGER NOT NULL,
    "goals" JSONB NOT NULL,
    "weakAreas" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learner_models_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "progress" (
    "userId" TEXT NOT NULL,
    "pathId" TEXT NOT NULL,
    "currentModuleId" TEXT,
    "currentLessonId" TEXT,
    "currentExerciseId" TEXT,
    "completedExerciseIds" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "progress_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "review_schedules" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "due" TIMESTAMP(3) NOT NULL,
    "stability" DOUBLE PRECISION NOT NULL,
    "difficulty" DOUBLE PRECISION NOT NULL,
    "lastReviewedAt" TIMESTAMP(3),
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "state" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mistakes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "errorCategory" TEXT NOT NULL,
    "errorLabel" TEXT NOT NULL,
    "detail" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mistakes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "submittedAnswer" JSONB NOT NULL,
    "isCorrect" BOOLEAN,
    "score" DOUBLE PRECISION,
    "feedback" JSONB,
    "gradedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vocab_items" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "meaning" TEXT NOT NULL,
    "exampleSentence" TEXT,
    "sourceExerciseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vocab_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "review_schedules_userId_due_idx" ON "review_schedules"("userId", "due");

-- CreateIndex
CREATE UNIQUE INDEX "review_schedules_userId_itemId_itemType_key" ON "review_schedules"("userId", "itemId", "itemType");

-- CreateIndex
CREATE INDEX "mistakes_userId_errorCategory_idx" ON "mistakes"("userId", "errorCategory");

-- CreateIndex
CREATE INDEX "attempts_userId_exerciseId_idx" ON "attempts"("userId", "exerciseId");

-- CreateIndex
CREATE INDEX "vocab_items_userId_idx" ON "vocab_items"("userId");
