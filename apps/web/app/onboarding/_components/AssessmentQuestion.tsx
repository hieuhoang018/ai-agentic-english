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

type LockedAssessmentAudioPlayerProps = {
  questionId: string
  audio: ReturnType<typeof usePresignedAudioUrl>
}

function formatAudioTime(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0:00'

  const minutes = Math.floor(value / 60)
  const seconds = Math.floor(value % 60)
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function LockedAssessmentAudioPlayer({ questionId, audio }: LockedAssessmentAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const lastKnownTimeRef = useRef(0)
  const isRestoringTimeRef = useRef(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playbackNotice, setPlaybackNotice] = useState<string | null>(null)
  const audioStatus = audio.status
  const loadAudio = audio.load

  useEffect(() => {
    if (audioStatus === 'idle') {
      void loadAudio()
    }
  }, [audioStatus, loadAudio])

  useEffect(() => {
    if (audio.status !== 'ready') return

    const element = audioRef.current
    if (!element) return

    let isCancelled = false
    isRestoringTimeRef.current = true
    element.currentTime = 0
    window.setTimeout(() => {
      isRestoringTimeRef.current = false
    }, 0)

    const playAudio = async () => {
      try {
        setPlaybackNotice(null)
        await element.play()
        if (!isCancelled) setIsPlaying(true)
      } catch {
        if (!isCancelled) {
          setIsPlaying(false)
          setPlaybackNotice('Autoplay was blocked by the browser. Press play to listen.')
        }
      }
    }

    void playAudio()

    return () => {
      isCancelled = true
      element.pause()
    }
  }, [audio.status, audio.url, questionId])

  const togglePlayback = async () => {
    const element = audioRef.current
    if (!element || audio.status !== 'ready') return

    if (!element.paused) {
      element.pause()
      setIsPlaying(false)
      return
    }

    try {
      setPlaybackNotice(null)
      await element.play()
      setIsPlaying(true)
    } catch {
      setIsPlaying(false)
      setPlaybackNotice('Unable to play this audio right now. Please try again.')
    }
  }

  const updatePlaybackTime = () => {
    const element = audioRef.current
    if (!element) return

    const nextTime = element.currentTime
    setCurrentTime(nextTime)

    if (!element.seeking && nextTime >= lastKnownTimeRef.current) {
      lastKnownTimeRef.current = nextTime
    }
  }

  const keepPlaybackPositionLocked = () => {
    const element = audioRef.current
    if (!element || isRestoringTimeRef.current) return

    const nextTime = element.currentTime
    const lastKnownTime = lastKnownTimeRef.current
    if (Math.abs(nextTime - lastKnownTime) < 1) return

    isRestoringTimeRef.current = true
    element.currentTime = lastKnownTime
    setCurrentTime(lastKnownTime)
    window.setTimeout(() => {
      isRestoringTimeRef.current = false
    }, 0)
  }

  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0

  if (audio.status === 'error') {
    return (
      <div className="mt-3 rounded-lg border border-error/30 bg-error-container/30 p-4" role="alert">
        <p className="text-sm font-semibold text-error dark:text-red-400">{audio.message}</p>
        <button
          type="button"
          onClick={() => void audio.load()}
          className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white"
        >
          <span className="material-symbols-outlined text-base">refresh</span>
          Try again
        </button>
      </div>
    )
  }

  if (audio.status !== 'ready') {
    return (
      <div className="mt-3 flex items-center gap-3 rounded-lg bg-surface p-4 text-sm font-semibold text-on-surface-variant dark:bg-surface-dark-high dark:text-surface-dim" role="status">
        <span className="material-symbols-outlined animate-spin text-primary dark:text-primary-fixed-dim">progress_activity</span>
        Preparing audio...
      </div>
    )
  }

  return (
    <div className="mt-3 rounded-lg bg-surface p-4 dark:bg-surface-dark-high">
      <audio
        ref={audioRef}
        preload="auto"
        src={audio.url}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onTimeUpdate={updatePlaybackTime}
        onSeeking={keepPlaybackPositionLocked}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onError={() => {
          setIsPlaying(false)
          setPlaybackNotice(null)
          audio.markPlaybackFailed()
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void togglePlayback()}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-white transition-colors hover:bg-[#0047bb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          aria-label={isPlaying ? 'Pause listening audio' : 'Play listening audio'}
        >
          <span className="material-symbols-outlined">{isPlaying ? 'pause' : 'play_arrow'}</span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="h-2 overflow-hidden rounded-full bg-outline-variant dark:bg-surface-dark-high" aria-hidden="true">
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-xs font-semibold text-on-surface-variant dark:text-surface-dim">
            <span>{formatAudioTime(currentTime)}</span>
            <span>{formatAudioTime(duration)}</span>
          </div>
        </div>
      </div>
      {playbackNotice ? (
        <p className="mt-3 text-sm text-error dark:text-red-400" role="alert">
          {playbackNotice}
        </p>
      ) : null}
    </div>
  )
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
        <span className="material-symbols-outlined animate-spin text-4xl text-primary dark:text-primary-fixed-dim">progress_activity</span>
        <p className="mt-4 font-semibold text-on-surface dark:text-on-primary">Đang tải câu hỏi đánh giá...</p>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <section className="rounded-lg border border-error/30 bg-white p-6 text-center dark:bg-surface-dark" role="alert">
        <span className="material-symbols-outlined text-4xl text-error dark:text-red-400">error</span>
        <p className="mt-3 text-on-surface-variant dark:text-surface-dim">{state.message}</p>
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
        <span className="rounded-lg border border-primary/20 bg-blue-50 px-4 py-2 text-2xl font-bold text-primary dark:text-primary-fixed-dim dark:bg-primary-container/10">{skillLabel}</span>
        <span className="rounded-full bg-blue-50 px-4 py-2 font-bold text-primary dark:text-primary-fixed-dim dark:bg-primary-container/10">Câu {currentIndex + 1} / {questions.length} · {question.cefrLevelTarget}</span>
      </div>
      {question.skill === 'listening' && activeAudio.hasAudio ? (
        <section className="mb-5 rounded-lg border border-outline-variant bg-white p-4 dark:border-outline dark:bg-surface-dark">
          <div className="flex items-center gap-2 font-bold text-on-surface dark:text-on-primary">
            <span className="material-symbols-outlined text-primary dark:text-primary-fixed-dim">headphones</span>
            Listening audio
          </div>
          <LockedAssessmentAudioPlayer key={question.id} questionId={question.id} audio={activeAudio} />
        </section>
      ) : null}
      {prompt.passage ? <div className="mb-5 rounded-lg border-l-4 border-primary bg-surface p-4 leading-7 text-on-surface-variant dark:bg-surface-dark-high dark:text-surface-dim">{prompt.passage}</div> : null}
      {prompt.transcript && (question.skill !== 'listening' || !activeAudio.hasAudio || activeAudio.status === 'error') ? <div className="mb-5 rounded-lg border-l-4 border-primary bg-surface p-4 leading-7 text-on-surface-variant dark:bg-surface-dark-high dark:text-surface-dim">Transcript: {prompt.transcript}</div> : null}
      {prompt.sentence ? <div className="mb-5 rounded-lg border-l-4 border-primary bg-surface p-4 leading-7 text-on-surface-variant dark:bg-surface-dark-high dark:text-surface-dim">{prompt.sentence}</div> : null}
      <h2 className="text-2xl font-bold leading-9 text-on-surface dark:text-on-primary">{questionText}</h2>
      {prompt.options.length > 0 ? (
        <div className="my-6 space-y-4">
          {prompt.options.map((option, index) => (
            <button
              key={option}
              type="button"
              onClick={() => selectAnswer(option)}
              aria-pressed={answer === option}
              className={`flex min-h-16 w-full items-center gap-4 rounded-lg border px-5 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${answer === option ? 'border-primary bg-primary-container/25' : 'border-outline-variant bg-white hover:border-primary hover:bg-blue-50/30 dark:border-outline dark:bg-surface-dark dark:hover:bg-primary-container/10'}`}
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
            className="h-14 w-full rounded-lg border border-outline-variant bg-white px-4 text-on-surface outline-none transition-colors placeholder:text-on-surface-variant focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-outline dark:bg-surface-dark dark:text-on-primary dark:placeholder:text-surface-dim"
          />
        </label>
      )}
      <aside className="mt-6 rounded-lg bg-violet-100 p-5 text-violet-950 dark:bg-violet-900/30 dark:text-violet-200">
        <p className="font-bold">Mẹo làm bài</p>
        <p className="mt-1">Đọc kỹ ngữ cảnh và chọn hoặc nhập câu trả lời phù hợp nhất.</p>
      </aside>
      {submissionError ? <p className="mt-4 text-sm text-error dark:text-red-400" role="alert">{submissionError}</p> : null}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-outline-variant/60 pt-6 dark:border-outline/60">
        <button
          type="button"
          onClick={() => setCurrentIndex((index) => index - 1)}
          disabled={isFirstQuestion || isSubmitting}
          className="flex h-12 items-center gap-2 rounded-full border border-outline px-6 font-semibold text-on-surface disabled:cursor-not-allowed disabled:opacity-40 dark:text-on-primary"
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
