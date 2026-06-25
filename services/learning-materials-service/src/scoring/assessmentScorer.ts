import { AssessmentResultDto, CefrLevel, Skill } from '@ai-agentic-english/shared';

const CEFR_LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export const SCORING_THRESHOLD = 0.6;

export interface ScoredQuestion {
  id: string;
  skill: string;
  cefrLevelTarget: string;
  correctAnswer: unknown;
}

export interface SubmittedAnswer {
  questionId: string;
  answer: unknown;
}

export function scoreAssessment(
  questions: ScoredQuestion[],
  answers: SubmittedAnswer[],
): AssessmentResultDto {
  const answerMap = new Map(answers.map((a) => [a.questionId, a.answer]));

  const bySkillLevel: Record<string, Record<string, ScoredQuestion[]>> = {};
  for (const q of questions) {
    bySkillLevel[q.skill] ??= {};
    bySkillLevel[q.skill][q.cefrLevelTarget] ??= [];
    bySkillLevel[q.skill][q.cefrLevelTarget].push(q);
  }

  const levels: Partial<Record<Skill, CefrLevel>> = {};

  for (const [skill, byLevel] of Object.entries(bySkillLevel)) {
    let highestPassing: CefrLevel | undefined;

    for (const level of CEFR_LEVELS) {
      const bucket = byLevel[level];
      if (!bucket || bucket.length === 0) continue;

      const correct = bucket.filter((q) => {
        const submitted = answerMap.get(q.id);
        return JSON.stringify(submitted) === JSON.stringify(q.correctAnswer);
      }).length;

      if (correct / bucket.length >= SCORING_THRESHOLD) {
        highestPassing = level;
      } else {
        break; // sequential gating: stop climbing at the first level that fails
      }
    }

    if (highestPassing !== undefined) {
      levels[skill as Skill] = highestPassing;
    }
  }

  return { levels };
}
