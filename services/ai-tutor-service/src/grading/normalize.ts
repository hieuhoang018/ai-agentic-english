export function normalizeAnswer(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, ' ') : '';
}

export interface DeterministicGradingResult {
  isCorrect: boolean;
  score: number;
}

export function compareToAnswerKey(answerKey: unknown, submittedAnswer: unknown): DeterministicGradingResult {
  const expected = normalizeAnswer((answerKey as { answer?: unknown })?.answer);
  const actual = normalizeAnswer(submittedAnswer);
  const isCorrect = expected.length > 0 && expected === actual;
  return { isCorrect, score: isCorrect ? 1 : 0 };
}
