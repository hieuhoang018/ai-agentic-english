import type { GrammarLesson } from '../_types/review'

type GrammarLessonViewProps = {
  lesson: GrammarLesson
}

export default function GrammarLessonView({ lesson }: GrammarLessonViewProps) {
  const examples = lesson.examples ?? []

  return (
    <div className="pb-8">
      <div className="mb-7 border-b border-outline-variant pb-6">
        <div className="mb-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-primary px-3 py-1 text-xs font-bold uppercase text-white">
            {lesson.cefrLevel}
          </span>
          <span className="rounded-full bg-surface-container px-3 py-1 text-xs font-semibold text-on-surface-variant dark:bg-surface-dark-high dark:text-surface-dim">
            {lesson.difficulty}
          </span>
          <span className="rounded-full bg-surface-container px-3 py-1 text-xs font-semibold text-on-surface-variant dark:bg-surface-dark-high dark:text-surface-dim">
            {lesson.category}
          </span>
        </div>
        <h1 className="text-3xl font-bold text-on-surface dark:text-on-primary sm:text-4xl">{lesson.title}</h1>
        <p className="mt-3 max-w-4xl text-base leading-7 text-on-surface-variant dark:text-surface-dim sm:text-lg sm:leading-8">{lesson.description}</p>
      </div>

      <section className="mb-8">
        <h2 className="mb-5 flex items-center gap-2 text-2xl font-bold text-on-surface dark:text-on-primary">
          <span className="material-symbols-outlined text-primary dark:text-primary-fixed-dim">menu_book</span>
          Explanation
        </h2>
        <div className="rounded-lg border border-outline-variant bg-white p-6 dark:border-outline dark:bg-surface-dark">
          <p className="leading-7 text-on-surface-variant dark:text-surface-dim sm:leading-8">{lesson.description}</p>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold text-on-surface dark:text-on-primary">
          <span className="material-symbols-outlined text-primary dark:text-primary-fixed-dim">chat_bubble</span>
          Examples
        </h2>
        {examples.length > 0 ? (
          <div className="space-y-4">
            {examples.map((example) => (
              <div
                key={example.id}
                className="rounded-lg border border-outline-variant border-l-4 border-l-primary bg-white p-4 dark:border-outline dark:bg-surface-dark"
              >
                <p className="font-semibold">{example.text}</p>
                {example.note ? <p className="mt-1 italic text-on-surface-variant dark:text-surface-dim">{example.note}</p> : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-outline-variant bg-white p-6 text-on-surface-variant dark:border-outline dark:bg-surface-dark dark:text-surface-dim">
            No examples are available for this grammar point.
          </div>
        )}
      </section>

      {lesson.source || lesson.license ? (
        <section className="rounded-lg border border-outline-variant bg-surface-container-lowest p-5 text-sm text-on-surface-variant dark:border-outline dark:bg-surface-dark dark:text-surface-dim">
          {lesson.source ? <p>Source: {lesson.source}</p> : null}
          {lesson.license ? <p className="mt-2">License: {lesson.license}</p> : null}
        </section>
      ) : null}
    </div>
  )
}
