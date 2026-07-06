"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useUser } from '@clerk/nextjs'

type MetadataRecord = Record<string, unknown>
type SideMenuVariant = 'desktop' | 'mobile'

type SideMenuProps = {
  variant?: SideMenuVariant
  isOpen?: boolean
  onClose?: () => void
}

function isRecord(value: unknown): value is MetadataRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizePlanName(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()

  if (!isRecord(value)) return null

  const status = value.status
  if (typeof status === 'string' && status.toLowerCase() !== 'active') return null

  for (const key of ['name', 'displayName', 'label', 'title', 'slug', 'id']) {
    const candidate = value[key]
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }

  const nestedPlan = value.plan
  if (nestedPlan) return normalizePlanName(nestedPlan)

  return null
}

function getPlanFromMetadata(metadata: MetadataRecord) {
  for (const key of [
    'activeSubscriptionPlan',
    'active_subscription_plan',
    'subscriptionPlan',
    'subscription_plan',
    'currentPlan',
    'current_plan',
    'planName',
    'plan_name',
    'plan',
    'subscription',
  ]) {
    const planName = normalizePlanName(metadata[key])
    if (planName) return planName
  }

  return null
}

function formatPlanName(planName: string) {
  return planName
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export default function SideMenu({ variant = 'desktop', isOpen = false, onClose }: SideMenuProps) {
  const pathname = usePathname()
  const { isLoaded, user } = useUser()
  const isMobile = variant === 'mobile'
  const isHome = pathname === '/main/homepage' || pathname === '/main/progress' || pathname === '/'
  const isPractice = pathname?.startsWith('/main/practice-center')
  const isReview = pathname?.startsWith('/main/review-center')
  const isProfile = pathname?.startsWith('/main/profile')
  const base = 'flex items-center px-4 py-3 rounded-lg transition-colors duration-200'
  const active = 'text-primary font-bold border-l-4 border-primary bg-primary-container/10'
  const inactive = 'text-on-surface-variant dark:text-surface-dim hover:text-primary hover:bg-surface-container-high dark:hover:bg-surface-variant'
  const metadataPlan =
    (isRecord(user?.publicMetadata) && getPlanFromMetadata(user.publicMetadata)) ||
    (isRecord(user?.unsafeMetadata) && getPlanFromMetadata(user.unsafeMetadata))
  const displayName = user?.username || user?.fullName || user?.primaryEmailAddress?.emailAddress || 'Learner'
  const planName = metadataPlan ? formatPlanName(metadataPlan) : 'Free'
  const initials =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'U'
  const navClassName = isMobile
    ? `fixed right-0 top-0 z-[70] flex h-screen h-dvh w-[min(20rem,calc(100vw-3rem))] flex-col justify-between border-l border-outline-variant bg-surface-container-low shadow-[-18px_0_40px_-28px_rgba(15,23,42,0.7)] transition-transform duration-300 ease-out dark:border-outline dark:bg-surface-container-highest md:hidden ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`
    : 'bg-surface-container-low dark:bg-surface-container-highest h-screen w-64 fixed left-0 top-0 hidden md:flex flex-col border-r border-outline-variant dark:border-outline z-50 justify-between'
  const handleNavigate = () => onClose?.()

  return (
    <nav
      id={isMobile ? 'mobile-side-menu' : undefined}
      className={navClassName}
      aria-label="Main navigation"
      aria-hidden={isMobile ? !isOpen : undefined}
      inert={isMobile && !isOpen ? true : undefined}
    >
      <div>
        <div className="px-4 py-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-primary">English Academy</h1>
              <p className="text-sm text-on-surface-variant dark:text-surface-dim mt-1">Wise Mentor AI</p>
            </div>
            {isMobile ? (
              <button
                type="button"
                onClick={onClose}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container"
                aria-label="Close navigation menu"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            ) : null}
          </div>
        </div>
        <Link
          href="/main/profile"
          onClick={handleNavigate}
          className={`mx-3 flex items-center gap-3 rounded-lg px-3 py-3 transition-colors duration-200 ${
            isProfile
              ? 'bg-primary-container/10 text-primary'
              : 'text-on-surface hover:bg-surface-container-high dark:hover:bg-surface-variant'
          }`}
          aria-current={isProfile ? 'page' : undefined}
        >
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary bg-cover bg-center text-sm font-bold text-on-primary ${
              user?.imageUrl ? 'text-transparent' : ''
            }`}
            style={user?.imageUrl ? { backgroundImage: `url(${user.imageUrl})` } : undefined}
            aria-hidden="true"
          >
            {initials}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold">{isLoaded ? displayName : 'Loading...'}</span>
            <span className="block truncate text-xs text-on-surface-variant dark:text-surface-dim">{isLoaded ? planName : 'Free'}</span>
          </span>
        </Link>
        <div className="mx-4 border-b border-outline-variant/30 my-2" />
        <div className="overflow-y-auto py-stack-md px-3 space-y-2">
          <Link href="/main/homepage" onClick={handleNavigate} className={`${base} ${isHome ? active : inactive}`} aria-current={isHome ? 'page' : undefined}>
            <span className={`material-symbols-outlined mr-3 ${isHome ? 'filled' : ''}`}>home</span>
            <span className="text-sm">Trang chủ</span>
          </Link>
          <Link href="/main/practice-center" onClick={handleNavigate} className={`${base} ${isPractice ? active : inactive}`} aria-current={isPractice ? 'page' : undefined}>
            <span className={`material-symbols-outlined mr-3 ${isPractice ? 'filled' : ''}`}>school</span>
            <span className="text-sm">Trung tâm thực hành</span>
          </Link>
          <Link href="/main/review-center" onClick={handleNavigate} className={`${base} ${isReview ? active : inactive}`} aria-current={isReview ? 'page' : undefined}>
            <span className={`material-symbols-outlined mr-3 ${isReview ? 'filled' : ''}`}>hub</span>
            <span className="text-sm">Trung tâm ôn luyện</span>
          </Link>
        </div>
      </div>
      <div className="py-4 px-3 space-y-2 border-t border-outline-variant/30 mt-auto">
        <Link onClick={handleNavigate} className="flex items-center px-4 py-2 rounded-lg text-on-surface-variant dark:text-surface-dim hover:text-primary hover:bg-surface-container-high dark:hover:bg-surface-variant transition-colors duration-200" href="/main/help">
          <span className="material-symbols-outlined mr-3 text-sm">help</span>
          <span className="text-sm">Trợ giúp</span>
        </Link>
        <Link onClick={handleNavigate} className="flex items-center px-4 py-2 rounded-lg text-on-surface-variant dark:text-surface-dim hover:text-primary hover:bg-surface-container-high dark:hover:bg-surface-variant transition-colors duration-200" href="/main/about">
          <span className="material-symbols-outlined mr-3 text-sm">info</span>
          <span className="text-sm">Về chúng tôi</span>
        </Link>
      </div>
    </nav>
  )
}
