import type { AudioBucket } from '@/lib/audio';

export type PracticeSkillId = 'reading' | 'listening' | 'writing';

export interface PracticeSkill {
  id: PracticeSkillId;
  title: string;
  icon: string;
  description: string;
}

export interface TheoryBlock {
  title: string;
  body: string;
}

export interface McqOption {
  id: string;
  label: string;
}

export interface PracticeQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  sourceText?: string;
  sourceLabel?: string;
  context?: string;
  contextLabel?: string;
  audioBucket?: AudioBucket;
  audioKey?: string;
  options?: McqOption[];
  placeholder?: string;
}

export type QuestionType = 'mcq' | 'shortAnswer' | 'writingPrompt';
