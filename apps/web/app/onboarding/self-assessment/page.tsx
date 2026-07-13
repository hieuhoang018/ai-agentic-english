'use client'

import { useEffect } from 'react'
import type { CefrLevel } from '@/lib/api/types'

import OnboardingShell from '../_components/OnboardingShell'
import { useOnboarding } from '../_components/OnboardingProvider'
import { placementSkillIds, type PlacementSkillId, type SkillId } from '../_types/onboarding'
import { assessmentLevelsToScore, normalizeAssessmentLevels } from '../_utils/onboarding-request'
import { onboardingRoutes } from '../_utils/onboarding-routes'

const cefrLevels: CefrLevel[] = ['A1', 'A2', 'B1', 'B2']

const skillDetails: Record<PlacementSkillId, { label: string; icon: string; caption: string }> = {
  reading: {
    label: 'Reading',
    icon: 'menu_book',
    caption: 'Hiểu văn bản, email, tài liệu và ngữ cảnh chuyên môn.',
  },
  writing: {
    label: 'Writing',
    icon: 'edit_note',
    caption: 'Viết câu, đoạn văn, email và phản hồi có cấu trúc.',
  },
  listening: {
    label: 'Listening',
    icon: 'headphones',
    caption: 'Nghe hội thoại, bài nói, cuộc họp và nội dung âm thanh.',
  },
}

export default function SelfAssessmentPage() {
  const { profile, updateProfile } = useOnboarding()
  const assessmentLevels = normalizeAssessmentLevels(profile.assessmentLevels ?? {})
  const completedSkillCount = placementSkillIds.filter((skill) => assessmentLevels[skill]).length
  const isComplete = completedSkillCount === placementSkillIds.length

  useEffect(() => {
    if (profile.assessmentMethod !== 'selfAssessment') {
      updateProfile({ assessmentMethod: 'selfAssessment' })
    }
  }, [profile.assessmentMethod, updateProfile])

  const selectLevel = (skill: PlacementSkillId, level: CefrLevel) => {
    const nextAssessmentLevels = normalizeAssessmentLevels({
      ...(profile.assessmentLevels ?? {}),
      [skill]: level,
    } as Partial<Record<SkillId, CefrLevel>>)

    updateProfile({
      assessmentMethod: 'selfAssessment',
      assessmentLevels: nextAssessmentLevels,
      levelScore: assessmentLevelsToScore(nextAssessmentLevels),
    })
  }

  return (
    <OnboardingShell
      step={2}
      title="Tự đánh giá năng lực"
      description="Chọn mức CEFR hiện tại cho từng kỹ năng để Wise Mentor cá nhân hóa lộ trình học tập."
      backHref={onboardingRoutes.level}
      nextHref={onboardingRoutes.preferences}
      nextDisabled={!isComplete}
      showFooterBack={false}
      wide
    >
      <section className="grid gap-4">
        {placementSkillIds.map((skill) => {
          const detail = skillDetails[skill]
          const selectedLevel = assessmentLevels[skill]

          return (
            <article key={skill} className="rounded-lg border border-outline-variant bg-white p-5 dark:border-outline dark:bg-surface-dark">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined rounded-lg bg-primary-container p-2 text-white">{detail.icon}</span>
                  <div>
                    <h2 className="text-xl font-bold text-on-surface dark:text-on-primary">{detail.label}</h2>
                    <p className="mt-1 text-sm leading-6 text-on-surface-variant dark:text-surface-dim">{detail.caption}</p>
                  </div>
                </div>
                {selectedLevel ? (
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">CEFR {selectedLevel}</span>
                ) : (
                  <span className="rounded-full bg-surface px-3 py-1 text-sm font-bold text-on-surface-variant dark:bg-surface-dark-high dark:text-surface-dim">Chưa chọn</span>
                )}
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-6">
                {cefrLevels.map((level) => {
                  const isSelected = selectedLevel === level

                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => selectLevel(skill, level)}
                      aria-pressed={isSelected}
                      className={`h-11 rounded-lg border text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                        isSelected
                          ? 'border-primary bg-primary text-white shadow-sm'
                          : 'border-outline-variant bg-surface text-on-surface hover:border-primary hover:bg-blue-50 dark:border-outline dark:bg-surface-dark-high dark:text-on-primary dark:hover:bg-primary-container/10'
                      }`}
                    >
                      {level}
                    </button>
                  )
                })}
              </div>
            </article>
          )
        })}
      </section>

      <section className="mt-6 rounded-lg border border-on-surface/20 bg-surface-container-highest p-5 dark:border-outline/20 dark:bg-surface-dark-high">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-primary dark:text-primary-fixed-dim">CEFR self-assessment</h2>
            <p className="mt-1 text-sm text-on-surface dark:text-on-primary">{completedSkillCount} / {placementSkillIds.length} kỹ năng đã chọn</p>
          </div>
          <span className="material-symbols-outlined text-primary dark:text-primary-fixed-dim">{isComplete ? 'check_circle' : 'circle'}</span>
        </div>
      </section>
    </OnboardingShell>
  )
}
