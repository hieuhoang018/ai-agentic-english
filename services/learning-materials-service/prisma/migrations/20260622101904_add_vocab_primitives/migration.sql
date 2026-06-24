-- CreateTable
CREATE TABLE "vocab_entries" (
    "id" TEXT NOT NULL,
    "lemma" TEXT NOT NULL,
    "pos" TEXT NOT NULL,
    "cefrLevel" TEXT NOT NULL,
    "freqRank" INTEGER,
    "domainTag" TEXT,
    "source" TEXT NOT NULL,
    "license" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vocab_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vocab_senses" (
    "id" TEXT NOT NULL,
    "vocabEntryId" TEXT NOT NULL,
    "senseRank" INTEGER NOT NULL,
    "definition" TEXT NOT NULL,
    "example" TEXT,
    "synonyms" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vocab_senses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vocab_pronunciations" (
    "id" TEXT NOT NULL,
    "vocabEntryId" TEXT NOT NULL,
    "ipa" TEXT NOT NULL,
    "variant" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "audioKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vocab_pronunciations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vocab_entries_lemma_pos_key" ON "vocab_entries"("lemma", "pos");

-- AddForeignKey
ALTER TABLE "vocab_senses" ADD CONSTRAINT "vocab_senses_vocabEntryId_fkey" FOREIGN KEY ("vocabEntryId") REFERENCES "vocab_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocab_pronunciations" ADD CONSTRAINT "vocab_pronunciations_vocabEntryId_fkey" FOREIGN KEY ("vocabEntryId") REFERENCES "vocab_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
