import type { CefrLevel, OnboardingRequest, SkillEstimateKey, SkillEstimates } from '@/lib/api/types'

import { placementSkillIds, type OnboardingProfile, type PlacementSkillId, type SkillId } from '../_types/onboarding'

const cefrLevelsByScore: CefrLevel[] = ['A1', 'A2', 'A2', 'B1', 'B1', 'B2', 'B2', 'C1', 'C1', 'C2', 'C2']
const scoreByCefrLevel: Record<CefrLevel, number> = {
  A1: 0,
  A2: 2,
  B1: 4,
  B2: 6,
  C1: 8,
  C2: 10,
}
const skillEstimateByCefrLevel: Record<CefrLevel, number> = {
  A1: -2,
  A2: -1,
  B1: 0,
  B2: 1,
  C1: 2,
  C2: 3,
}
const skillEstimateKeyBySkill: Record<PlacementSkillId, SkillEstimateKey> = {
  reading: 'R',
  listening: 'L',
  writing: 'W',
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

export function applyA1FallbackToTestedSkills(
  levels: Partial<Record<SkillId, CefrLevel>>,
  testedSkills: readonly PlacementSkillId[],
): Partial<Record<SkillId, CefrLevel>> {
  const levelsWithFallbacks = { ...levels }

  for (const skill of testedSkills) {
    levelsWithFallbacks[skill] ??= 'A1'
  }

  return levelsWithFallbacks
}

export function assessmentLevelsToSkillEstimates(levels: Partial<Record<SkillId, CefrLevel>> | undefined): SkillEstimates | undefined {
  if (!levels) return undefined

  const estimates: SkillEstimates = {}
  for (const skill of placementSkillIds) {
    const level = levels[skill]
    if (level) {
      estimates[skillEstimateKeyBySkill[skill]] = skillEstimateByCefrLevel[level]
    }
  }

  return Object.keys(estimates).length > 0 ? estimates : undefined
}

function getCurrentLevelScore(profile: Partial<OnboardingProfile>) {
  if (profile.assessmentLevels) {
    return assessmentLevelsToScore(profile.assessmentLevels)
  }

  return profile.levelScore ?? 5
}

export function toOnboardingRequest(
  userId: string,
  profile: Partial<OnboardingProfile>,
): OnboardingRequest {
  const goalId = profile.goalId ?? 'conversation'
  const skillEstimates = assessmentLevelsToSkillEstimates(profile.assessmentLevels)

  return {
    userId,
    currentLevel: levelScoreToCefrLevel(getCurrentLevelScore(profile)),
    dailyTimeBudgetMinutes: profile.dailyMinutes ?? 15,
    goals: [goalId, ...(profile.prioritySkills ?? [])],
    ...(skillEstimates ? { skillEstimates } : {}),
  }
}
