type ReviewEmptyStateProps = {
  icon: string
  title: string
  description: string
}

export default function ReviewEmptyState({ icon, title, description }: ReviewEmptyStateProps) {
  return (
    <div className="rounded-lg border border-dashed border-outline-variant bg-surface-container-lowest p-10 text-center dark:border-outline dark:bg-surface-dark">
      <span className="material-symbols-outlined text-5xl text-outline">{icon}</span>
      <h2 className="mt-4 text-2xl font-bold text-on-surface dark:text-on-primary">{title}</h2>
      <p className="mx-auto mt-3 max-w-2xl leading-7 text-on-surface-variant dark:text-surface-dim">{description}</p>
    </div>
  )
}
