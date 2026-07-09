-- CreateIndex
CREATE INDEX "exercises_lessonId_idx" ON "exercises"("lessonId");

-- CreateIndex
CREATE INDEX "grammar_examples_grammarPointId_idx" ON "grammar_examples"("grammarPointId");

-- CreateIndex
CREATE INDEX "learning_paths_userId_status_idx" ON "learning_paths"("userId", "status");

-- CreateIndex
CREATE INDEX "lessons_moduleId_idx" ON "lessons"("moduleId");

-- CreateIndex
CREATE INDEX "vocab_entries_cefrLevel_idx" ON "vocab_entries"("cefrLevel");

-- CreateIndex
CREATE INDEX "vocab_pronunciations_vocabEntryId_idx" ON "vocab_pronunciations"("vocabEntryId");

-- CreateIndex
CREATE INDEX "vocab_senses_vocabEntryId_idx" ON "vocab_senses"("vocabEntryId");
