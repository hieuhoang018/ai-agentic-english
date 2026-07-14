import 'server-only';

import { currentUser } from '@clerk/nextjs/server';

import { apiFetch, isApiError } from '@/lib/api/client';
import type { LearningPathDto } from '@/lib/api/types';

const onboardingStartRoute = '/onboarding/goals';
const onboardingPlanRoute = '/onboarding/plan';

type MetadataRecord = Record<string, unknown>;

export type OnboardingStatus = {
  hasActiveLearningPath: boolean;
  hasCompletedOnboarding: boolean;
  isComplete: boolean;
  nextOnboardingRoute: string;
};

function isRecord(value: unknown): value is MetadataRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasCompletedOnboardingMarker(metadata: unknown) {
  return isRecord(metadata) && metadata.onboardingComplete === true;
}

export async function getActiveLearningPath(userId: string, token: string): Promise<LearningPathDto | null> {
  try {
    return await apiFetch<LearningPathDto>(`/learning-paths/${encodeURIComponent(userId)}/active`, { token });
  } catch (error) {
    if (isApiError(error) && error.status === 404) return null;
    throw error;
  }
}

export async function getOnboardingStatus(userId: string, token: string): Promise<OnboardingStatus> {
  const [user, activeLearningPath] = await Promise.all([
    currentUser(),
    getActiveLearningPath(userId, token),
  ]);
  const hasActiveLearningPath = activeLearningPath !== null;
  const hasCompletedOnboarding = hasCompletedOnboardingMarker(user?.unsafeMetadata);

  return {
    hasActiveLearningPath,
    hasCompletedOnboarding,
    isComplete: hasCompletedOnboarding && hasActiveLearningPath,
    nextOnboardingRoute: hasActiveLearningPath ? onboardingPlanRoute : onboardingStartRoute,
  };
}
