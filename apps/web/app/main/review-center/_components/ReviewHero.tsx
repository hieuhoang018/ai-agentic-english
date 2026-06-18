type ReviewHeroProps = {
  title: string
  description: string
  action?: React.ReactNode
}

export default function ReviewHero({ title, description, action }: ReviewHeroProps) {
  return (
    <div className="mb-9 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div>
        <h1 className="text-4xl font-bold text-on-surface">{title}</h1>
        <p className="mt-3 max-w-3xl text-lg leading-8 text-on-surface-variant">{description}</p>
      </div>
      {action}
    </div>
  )
}
