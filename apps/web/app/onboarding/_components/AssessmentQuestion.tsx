'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'

import { usePresignedAudioUrl, type AudioBucket } from '@/lib/audio'
import { isApiError } from '@/lib/api/client'
import type { AssessmentQuestionDto, AssessmentResultDto, CefrLevel, Skill } from '@/lib/api/types'

import { placementSkillIds, type PlacementSkillId, type SkillId } from '../_types/onboarding'
import { applyA1FallbackToTestedSkills, assessmentLevelsToScore, normalizeAssessmentLevels } from '../_utils/onboarding-request'
import { onboardingRoutes } from '../_utils/onboarding-routes'
import { useOnboarding } from './OnboardingProvider'

type AssessmentState =
  | { status: 'loading' }
  | { status: 'success'; questions: AssessmentQuestionDto[] }
  | { status: 'error'; message: string }

type AssessmentPrompt = {
  audioKey?: string
  audioBucket?: AudioBucket
  passage?: string
  transcript?: string
  sentence?: string
  question?: string
  instruction?: string
  options: string[]
}

const skillLabels: Record<PlacementSkillId, string> = {
  reading: 'Reading',
  writing: 'Writing',
  listening: 'Listening',
}

const assessmentSkillSet = new Set<Skill>(placementSkillIds)

function isPlacementSkill(skill: Skill): skill is PlacementSkillId {
  return assessmentSkillSet.has(skill)
}

function asAudioBucket(value: unknown): AudioBucket | undefined {
  return value === 'passage-audio' || value === 'assessment-audio' ? value : undefined
}

function selectAssessmentQuestions(questions: AssessmentQuestionDto[]) {
  const selectedQuestions = questions.filter((question) => isPlacementSkill(question.skill))
  const missingSkills = placementSkillIds.filter((skill) => !selectedQuestions.some((question) => question.skill === skill))

  if (selectedQuestions.length === 0 || missingSkills.length > 0) {
    throw new Error('The assessment question bank must include reading, writing, and listening questions.')
  }

  return selectedQuestions
}

function parsePrompt(prompt: unknown): AssessmentPrompt {
  if (typeof prompt !== 'object' || prompt === null || Array.isArray(prompt)) {
    return { options: [] }
  }

  const value = prompt as Record<string, unknown>
  const getText = (key: string) => (typeof value[key] === 'string' ? value[key] : undefined)
  const options = Array.isArray(value.options) ? value.options.filter((option): option is string => typeof option === 'string') : []

  return {
    audioKey: getText('audioKey'),
    audioBucket: asAudioBucket(value.audioBucket),
    passage: getText('passage'),
    transcript: getText('transcript'),
    sentence: getText('sentence'),
    question: getText('question'),
    instruction: getText('instruction'),
    options,
  }
}

async function parseJsonResponse<TResponse>(response: Response): Promise<TResponse> {
  if (!response.ok) {
    const body = await response.json().catch(() => undefined)
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
    }
  }

  return response.json() as Promise<TResponse>
}

export default function AssessmentQuestion() {
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuth()
  const router = useRouter()
  const { updateProfile } = useOnboarding()
  const [state, setState] = useState<AssessmentState>({ status: 'loading' })
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const hasLoadedQuestions = useRef(false)
  const activeQuestion = state.status === 'success' ? state.questions[currentIndex] : null
  const activePrompt: AssessmentPrompt = activeQuestion ? parsePrompt(activeQuestion.prompt) : { options: [] }
  const activeAudio = usePresignedAudioUrl(
    activeQuestion?.skill === 'listening' ? (activePrompt.audioBucket ?? 'assessment-audio') : null,
    activeQuestion?.skill === 'listening' ? activePrompt.audioKey : null,
  )

  const loadQuestions = useCallback(async () => {
    if (!isAuthLoaded) return

    if (!isSignedIn) {
      setState({
        status: 'error',
        message: 'Phiên đăng nhập chưa sẵn sàng. Vui lòng đăng nhập lại rồi thử lại.',
      })
      return
    }

    setState({ status: 'loading' })

    try {
      const response = await fetch('/api/assessment/questions', { cache: 'no-store' })
      const questions = await parseJsonResponse<AssessmentQuestionDto[]>(response)
      if (questions.length === 0) {
        setState({ status: 'error', message: 'Chưa có câu hỏi đánh giá. Vui lòng thử lại sau.' })
        return
      }

      setCurrentIndex(0)
      setAnswers({})
      setSubmissionError(null)
      setState({ status: 'success', questions: selectAssessmentQuestions(questions) })
    } catch (error) {
      setState({
        status: 'error',
        message: isApiError(error) ? error.message : 'Không thể tải bài đánh giá. Vui lòng thử lại.',
      })
    }
  }, [isAuthLoaded, isSignedIn])

  useEffect(() => {
    updateProfile({ assessmentMethod: 'test' })
  }, [updateProfile])

  useEffect(() => {
    if (!isAuthLoaded) return
    if (hasLoadedQuestions.current) return
    hasLoadedQuestions.current = true
    void loadQuestions()
  }, [isAuthLoaded, loadQuestions])

  const retryLoadingQuestions = () => {
    hasLoadedQuestions.current = true
    void loadQuestions()
  }

  if (state.status === 'loading') {
    return (
      <div className="flex min-h-72 flex-col items-center justify-center text-center">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
        <p className="mt-4 font-semibold text-on-surface">Đang tải câu hỏi đánh giá...</p>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <section className="rounded-lg border border-error/30 bg-white p-6 text-center" role="alert">
        <span className="material-symbols-outlined text-4xl text-error">error</span>
        <p className="mt-3 text-on-surface-variant">{state.message}</p>
        <button type="button" onClick={retryLoadingQuestions} className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 font-bold text-white">
          <span className="material-symbols-outlined">refresh</span>
          Thử lại
        </button>
      </section>
    )
  }

  const { questions } = state
  const question = questions[currentIndex]
  const prompt = activePrompt
  const answer = answers[question.id] ?? ''
  const skillLabel = isPlacementSkill(question.skill) ? skillLabels[question.skill] : 'Assessment'
  const isFirstQuestion = currentIndex === 0
  const isLastQuestion = currentIndex === questions.length - 1
  const questionText = prompt.question ?? prompt.instruction ?? 'Chọn hoặc nhập câu trả lời phù hợp nhất.'

  const selectAnswer = (nextAnswer: string) => {
    setAnswers((currentAnswers) => ({ ...currentAnswers, [question.id]: nextAnswer }))
  }

  const submitAssessment = async () => {
    if (!answer.trim() || isSubmitting) return

    setIsSubmitting(true)
    setSubmissionError(null)

    try {
      const response = await fetch('/api/assessment/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: questions.map((assessmentQuestion) => ({
            questionId: assessmentQuestion.id,
            answer: { answer: answers[assessmentQuestion.id].trim() },
          })),
        }),
      })
      const result = await parseJsonResponse<AssessmentResultDto>(response)
      const scoredAssessmentLevels = normalizeAssessmentLevels(result.levels as Partial<Record<SkillId, CefrLevel>>)
      const testedSkills = placementSkillIds.filter((skill) => questions.some((assessmentQuestion) => assessmentQuestion.skill === skill))
      const assessmentLevels = applyA1FallbackToTestedSkills(scoredAssessmentLevels, testedSkills)

      updateProfile({
        assessmentMethod: 'test',
        assessmentLevels,
        assessmentCorrectAnswerCount: result.correctAnswers,
        assessmentQuestionCount: questions.length,
        levelScore: assessmentLevelsToScore(assessmentLevels),
      })
      router.push(onboardingRoutes.assessmentResults)
    } catch (error) {
      setSubmissionError(isApiError(error) ? error.message : 'Không thể chấm bài đánh giá. Vui lòng thử lại.')
      setIsSubmitting(false)
    }
  }

  const goNext = () => {
    if (!answer.trim()) return

    if (isLastQuestion) {
      void submitAssessment()
      return
    }

    setCurrentIndex((index) => index + 1)
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <span className="rounded-lg border border-primary/20 bg-blue-50 px-4 py-2 text-2xl font-bold text-primary">{skillLabel}</span>
        <span className="rounded-full bg-blue-50 px-4 py-2 font-bold text-primary">Câu {currentIndex + 1} / {questions.length} · {question.cefrLevelTarget}</span>
      </div>
      {question.skill === 'listening' && activeAudio.hasAudio ? (
        <section className="mb-5 rounded-lg border border-outline-variant bg-white p-4">
          <div className="flex items-center gap-2 font-bold text-on-surface">
            <span className="material-symbols-outlined text-primary">headphones</span>
            Listening audio
          </div>
          {activeAudio.status === 'ready' ? (
            <audio
              key={question.id}
              controls
              preload="metadata"
              src={activeAudio.url}
              onError={activeAudio.markPlaybackFailed}
              className="mt-3 w-full"
            />
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void activeAudio.load()}
                disabled={activeAudio.status === 'loading'}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-70"
              >
                <span className="material-symbols-outlined text-base">{activeAudio.status === 'loading' ? 'progress_activity' : 'play_arrow'}</span>
                {activeAudio.status === 'loading' ? 'Loading audio...' : 'Load audio'}
              </button>
              {activeAudio.status === 'error' ? <p className="text-sm text-error" role="alert">{activeAudio.message}</p> : null}
            </div>
          )}
        </section>
      ) : null}
      {prompt.passage ? <div className="mb-5 rounded-lg border-l-4 border-primary bg-surface p-4 leading-7 text-on-surface-variant">{prompt.passage}</div> : null}
      {prompt.transcript && (question.skill !== 'listening' || !activeAudio.hasAudio || activeAudio.status === 'error') ? <div className="mb-5 rounded-lg border-l-4 border-primary bg-surface p-4 leading-7 text-on-surface-variant">Transcript: {prompt.transcript}</div> : null}
      {prompt.sentence ? <div className="mb-5 rounded-lg border-l-4 border-primary bg-surface p-4 leading-7 text-on-surface-variant">{prompt.sentence}</div> : null}
      <h2 className="text-2xl font-bold leading-9 text-on-surface">{questionText}</h2>
      {prompt.options.length > 0 ? (
        <div className="my-6 space-y-4">
          {prompt.options.map((option, index) => (
            <button
              key={option}
              type="button"
              onClick={() => selectAnswer(option)}
              aria-pressed={answer === option}
              className={`flex min-h-16 w-full items-center gap-4 rounded-lg border px-5 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${answer === option ? 'border-primary bg-primary-container/25' : 'border-outline-variant bg-white hover:border-primary hover:bg-blue-50/30'}`}
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${answer === option ? 'border-primary bg-primary text-white' : 'border-outline'}`}>{String.fromCharCode(65 + index)}</span>
              {option}
            </button>
          ))}
        </div>
      ) : (
        <label className="my-6 block">
          <span className="sr-only">Câu trả lời</span>
          <input
            type="text"
            value={answer}
            onChange={(event) => selectAnswer(event.target.value)}
            placeholder="Nhập câu trả lời của bạn"
            className="h-14 w-full rounded-lg border border-outline-variant bg-white px-4 text-on-surface outline-none transition-colors placeholder:text-on-surface-variant focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>
      )}
      <aside className="mt-6 rounded-lg bg-violet-100 p-5 text-violet-950">
        <p className="font-bold">Mẹo làm bài</p>
        <p className="mt-1">Đọc kỹ ngữ cảnh và chọn hoặc nhập câu trả lời phù hợp nhất.</p>
      </aside>
      {submissionError ? <p className="mt-4 text-sm text-error" role="alert">{submissionError}</p> : null}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-outline-variant/60 pt-6">
        <button
          type="button"
          onClick={() => setCurrentIndex((index) => index - 1)}
          disabled={isFirstQuestion || isSubmitting}
          className="flex h-12 items-center gap-2 rounded-full border border-outline px-6 font-semibold text-on-surface disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="material-symbols-outlined">arrow_back</span>
          Câu trước
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={!answer.trim() || isSubmitting}
          className="flex h-12 items-center gap-2 rounded-full bg-primary px-7 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isLastQuestion ? (isSubmitting ? 'Đang chấm bài...' : 'Đánh giá') : 'Câu sau'}
          <span className="material-symbols-outlined">arrow_forward</span>
        </button>
      </div>
    </div>
  )
}
