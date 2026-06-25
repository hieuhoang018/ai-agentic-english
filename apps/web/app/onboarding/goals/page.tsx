"use client"

import ChoiceCard from '../_components/ChoiceCard'
import OnboardingShell from '../_components/OnboardingShell'
import { useOnboarding } from '../_components/OnboardingProvider'
import { goals } from '../_data/onboarding-content'
import type { LearningGoalId } from '../_types/onboarding'
import { onboardingRoutes } from '../_utils/onboarding-routes'

export default function GoalsPage() {
  const { profile, updateProfile } = useOnboarding()
  const selectedGoalId: LearningGoalId = profile.goalId ?? goals[0].id

  return (
    <OnboardingShell step={1} title="Chọn mục tiêu của bạn" description="Wise Mentor sẽ cá nhân hóa lộ trình học dựa trên mục tiêu chính của bạn." nextHref={onboardingRoutes.level}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {goals.map((goal) => (
          <ChoiceCard
            key={goal.id}
            title={goal.title}
            description={goal.description}
            icon={goal.icon}
            tone={goal.tone}
            selected={goal.id === selectedGoalId}
            onSelect={() => updateProfile({ goalId: goal.id })}
          />
        ))}
      </div>
    </OnboardingShell>
  )
}
