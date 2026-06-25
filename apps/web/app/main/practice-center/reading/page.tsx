import { serverApiFetch } from '@/lib/api/server';
import type { ModuleDto } from '@/lib/api/types';

import ModuleList from '../_components/ModuleList';
import { getPracticeSkill } from '../_lib/practice-catalog';

export const dynamic = 'force-dynamic';

export default async function ReadingPage() {
  const skill = getPracticeSkill('reading');
  const modules = await serverApiFetch<ModuleDto[]>('/modules');

  return (
    <ModuleList
      skill={skill}
      modules={modules.filter((module) => module.skillFocus === skill.id)}
    />
  );
}
