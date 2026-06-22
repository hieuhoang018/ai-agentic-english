import type { PracticeModule, PracticeSkill } from '../_types/practice'
import ModuleCard from './ModuleCard'
import PracticeHero from './PracticeHero'

type ModuleListProps = {
  skill: PracticeSkill
  modules: PracticeModule[]
}

export default function ModuleList({ skill, modules }: ModuleListProps) {
  return (
    <div>
      <PracticeHero icon={skill.icon} title={skill.title} description={skill.description} />
      <div className="space-y-4">
        {modules.length > 0 ? modules.map((module) => <ModuleCard key={module.id} module={module} />) : (
          <div className="rounded-lg border border-dashed border-outline-variant bg-surface-container-lowest p-8 text-center text-on-surface-variant">
            Chưa có module nào cho kỹ năng này.
          </div>
        )}
      </div>
    </div>
  )
}
