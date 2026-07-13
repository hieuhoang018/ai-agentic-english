type ReviewHeroProps = {
  title: string
  description: string
  action?: React.ReactNode
}

export default function ReviewHero({ title, description, action }: ReviewHeroProps) {
  return (
    <div className="mb-9 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div>
        <h1 className="text-3xl font-bold text-on-surface dark:text-on-primary sm:text-4xl">{title}</h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-on-surface-variant dark:text-surface-dim sm:text-lg sm:leading-8">{description}</p>
      </div>
      {action}
    </div>
  )
}
