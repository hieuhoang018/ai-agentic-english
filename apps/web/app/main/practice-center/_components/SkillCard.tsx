import Link from 'next/link';
import type { PracticeSkill } from '../_types/practice';
import { skillPath } from '../_utils/routes';

type SkillCardProps = {
  skill: PracticeSkill;
};

const toneClasses = {
  blue: 'bg-blue-50 text-primary dark:text-primary-fixed-dim border-blue-100 dark:bg-blue-900/30 dark:border-blue-900/50',
  green: 'bg-emerald-50 text-secondary border-emerald-100 dark:bg-emerald-900/30 dark:border-emerald-900/50',
  purple: 'bg-violet-50 text-tertiary border-violet-100 dark:bg-violet-900/30 dark:border-violet-900/50',
};

export default function SkillCard({ skill }: SkillCardProps) {
  const tone = skill.id === 'listening' ? 'green' : skill.id === 'writing' ? 'purple' : 'blue';

  return (
    <Link
      href={skillPath(skill.id)}
      className="group rounded-lg border border-outline-variant/70 bg-surface-container-lowest p-6 shadow-[0_4px_18px_-8px_rgba(15,23,42,0.25)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-18px_rgba(15,23,42,0.45)] dark:border-outline/70 dark:bg-surface-dark"
    >
      <div className="flex items-start justify-between gap-4">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-lg border ${toneClasses[tone]}`}
        >
          <span className="material-symbols-outlined text-3xl">{skill.icon}</span>
        </div>
        <span className="material-symbols-outlined text-primary dark:text-primary-fixed-dim transition-transform group-hover:translate-x-1">
          arrow_forward
        </span>
      </div>

      <h2 className="mt-6 text-2xl font-bold text-on-surface dark:text-on-primary">{skill.title}</h2>
      <p className="mt-2 min-h-14 text-sm leading-6 text-on-surface-variant dark:text-surface-dim">{skill.description}</p>
    </Link>
  );
}
