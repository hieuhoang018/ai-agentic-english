type ChoiceCardProps = {
  title: string
  description: string
  icon: string
  tone?: string
  selected: boolean
  onSelect: () => void
}

export default function ChoiceCard({ title, description, icon, tone = 'bg-blue-50 text-primary dark:text-primary-fixed-dim dark:bg-primary-container/10', selected, onSelect }: ChoiceCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`relative min-h-36 rounded-lg border p-5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${selected ? 'border-primary bg-primary-container/10 shadow-sm' : 'border-outline-variant bg-white hover:border-primary hover:bg-blue-50/40 dark:border-outline dark:bg-surface-dark dark:hover:bg-primary-container/10'}`}
    >
      {selected ? (
        <span className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-sm text-white">
          <span className="material-symbols-outlined text-base">check</span>
        </span>
      ) : null}
      <span className={`mb-5 flex h-12 w-12 items-center justify-center rounded-full ${tone}`}><span className="material-symbols-outlined">{icon}</span></span>
      <h2 className="text-xl font-semibold text-on-surface dark:text-on-primary">{title}</h2>
      <p className="mt-1 text-sm text-on-surface-variant dark:text-surface-dim">{description}</p>
    </button>
  )
}
