import type { PathDefinition } from '@/lib/api/types'

type GeneratedPlanPreviewProps = {
  pathDefinition: PathDefinition
}

type PlanActivity = NonNullable<PathDefinition['activities']>[number]
type PathModule = PathDefinition['modules'][number]

const skillLabels: Record<string, string> = {
  L: 'Listening',
  S: 'Speaking',
  R: 'Reading',
  W: 'Writing',
  LISTENING: 'Listening',
  SPEAKING: 'Speaking',
  READING: 'Reading',
  WRITING: 'Writing',
}

function formatActivityType(activityType: string) {
  return activityType.replaceAll('_', ' ')
}

function countExercises(module: PathModule) {
  return module.lessons.reduce((total, lesson) => total + lesson.exerciseIds.length, 0)
}

function getModuleTitle(module: PathModule, activities: PlanActivity[]) {
  return activities.find((activity) => activity.module_id === module.moduleId)?.title
}

export default function GeneratedPlanPreview({ pathDefinition }: GeneratedPlanPreviewProps) {
  const activities = pathDefinition.activities ?? []
  const modules = pathDefinition.modules ?? []

  return (
    <div className="mx-auto w-full max-w-3xl rounded-xl bg-white p-8 shadow-[0_18px_52px_-34px_rgba(15,23,42,0.8)] dark:bg-surface-dark">
      <h2 className="mb-6 flex items-center gap-3 text-2xl font-bold">
        <span className="material-symbols-outlined flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white">route</span>
        Lộ Trình Đề Xuất
      </h2>
      {activities.length > 0 ? (
        <div className="space-y-5 border-l-2 border-outline-variant pl-7 dark:border-outline">
          {activities.map((activity, index) => (
            <article key={activity.activity_id} className="relative rounded-lg border border-outline-variant bg-surface p-5 dark:border-outline dark:bg-surface-dark-high">
              <span className="absolute -left-[38px] top-5 h-5 w-5 rounded-full border-4 border-primary bg-white dark:bg-surface-dark" />
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase text-primary dark:text-primary-fixed-dim">Hoạt động {index + 1} · {skillLabels[activity.skill_domain] ?? activity.skill_domain}</p>
                  <h3 className="mt-1 text-lg font-bold text-on-surface dark:text-on-primary">{activity.title}</h3>
                </div>
                <span className="h-fit rounded-full bg-primary-fixed px-3 py-1 text-xs font-bold text-primary dark:text-primary-fixed-dim dark:bg-primary-container/10">{activity.estimated_minutes} phút</span>
              </div>
              <p className="mt-4 text-sm font-semibold capitalize text-on-surface-variant dark:text-surface-dim">{formatActivityType(activity.activity_type)} · {activity.difficulty}</p>
            </article>
          ))}
        </div>
      ) : modules.length > 0 ? (
        <div className="space-y-5 border-l-2 border-outline-variant pl-7 dark:border-outline">
          {modules.map((module, index) => {
            const title = getModuleTitle(module, activities)
            return (
              <article key={module.moduleId} className="relative rounded-lg border border-outline-variant bg-surface p-5 dark:border-outline dark:bg-surface-dark-high">
                <span className="absolute -left-[38px] top-5 h-5 w-5 rounded-full border-4 border-primary bg-white dark:bg-surface-dark" />
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase text-primary dark:text-primary-fixed-dim">Module {index + 1}</p>
                    <h3 className="mt-1 text-lg font-bold text-on-surface dark:text-on-primary">{title ?? module.moduleId}</h3>
                  </div>
                  <span className="h-fit rounded-full bg-primary-fixed px-3 py-1 text-xs font-bold text-primary dark:text-primary-fixed-dim dark:bg-primary-container/10">{module.lessons.length} lessons</span>
                </div>
                <p className="mt-4 text-sm font-semibold text-on-surface-variant dark:text-surface-dim">{countExercises(module)} exercises</p>
              </article>
            )
          })}
        </div>
      ) : (
        <p className="rounded-lg border border-outline-variant bg-surface p-5 text-on-surface-variant dark:border-outline dark:bg-surface-dark-high dark:text-surface-dim">Lộ trình đã được tạo, nhưng chưa có hoạt động nào để hiển thị.</p>
      )}
    </div>
  )
}
