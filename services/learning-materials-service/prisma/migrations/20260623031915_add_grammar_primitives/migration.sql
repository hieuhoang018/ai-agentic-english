-- CreateTable
CREATE TABLE "grammar_points" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "cefrLevel" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "license" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grammar_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grammar_examples" (
    "id" TEXT NOT NULL,
    "grammarPointId" TEXT NOT NULL,
    "sentence" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grammar_examples_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "grammar_points_title_cefrLevel_key" ON "grammar_points"("title", "cefrLevel");

-- AddForeignKey
ALTER TABLE "grammar_examples" ADD CONSTRAINT "grammar_examples_grammarPointId_fkey" FOREIGN KEY ("grammarPointId") REFERENCES "grammar_points"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
