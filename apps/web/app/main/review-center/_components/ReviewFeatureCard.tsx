import Link from 'next/link'

type ReviewFeatureCardProps = {
  href: string
  title: string
  description: string
  tag: string
  imageTone: string
  icon: string
}

export default function ReviewFeatureCard({ href, title, description, tag, imageTone, icon }: ReviewFeatureCardProps) {
  return (
    <Link href={href} className="overflow-hidden rounded-lg border border-outline-variant/40 bg-surface-container-lowest p-6 shadow-[0_10px_30px_-24px_rgba(15,23,42,0.5)] transition-transform hover:-translate-y-1">
      <div className={`relative mb-8 flex h-36 items-center justify-center overflow-hidden rounded-lg ${imageTone}`}>
        <span className="absolute right-3 top-3 rounded-lg bg-white/80 px-3 py-1 text-sm font-bold text-primary">{tag}</span>
        <span className="material-symbols-outlined text-6xl">{icon}</span>
      </div>
      <h2 className="text-2xl font-bold text-on-surface">{title}</h2>
      <p className="mt-3 text-on-surface-variant">{description}</p>
      <div className="mt-6 flex h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-bold text-white">
        Bắt đầu học
      </div>
    </Link>
  )
}
