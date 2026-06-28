import type { CefrLevel, OnboardingRequest } from '@/lib/api/types'

import { placementSkillIds, type OnboardingProfile, type SkillId } from '../_types/onboarding'

const cefrLevelsByScore: CefrLevel[] = ['A1', 'A2', 'A2', 'B1', 'B1', 'B2', 'B2', 'C1', 'C1', 'C2', 'C2']
const scoreByCefrLevel: Record<CefrLevel, number> = {
  A1: 0,
  A2: 2,
  B1: 4,
  B2: 6,
  C1: 8,
  C2: 10,
}

export function levelScoreToCefrLevel(levelScore: number): CefrLevel {
  const score = Math.min(10, Math.max(0, Math.round(levelScore)))
  return cefrLevelsByScore[score]
}

export function assessmentLevelsToScore(levels: Partial<Record<SkillId, CefrLevel>>): number {
  const scores = placementSkillIds.flatMap((skill) => {
    const level = levels[skill]
    return level ? [scoreByCefrLevel[level]] : []
  })

  if (scores.length === 0) return 0

  return Math.round(scores.reduce((total, score) => total + score, 0) / scores.length)
}

export function normalizeAssessmentLevels(levels: Partial<Record<SkillId, CefrLevel>>): Partial<Record<SkillId, CefrLevel>> {
  return placementSkillIds.reduce<Partial<Record<SkillId, CefrLevel>>>((normalizedLevels, skill) => {
    const level = levels[skill]
    if (level) {
      normalizedLevels[skill] = level
    }

    return normalizedLevels
  }, {})
}

function getCurrentLevelScore(profile: Partial<OnboardingProfile>) {
  if (profile.assessmentMethod === 'test' && profile.assessmentLevels) {
    return assessmentLevelsToScore(profile.assessmentLevels)
  }

  return profile.levelScore ?? 5
}

export function toOnboardingRequest(
  userId: string,
  profile: Partial<OnboardingProfile>,
): OnboardingRequest {
  const goalId = profile.goalId ?? 'conversation'

  return {
    userId,
    currentLevel: levelScoreToCefrLevel(getCurrentLevelScore(profile)),
    dailyTimeBudgetMinutes: profile.dailyMinutes ?? 15,
    goals: [goalId, ...(profile.prioritySkills ?? [])],
  }
}
