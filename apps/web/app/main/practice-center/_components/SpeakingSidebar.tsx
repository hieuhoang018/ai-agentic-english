import type { SpeakingGoal } from '../_types/speaking'

type SpeakingSidebarProps = {
  goals: SpeakingGoal[]
  vocabularySuggestions: string[]
}

export default function SpeakingSidebar({ goals, vocabularySuggestions }: SpeakingSidebarProps) {
  return (
    <aside className="space-y-0 overflow-hidden rounded-lg border border-outline-variant/70 bg-surface-container-lowest">
      <section className="border-b border-outline-variant/70 p-5">
        <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold text-on-surface">
          <span className="material-symbols-outlined text-primary">flag</span>
          Mục tiêu bài học
        </h2>
        <div className="space-y-3">
          {goals.map((goal) => (
            <div key={goal.id} className="flex items-start gap-2 text-base leading-6 text-on-surface">
              <span className={`material-symbols-outlined mt-0.5 text-xl ${goal.completed ? 'text-secondary' : 'text-outline'}`}>
                {goal.completed ? 'check_circle' : 'radio_button_unchecked'}
              </span>
              <span>{goal.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-on-surface">
            <span className="material-symbols-outlined text-primary">emoji_objects</span>
            Gợi ý từ vựng
          </h2>
          <button className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container" aria-label="Làm mới gợi ý">
            <span className="material-symbols-outlined">refresh</span>
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {vocabularySuggestions.map((word) => (
            <span key={word} className="rounded-lg border border-outline-variant bg-white px-3 py-2 text-sm text-on-surface">
              {word}
            </span>
          ))}
        </div>
      </section>
    </aside>
  )
}
