'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect, useState } from 'react';

import { usePresignedAudioUrl } from '@/lib/audio';
import { isApiError } from '@/lib/api/client';
import type { GradingRequest, GradingResponse, TranslateResponse } from '@/lib/api/types';

import type { PracticeQuestion } from '../_types/practice';
import AnswerOption from './AnswerOption';

type QuestionPanelProps = {
  question: PracticeQuestion;
};

type GradingState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success'; result: GradingResponse }
  | { status: 'error'; message: string };

type TranslationState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; result: TranslateResponse }
  | { status: 'error'; message: string };

export default function QuestionPanel({ question }: QuestionPanelProps) {
  const { userId } = useAuth();
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [textAnswer, setTextAnswer] = useState('');
  const [grading, setGrading] = useState<GradingState>({ status: 'idle' });
  const [translationVisible, setTranslationVisible] = useState(false);
  const [translationsByQuestionId, setTranslationsByQuestionId] = useState<Record<string, TranslationState>>({});
  const audio = usePresignedAudioUrl(question.audioBucket, question.audioKey);

  useEffect(() => {
    setTranslationVisible(false);
  }, [question.id]);

  const translation = translationsByQuestionId[question.id] ?? { status: 'idle' };

  const toggleTranslation = async () => {
    if (translationVisible) {
      setTranslationVisible(false);
      return;
    }

    setTranslationVisible(true);
    if (translation.status === 'ready' || translation.status === 'loading' || !question.sourceText) return;

    setTranslationsByQuestionId((current) => ({ ...current, [question.id]: { status: 'loading' } }));

    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: question.sourceText, session_type: 'exercise' }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => undefined);
        throw new Error(typeof body?.message === 'string' ? body.message : 'Translation request failed.');
      }

      const result = (await response.json()) as TranslateResponse;
      setTranslationsByQuestionId((current) => ({ ...current, [question.id]: { status: 'ready', result } }));
    } catch (error) {
      setTranslationsByQuestionId((current) => ({
        ...current,
        [question.id]: {
          status: 'error',
          message: error instanceof Error ? error.message : 'Unable to translate this content right now.',
        },
      }));
    }
  };

  const selectedOption = question.options?.find((option) => option.id === selectedOptionId);
  const attemptedAnswer = question.type === 'mcq' ? (selectedOption?.label ?? '') : textAnswer;
  const shouldHideSourceText = Boolean(
    question.sourceText &&
      question.audioBucket &&
      audio.status !== 'error' &&
      grading.status !== 'success',
  );

  const submitAnswer = async () => {
    if (!userId) {
      setGrading({
        status: 'error',
        message: 'Your sign-in session is unavailable. Please sign in again.',
      });
      return;
    }

    if (!attemptedAnswer.trim()) {
      setGrading({ status: 'error', message: 'Enter or select an answer before checking it.' });
      return;
    }

    setGrading({ status: 'submitting' });

    try {
      const request: GradingRequest = {
        exerciseId: question.id,
        attemptedAnswer,
        userId,
      };
      const response = await fetch('/api/orchestrate/grading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => undefined);
        throw {
          status: response.status,
          message:
            typeof body === 'object' &&
            body !== null &&
            'message' in body &&
            typeof body.message === 'string'
              ? body.message
              : response.statusText,
          body,
        };
      }

      const result = (await response.json()) as GradingResponse;
      setGrading({ status: 'success', result });
    } catch (error) {
      setGrading({
        status: 'error',
        message: isApiError(error)
          ? error.message
          : 'Unable to check your answer right now. Please try again.',
      });
    }
  };

  const clearGrade = () => {
    if (grading.status !== 'idle') setGrading({ status: 'idle' });
  };

  return (
    <section className="rounded-lg border border-outline-variant/50 border-t-4 border-t-primary bg-surface-container-lowest p-4 shadow-[0_8px_28px_-20px_rgba(15,23,42,0.5)] sm:p-6">
      <h2 className="mb-5 flex items-center gap-2 text-xl font-bold text-primary sm:text-2xl">
        <span className="material-symbols-outlined">quiz</span>
        Câu hỏi thực hành
      </h2>

      {question.audioBucket ? (
        <section className="mb-6 rounded-lg border border-outline-variant/50 bg-surface p-4">
          <div className="flex items-center gap-2 font-bold text-on-surface">
            <span className="material-symbols-outlined text-primary">headphones</span>
            Listening audio
          </div>
          {audio.status === 'ready' ? (
            <audio
              controls
              preload="metadata"
              src={audio.url}
              onError={audio.markPlaybackFailed}
              className="mt-3 w-full"
            />
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void audio.load()}
                disabled={audio.status === 'loading'}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-[#0047bb] disabled:cursor-wait disabled:opacity-70"
              >
                <span className="material-symbols-outlined text-base">
                  {audio.status === 'loading' ? 'progress_activity' : 'play_arrow'}
                </span>
                {audio.status === 'loading' ? 'Loading audio...' : 'Load audio'}
              </button>
              {audio.status === 'error' ? (
                <p className="text-sm text-error" role="alert">
                  {audio.message}
                </p>
              ) : null}
            </div>
          )}
        </section>
      ) : null}

      {question.sourceText && !shouldHideSourceText ? (
        <div className="mb-6 rounded-lg border border-outline-variant/50 bg-surface p-4 leading-7 text-on-surface">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="font-semibold">{question.sourceLabel}</p>
            <button
              type="button"
              onClick={() => void toggleTranslation()}
              disabled={translation.status === 'loading'}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-outline-variant px-3 py-1 text-xs font-semibold text-on-surface-variant transition-colors hover:border-primary hover:text-primary disabled:cursor-wait disabled:opacity-70"
            >
              <span className="material-symbols-outlined text-sm">translate</span>
              {translation.status === 'loading' ? 'Đang dịch...' : translationVisible ? 'Ẩn bản dịch' : 'Xem bản dịch'}
            </button>
          </div>
          <p>{question.sourceText}</p>
          {translationVisible && translation.status === 'ready' ? (
            <div className="mt-3 rounded-lg border-l-4 border-primary bg-primary-container/10 p-3">
              <p>{translation.result.translated}</p>
              <p className="mt-2 text-xs text-on-surface-variant">Vùng ngôn ngữ: {translation.result.zone_label}</p>
            </div>
          ) : null}
          {translationVisible && translation.status === 'error' ? (
            <p className="mt-3 text-sm text-error" role="alert">
              {translation.message}
            </p>
          ) : null}
        </div>
      ) : null}

      {question.context ? (
        <div className="mb-6 rounded-lg border-l-4 border-primary bg-surface p-4 text-on-surface-variant">
          {question.contextLabel ? (
            <p className="mb-2 text-sm font-semibold text-on-surface">{question.contextLabel}</p>
          ) : null}
          <p>{question.context}</p>
        </div>
      ) : null}

      <p className="mb-4 font-semibold leading-6 text-on-surface">Question: {question.prompt}</p>

      {question.type === 'mcq' && question.options ? (
        <div className="space-y-3">
          {question.options.map((option) => (
            <AnswerOption
              key={option.id}
              option={option}
              selected={selectedOptionId === option.id}
              onSelect={(id) => {
                setSelectedOptionId(id);
                clearGrade();
              }}
            />
          ))}
        </div>
      ) : null}

      {question.type === 'shortAnswer' ? (
        <input
          value={textAnswer}
          onChange={(event) => {
            setTextAnswer(event.target.value);
            clearGrade();
          }}
          className="h-12 w-full rounded-lg border border-outline-variant bg-white px-4 outline-none transition-colors focus:border-primary"
          placeholder={question.placeholder ?? 'Enter your answer...'}
        />
      ) : null}

      {question.type === 'writingPrompt' ? (
        <textarea
          value={textAnswer}
          onChange={(event) => {
            setTextAnswer(event.target.value);
            clearGrade();
          }}
          className="min-h-48 w-full resize-none rounded-lg border border-outline-variant bg-white p-4 leading-7 outline-none transition-colors focus:border-primary"
          placeholder={question.placeholder ?? 'Enter your answer...'}
        />
      ) : null}

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={() => void submitAnswer()}
          disabled={grading.status === 'submitting'}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 text-sm font-semibold text-white transition-colors hover:bg-[#0047bb] disabled:cursor-wait disabled:opacity-70 sm:w-auto"
        >
          <span className="material-symbols-outlined text-base">auto_awesome</span>
          {grading.status === 'submitting' ? 'Checking...' : 'Check answer'}
        </button>
      </div>

      {grading.status === 'success' ? (
        <div
          className={`mt-5 rounded-lg border p-4 text-sm leading-6 ${grading.result.correct ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : 'border-red-200 bg-red-50 text-red-950'}`}
          role="status"
        >
          <p className="mb-1 font-bold">{grading.result.correct ? 'Correct!' : 'Not quite.'}</p>
          <p>{grading.result.feedback}</p>
          <p className="mt-3 font-semibold">Score: {grading.result.score}</p>
        </div>
      ) : null}

      {grading.status === 'error' ? (
        <p
          className="mt-5 rounded-lg border border-error/30 bg-error-container/30 p-4 text-sm text-error"
          role="alert"
        >
          {grading.message}
        </p>
      ) : null}
    </section>
  );
}
