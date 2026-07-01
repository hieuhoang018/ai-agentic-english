import type { ExerciseDto, LessonDto } from '@/lib/api/types';
import type { AudioBucket } from '@/lib/audio';

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
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return undefined;
}

function promptText(prompt: Record<string, unknown> | null, key: string) {
  return prompt ? asString(prompt[key]) : undefined;
}

function firstPromptText(prompt: Record<string, unknown> | null, keys: string[]) {
  for (const key of keys) {
    const value = promptText(prompt, key);
    if (value) return value;
  }

  return undefined;
}

function asAudioBucket(value: unknown): AudioBucket | undefined {
  return value === 'passage-audio' || value === 'assessment-audio' ? value : undefined;
}

function optionLabel(value: unknown) {
  const directLabel = asString(value);
  if (directLabel) return directLabel;

  const option = asRecord(value);
  return firstPromptText(option, ['label', 'text', 'value', 'answer', 'option']);
}

function toOptions(prompt: Record<string, unknown> | null) {
  if (!prompt) return undefined;

  const optionSource = Array.isArray(prompt.options)
    ? prompt.options
    : Array.isArray(prompt.choices)
      ? prompt.choices
      : Array.isArray(prompt.answers)
        ? prompt.answers
        : null;

  if (!optionSource) return undefined;

  const options = optionSource
    .map(optionLabel)
    .filter((option): option is string => Boolean(option))
    .map((label, index) => ({ id: `${index}`, label }));

  return options.length > 0 ? options : undefined;
}

function questionPromptForType(
  type: ExerciseDto['type'],
  prompt: Record<string, unknown> | null,
  rawPrompt?: string,
) {
  if (type === 'fill-blank') {
    return (
      firstPromptText(prompt, ['instruction', 'question', 'prompt']) ??
      'Fill in the blank with the correct answer.'
    );
  }

  if (type === 'sentence-correction') {
    return (
      firstPromptText(prompt, ['instruction', 'question', 'prompt']) ??
      'Correct the sentence.'
    );
  }

  if (type === 'listening-comprehension') {
    return (
      firstPromptText(prompt, ['question', 'instruction', 'prompt']) ??
      'Listen and choose the best answer.'
    );
  }

  return (
    firstPromptText(prompt, ['question', 'instruction', 'prompt']) ??
    rawPrompt ??
    'Choose the best answer.'
  );
}

export function toPracticeQuestion(exercise: ExerciseDto): PracticeQuestion {
  const prompt = asRecord(exercise.prompt);
  const rawPrompt = asString(exercise.prompt);
  const promptBody = firstPromptText(prompt, ['text', 'sourceText']);
  const passage =
    firstPromptText(prompt, ['passage']) ?? (exercise.skill === 'reading' ? promptBody : undefined);
  const transcript = firstPromptText(prompt, ['transcript', 'script']);
  const sentence =
    firstPromptText(prompt, ['sentence']) ?? (exercise.skill === 'writing' ? promptBody : undefined);
  const audioKey = firstPromptText(prompt, ['audioKey', 'audio_key', 'objectKey', 'object_key']);
  const audioBucket = asAudioBucket(prompt?.audioBucket ?? prompt?.audio_bucket);
  const isListening = exercise.skill === 'listening' || exercise.type === 'listening-comprehension';
  const options = toOptions(prompt);
  const type =
    exercise.type === 'sentence-correction' ? 'writingPrompt' : options ? 'mcq' : 'shortAnswer';
  const sourceText = isListening ? transcript : passage;

  return {
    id: exercise.id,
    type,
    prompt: questionPromptForType(exercise.type, prompt, rawPrompt),
    sourceText,
    sourceLabel: isListening
      ? 'Transcript:'
      : sourceText
        ? 'Read the following passage:'
        : undefined,
    context: sentence,
    contextLabel:
      exercise.type === 'fill-blank'
        ? 'Complete the sentence:'
        : exercise.type === 'sentence-correction'
          ? 'Sentence to correct:'
          : undefined,
    audioBucket: isListening && audioKey ? (audioBucket ?? 'passage-audio') : undefined,
    audioKey: isListening ? audioKey : undefined,
    options,
    placeholder:
      exercise.type === 'sentence-correction'
        ? 'Enter your corrected sentence...'
        : exercise.type === 'fill-blank'
          ? 'Enter the missing word or phrase...'
          : 'Enter your answer...',
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
