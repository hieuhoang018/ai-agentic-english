type PracticeHeroProps = {
  icon?: string
  title: string
  description: string
}

export default function PracticeHero({ icon, title, description }: PracticeHeroProps) {
  return (
    <section className="mb-12">
      <div className="flex items-center gap-3">
        {icon ? <span className="material-symbols-outlined text-5xl text-primary">{icon}</span> : null}
        <h1 className="text-4xl md:text-5xl font-bold tracking-normal text-on-surface">{title}</h1>
      </div>
      <p className="mt-3 max-w-4xl text-lg leading-8 text-on-surface-variant">{description}</p>
    </section>
  )
}
