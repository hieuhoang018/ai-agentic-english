import type { ExerciseDto, LessonDto } from '@/lib/api/types';

import type {
  PracticeQuestion,
  PracticeSkill,
  PracticeSkillId,
  TheoryBlock,
} from '../_types/practice';

const practiceSkills: Record<PracticeSkillId, PracticeSkill> = {
  reading: {
    id: 'reading',
    title: 'Luyện Đọc',
    icon: 'menu_book',
    description: 'Nâng cao vốn từ vựng và kỹ năng hiểu qua các bài đọc thực tế.',
  },
  listening: {
    id: 'listening',
    title: 'Luyện Nghe',
    icon: 'headphones',
    description: 'Cải thiện khả năng nhận diện âm thanh và ý chính trong hội thoại.',
  },
  writing: {
    id: 'writing',
    title: 'Luyện Viết',
    icon: 'edit',
    description: 'Luyện ngữ pháp và cách diễn đạt ý tưởng rõ ràng, tự nhiên.',
  },
};

export function isPracticeSkillId(value: string): value is PracticeSkillId {
  return value === 'reading' || value === 'listening' || value === 'writing';
}

export function getPracticeSkill(skill: PracticeSkillId) {
  return practiceSkills[skill];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function promptText(prompt: Record<string, unknown> | null, key: string) {
  return prompt ? asString(prompt[key]) : undefined;
}

function toOptions(prompt: Record<string, unknown> | null) {
  if (!prompt || !Array.isArray(prompt.options)) return undefined;

  const options = prompt.options
    .map(asString)
    .filter((option): option is string => Boolean(option))
    .map((label, index) => ({ id: `${index}`, label }));

  return options.length > 0 ? options : undefined;
}

export function toPracticeQuestion(exercise: ExerciseDto): PracticeQuestion {
  const prompt = asRecord(exercise.prompt);
  const rawPrompt = asString(exercise.prompt);
  const passage = promptText(prompt, 'passage');
  const transcript = promptText(prompt, 'transcript');
  const sentence = promptText(prompt, 'sentence');
  const instruction = promptText(prompt, 'instruction');
  const question = promptText(prompt, 'question');
  const options = toOptions(prompt);
  const type = options
    ? 'mcq'
    : exercise.type === 'sentence-correction'
      ? 'writingPrompt'
      : 'shortAnswer';

  return {
    id: exercise.id,
    type,
    prompt: question ?? instruction ?? rawPrompt ?? sentence ?? 'Answer the exercise.',
    sourceText: passage ?? transcript,
    sourceLabel: transcript
      ? 'Listen to the transcript:'
      : passage
        ? 'Read the following passage:'
        : undefined,
    context: sentence && sentence !== question && sentence !== instruction ? sentence : undefined,
    options,
    placeholder:
      type === 'writingPrompt' ? 'Enter your corrected sentence...' : 'Enter your answer...',
  };
}

export function toTheoryBlocks(lesson: LessonDto): TheoryBlock[] {
  const content = asRecord(lesson.content);
  const introduction = promptText(content, 'introduction');

  return [
    {
      title: lesson.title,
      body: introduction ?? 'Review the lesson material, then complete the exercise below.',
    },
  ];
}
