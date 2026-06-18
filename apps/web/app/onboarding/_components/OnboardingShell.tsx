import Link from 'next/link'
import OnboardingProgress from './OnboardingProgress'

type OnboardingShellProps = {
  step: number
  total?: number
  title: string
  description?: string
  children: React.ReactNode
  backHref?: string
  nextHref?: string
  nextLabel?: string
  wide?: boolean
}

export default function OnboardingShell({ step, total = 3, title, description, children, backHref, nextHref, nextLabel = 'Tiếp tục', wide = false }: OnboardingShellProps) {
  return (
    <div className={`mx-auto my-4 overflow-hidden rounded-xl border border-outline-variant/50 bg-surface-container-lowest shadow-[0_10px_36px_-28px_rgba(15,23,42,0.7)] ${wide ? 'max-w-5xl' : 'max-w-4xl'}`}>
      <OnboardingProgress step={step} total={total} />
      <main className="p-6 md:p-8">
        {backHref ? <Link href={backHref} className="mb-6 inline-flex items-center gap-1 font-bold text-primary"><span className="material-symbols-outlined text-base">arrow_back</span>Quay lại</Link> : null}
        <h1 className="text-4xl font-bold text-on-surface">{title}</h1>
        {description ? <p className="mt-3 max-w-3xl text-lg leading-8 text-on-surface-variant">{description}</p> : null}
        <div className="mt-8">{children}</div>
      </main>
      {nextHref ? (
        <footer className="flex justify-end gap-4 border-t border-outline-variant/50 bg-surface p-6">
          {backHref ? <Link href={backHref} className="flex h-12 items-center gap-2 rounded-full border border-outline px-6 font-semibold text-on-surface"><span className="material-symbols-outlined">arrow_back</span>Quay lại</Link> : null}
          <Link href={nextHref} className="flex h-12 items-center gap-2 rounded-full bg-primary px-7 font-bold text-white">
            {nextLabel}
            <span className="material-symbols-outlined">arrow_forward</span>
          </Link>
        </footer>
      ) : null}
    </div>
  )
}
