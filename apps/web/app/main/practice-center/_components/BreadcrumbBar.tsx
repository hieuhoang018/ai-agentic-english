import Link from 'next/link'

export type BreadcrumbItem = {
  label: string
  href?: string
}

type BreadcrumbBarProps = {
  items: BreadcrumbItem[]
}

export default function BreadcrumbBar({ items }: BreadcrumbBarProps) {
  return (
    <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm text-on-surface-variant" aria-label="Breadcrumb">
      {items.map((item, index) => {
        const isLast = index === items.length - 1
        return (
          <span key={`${item.label}-${index}`} className="flex items-center gap-2">
            {item.href && !isLast ? (
              <Link className="hover:text-primary" href={item.href}>
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? 'font-semibold text-primary' : ''}>{item.label}</span>
            )}
            {!isLast ? <span>›</span> : null}
          </span>
        )
      })}
    </nav>
  )
}
