import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MockLlmClient, MockSttClient, MockTtsClient, createLlmClient, createSttClient, createTtsClient, getInferenceMode } from '../inference';
import { CatalogSummaryDto } from '../dto/learning-materials';

const catalogSummary: CatalogSummaryDto = {
  modules: [
    { id: 'mod-1', title: 'Basics', cefrLevel: 'A1', skillFocus: 'reading', lessonCount: 2, exerciseCount: 4 },
    { id: 'mod-2', title: 'Intermediate', cefrLevel: 'B1', skillFocus: 'writing', lessonCount: 3, exerciseCount: 6 },
  ],
  totalModules: 2,
  totalLessons: 5,
  totalExercises: 10,
};

describe('getInferenceMode', () => {
  const originalMode = process.env.INFERENCE_MODE;

  afterEach(() => {
    process.env.INFERENCE_MODE = originalMode;
  });

  it('defaults to mock', () => {
    delete process.env.INFERENCE_MODE;
    expect(getInferenceMode()).toBe('mock');
  });

  it('rejects an invalid mode', () => {
    process.env.INFERENCE_MODE = 'bogus';
    expect(() => getInferenceMode()).toThrow(/INFERENCE_MODE/);
  });
});

describe('inference client factories', () => {
  beforeEach(() => {
    delete process.env.INFERENCE_MODE;
  });

  it('createLlmClient returns a MockLlmClient in mock mode', () => {
    expect(createLlmClient()).toBeInstanceOf(MockLlmClient);
  });

  it('createSttClient returns a MockSttClient in mock mode', () => {
    expect(createSttClient()).toBeInstanceOf(MockSttClient);
  });

  it('createTtsClient returns a MockTtsClient in mock mode', () => {
    expect(createTtsClient()).toBeInstanceOf(MockTtsClient);
  });

  it('throws for live mode (no adapter exists yet)', () => {
    process.env.INFERENCE_MODE = 'live';
    expect(() => createLlmClient()).toThrow(/Live LLM adapter/);
    expect(() => createSttClient()).toThrow(/Live STT adapter/);
    expect(() => createTtsClient()).toThrow(/Live TTS adapter/);
  });
});

describe('MockLlmClient', () => {
  const client = new MockLlmClient();

  it('generateLearningPath produces a path from the catalog summary', async () => {
    const result = await client.generateLearningPath({
      currentLevel: { reading: 'A1' },
      dailyTimeBudgetMinutes: 15,
      goals: ['job-interview'],
      catalogSummary,
    });

    expect(result.pathDefinition.modules).toHaveLength(2);
    expect(result.pathDefinition.modules[0].moduleId).toBe('mod-1');
  });

  it('gradeOpenResponse is deterministic for the same input', async () => {
    const exercise = {
      id: 'ex-1',
      lessonId: 'les-1',
      type: 'fill-blank' as const,
      prompt: {},
      answerKey: {},
      difficulty: 'easy' as const,
      skill: 'writing' as const,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };

    const a = await client.gradeOpenResponse({ exercise, submittedAnswer: 'My answer' });
    const b = await client.gradeOpenResponse({ exercise, submittedAnswer: 'My answer' });
    expect(a).toEqual(b);
    expect(a.isCorrect).toBe(true);

    const empty = await client.gradeOpenResponse({ exercise, submittedAnswer: '' });
    expect(empty.isCorrect).toBe(false);
    expect(empty.errorLabels).toHaveLength(1);
  });

  it('generateHighlightContent handles both mistake and vocab kinds', async () => {
    const mistake = await client.generateHighlightContent({ kind: 'mistake', errorCategory: 'grammar', errorLabel: 'tense' });
    expect(mistake.explanation).toContain('grammar');

    const vocab = await client.generateHighlightContent({ kind: 'vocab', term: 'ubiquitous', meaning: 'everywhere' });
    expect(vocab.explanation).toContain('ubiquitous');
  });

  it('analyzeSessionTranscript returns no findings for an empty transcript', async () => {
    const result = await client.analyzeSessionTranscript({ transcript: [] });
    expect(result.patternFindings).toEqual([]);
  });
});

describe('MockSttClient / MockTtsClient', () => {
  it('transcribeAudio returns a canned transcript', async () => {
    const result = await new MockSttClient().transcribeAudio({ audio: new Uint8Array() });
    expect(result.transcript).toBeTypeOf('string');
  });

  it('synthesizeSpeech returns audio bytes', async () => {
    const result = await new MockTtsClient().synthesizeSpeech({ text: 'hello' });
    expect(result.audio).toBeInstanceOf(Uint8Array);
    expect(result.encoding).toBeTypeOf('string');
  });
});
