import type { OnboardingActivity } from '@/lib/api/types'

type GeneratedPlanPreviewProps = {
  activities: OnboardingActivity[]
}

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

export default function GeneratedPlanPreview({ activities }: GeneratedPlanPreviewProps) {
  return (
    <div className="mx-auto w-full max-w-3xl rounded-xl bg-white p-8 shadow-[0_18px_52px_-34px_rgba(15,23,42,0.8)]">
      <h2 className="mb-6 flex items-center gap-3 text-2xl font-bold">
        <span className="material-symbols-outlined flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white">route</span>
        Lộ Trình Đề Xuất
      </h2>
      {activities.length === 0 ? (
        <p className="rounded-lg border border-outline-variant bg-surface p-5 text-on-surface-variant">Lộ trình đã được tạo, nhưng chưa có hoạt động nào để hiển thị.</p>
      ) : (
        <div className="space-y-5 border-l-2 border-outline-variant pl-7">
          {activities.map((activity, index) => (
            <article key={activity.activity_id} className="relative rounded-lg border border-outline-variant bg-surface p-5">
              <span className="absolute -left-[38px] top-5 h-5 w-5 rounded-full border-4 border-primary bg-white" />
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase text-primary">Hoạt động {index + 1} · {skillLabels[activity.skill_domain] ?? activity.skill_domain}</p>
                  <h3 className="mt-1 text-lg font-bold text-on-surface">{activity.title}</h3>
                </div>
                <span className="h-fit rounded-full bg-primary-fixed px-3 py-1 text-xs font-bold text-primary">{activity.estimated_minutes} phút</span>
              </div>
              <p className="mt-4 text-sm font-semibold capitalize text-on-surface-variant">{formatActivityType(activity.activity_type)} · {activity.difficulty}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
