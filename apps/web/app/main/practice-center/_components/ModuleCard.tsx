import Link from 'next/link';
import type { ModuleDto } from '@/lib/api/types';

import type { PracticeSkillId } from '../_types/practice';
import { modulePath } from '../_utils/routes';

type ModuleCardProps = {
  module: ModuleDto;
  skill: PracticeSkillId;
};

export default function ModuleCard({ module, skill }: ModuleCardProps) {
  const href = modulePath(skill, module.id);

  return (
    <article className="rounded-lg border border-outline-variant/60 border-t-4 border-t-primary bg-surface-container-lowest p-6 shadow-[0_6px_22px_-18px_rgba(15,23,42,0.5)]">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-primary">
              Module {module.order}
            </span>
            <span className="text-xs font-medium text-on-surface-variant">{module.cefrLevel}</span>
          </div>
          <h2 className="text-2xl font-bold text-on-surface">{module.title}</h2>
          <p className="mt-2 max-w-3xl text-base leading-7 text-on-surface-variant">
            {module.description}
          </p>
        </div>

        <div className="flex w-full shrink-0 flex-col gap-3 md:w-52">
          <Link
            href={href}
            className="flex h-10 items-center justify-center gap-2 rounded-lg border border-primary bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-[#0047bb]"
          >
            <span className="material-symbols-outlined text-base">arrow_forward</span>
            Start module
          </Link>
        </div>
      </div>
    </article>
  );
}
