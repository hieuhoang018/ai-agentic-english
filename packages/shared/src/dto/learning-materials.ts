export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type Skill = 'reading' | 'writing' | 'listening' | 'speaking';
export type ExerciseType = 'mcq' | 'fill-blank' | 'sentence-correction' | 'listening-comprehension';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type LearningPathStatus = 'active' | 'superseded';

export interface ModuleDto {
  id: string;
  title: string;
  description: string;
  cefrLevel: CefrLevel;
  skillFocus: Skill;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface LessonDto {
  id: string;
  moduleId: string;
  title: string;
  content: unknown;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExerciseDto {
  id: string;
  lessonId: string;
  type: ExerciseType;
  prompt: unknown;
  difficulty: Difficulty;
  skill: Skill;
  createdAt: string;
  updatedAt: string;
}

export interface ExerciseInternalDto extends ExerciseDto {
  answerKey: unknown;
}

export interface PathDefinition {
  modules: Array<{
    moduleId: string;
    lessons: Array<{
      lessonId: string;
      exerciseIds: string[];
    }>;
  }>;
}

export interface LearningPathDto {
  id: string;
  userId: string;
  version: number;
  status: LearningPathStatus;
  generatedAt: string;
  pathDefinition: PathDefinition;
}

export interface AssessmentQuestionDto {
  id: string;
  skill: Skill;
  cefrLevelTarget: CefrLevel;
  prompt: unknown;
  order: number;
}

export interface AssessmentResultDto {
  levels: Partial<Record<Skill, CefrLevel>>;
}

export interface CatalogSummaryDto {
  modules: Array<{
    id: string;
    title: string;
    cefrLevel: CefrLevel;
    skillFocus: Skill;
    lessonCount: number;
    exerciseCount: number;
  }>;
  totalModules: number;
  totalLessons: number;
  totalExercises: number;
}
