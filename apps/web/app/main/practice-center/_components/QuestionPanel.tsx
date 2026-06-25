'use client';

import { useAuth } from '@clerk/nextjs';
import { useState } from 'react';

import { isApiError } from '@/lib/api/client';
import type { GradingRequest, GradingResponse } from '@/lib/api/types';

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

export default function QuestionPanel({ question }: QuestionPanelProps) {
  const { userId } = useAuth();
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [textAnswer, setTextAnswer] = useState('');
  const [grading, setGrading] = useState<GradingState>({ status: 'idle' });

  const selectedOption = question.options?.find((option) => option.id === selectedOptionId);
  const attemptedAnswer = question.type === 'mcq' ? (selectedOption?.label ?? '') : textAnswer;

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
    <section className="rounded-lg border border-outline-variant/50 border-t-4 border-t-primary bg-surface-container-lowest p-6 shadow-[0_8px_28px_-20px_rgba(15,23,42,0.5)]">
      <h2 className="mb-5 flex items-center gap-2 text-2xl font-bold text-primary">
        <span className="material-symbols-outlined">quiz</span>
        Câu hỏi thực hành
      </h2>

      {question.sourceText ? (
        <div className="mb-6 rounded-lg border border-outline-variant/50 bg-surface p-4 leading-7 text-on-surface">
          <p className="mb-2 font-semibold">{question.sourceLabel}</p>
          <p>{question.sourceText}</p>
        </div>
      ) : null}

      {question.context ? (
        <div className="mb-6 rounded-lg border-l-4 border-primary bg-surface p-4 text-on-surface-variant">
          {question.context}
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
          className="flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-sm font-semibold text-white transition-colors hover:bg-[#0047bb] disabled:cursor-wait disabled:opacity-70"
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
