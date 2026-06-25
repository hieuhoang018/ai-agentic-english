import { PrismaClient } from '../../prisma/generated/client';

export interface AppPrismaClient {
  $queryRaw: PrismaClient['$queryRaw'];
  module: PrismaClient['module'];
  lesson: PrismaClient['lesson'];
  exercise: PrismaClient['exercise'];
  learningPath: PrismaClient['learningPath'];
  assessmentQuestion: PrismaClient['assessmentQuestion'];
  vocabEntry: PrismaClient['vocabEntry'];
  grammarPoint: PrismaClient['grammarPoint'];
  passage: PrismaClient['passage'];
}
