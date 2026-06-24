import type { CefrLevel, OnboardingRequest } from '@/lib/api/types'

import type { OnboardingProfile, SkillId } from '../_types/onboarding'

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
  const scores = Object.values(levels).filter((level): level is CefrLevel => level !== undefined).map((level) => scoreByCefrLevel[level])
  if (scores.length === 0) return 0

  return Math.round(scores.reduce((total, score) => total + score, 0) / scores.length)
}

export function toOnboardingRequest(
  userId: string,
  profile: Partial<OnboardingProfile>,
): OnboardingRequest {
  const goalId = profile.goalId ?? 'conversation'

  return {
    userId,
    currentLevel: levelScoreToCefrLevel(profile.levelScore ?? 5),
    dailyTimeBudgetMinutes: profile.dailyMinutes ?? 15,
    goals: [goalId, ...(profile.prioritySkills ?? [])],
  }
}
