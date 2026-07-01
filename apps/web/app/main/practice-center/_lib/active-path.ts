import { auth } from '@clerk/nextjs/server';

import { isApiError } from '@/lib/api/client';
import { serverApiFetch } from '@/lib/api/server';
import type { LearningPathDto, ModuleDto } from '@/lib/api/types';

import type { PracticeSkillId } from '../_types/practice';

export async function getActivePathModuleIds() {
  const { userId } = await auth();
  if (!userId) return [];

  try {
    const learningPath = await serverApiFetch<LearningPathDto>(
      `/learning-paths/${encodeURIComponent(userId)}/active`,
    );
    const moduleIds: string[] = [];
    const seen = new Set<string>();

    for (const pathModule of learningPath.pathDefinition.modules ?? []) {
      if (!pathModule.moduleId || seen.has(pathModule.moduleId)) continue;
      seen.add(pathModule.moduleId);
      moduleIds.push(pathModule.moduleId);
    }

    return moduleIds;
  } catch (error) {
    if (isApiError(error) && error.status === 404) return [];
    throw error;
  }
}

export function filterModulesForActivePath(
  modules: ModuleDto[],
  skillId: PracticeSkillId,
  activePathModuleIds: string[],
) {
  const moduleOrder = new Map(activePathModuleIds.map((moduleId, index) => [moduleId, index]));

  return modules
    .filter((module) => module.skillFocus === skillId && moduleOrder.has(module.id))
    .sort((a, b) => moduleOrder.get(a.id)! - moduleOrder.get(b.id)!);
}

export function isModuleInActivePath(moduleId: string, activePathModuleIds: string[]) {
  return activePathModuleIds.includes(moduleId);
}
