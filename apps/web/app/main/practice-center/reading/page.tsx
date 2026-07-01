import { serverApiFetch } from '@/lib/api/server';
import type { ModuleDto } from '@/lib/api/types';

import ModuleList from '../_components/ModuleList';
import { filterModulesForActivePath, getActivePathModuleIds } from '../_lib/active-path';
import { getPracticeSkill } from '../_lib/practice-catalog';

export const dynamic = 'force-dynamic';

export default async function ReadingPage() {
  const skill = getPracticeSkill('reading');
  const [modules, activePathModuleIds] = await Promise.all([
    serverApiFetch<ModuleDto[]>('/modules'),
    getActivePathModuleIds(),
  ]);

  return (
    <ModuleList
      skill={skill}
      modules={filterModulesForActivePath(modules, skill.id, activePathModuleIds)}
    />
  );
}
