type PracticeHeroProps = {
  icon?: string
  title: string
  description: string
}

export default function PracticeHero({ icon, title, description }: PracticeHeroProps) {
  return (
    <section className="mb-8 sm:mb-12">
      <div className="flex items-center gap-3">
        {icon ? <span className="material-symbols-outlined text-4xl text-primary dark:text-primary-fixed-dim sm:text-5xl">{icon}</span> : null}
        <h1 className="text-3xl font-bold tracking-normal text-on-surface dark:text-on-primary sm:text-4xl md:text-5xl">{title}</h1>
      </div>
      <p className="mt-3 max-w-4xl text-base leading-7 text-on-surface-variant dark:text-surface-dim sm:text-lg sm:leading-8">{description}</p>
    </section>
  )
}
