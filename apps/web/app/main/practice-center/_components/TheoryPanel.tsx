import type { TheoryBlock } from '../_types/practice'

type TheoryPanelProps = {
  theory: TheoryBlock[]
  tip: string
}

export default function TheoryPanel({ theory, tip }: TheoryPanelProps) {
  return (
    <aside className="rounded-lg border border-outline-variant/50 border-t-4 border-t-tertiary bg-surface-container-lowest p-6 shadow-[0_8px_28px_-20px_rgba(15,23,42,0.5)] dark:border-outline/50 dark:bg-surface-dark">
      <h2 className="mb-5 flex items-center gap-2 text-2xl font-bold text-tertiary">
        <span className="material-symbols-outlined">menu_book</span>
        Lý thuyết
      </h2>

      <div className="space-y-5">
        {theory.map((block) => (
          <section key={block.title}>
            <h3 className="font-bold leading-7 text-on-surface dark:text-on-primary">{block.title}</h3>
            <p className="mt-1 leading-7 text-on-surface dark:text-on-primary">{block.body}</p>
          </section>
        ))}
      </div>

      <div className="mt-6 rounded-lg bg-surface-container p-4 text-sm leading-6 text-on-surface-variant dark:bg-surface-dark-high dark:text-surface-dim">
        <p className="font-semibold text-on-surface dark:text-on-primary">Mẹo (Tip):</p>
        <p>{tip}</p>
      </div>
    </aside>
  )
}
