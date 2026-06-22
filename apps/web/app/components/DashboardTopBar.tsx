"use client"

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Crumb = {
  label: string
  href?: string
}

type BreadcrumbScope = 'home' | 'practice' | 'review' | 'other'

const breadcrumbStoragePrefix = 'english-academy:breadcrumb-history'
const lastPathStorageKey = 'english-academy:last-path'

const skillLabels: Record<string, string> = {
  reading: 'Luyện Đọc',
  listening: 'Luyện Nghe',
  writing: 'Luyện Viết',
  speaking: 'Luyện Nói',
}

const flashcardTopicLabels: Record<string, string> = {
  technology: 'Technology',
  business: 'Business English',
  travel: 'Travel & Tourism',
  daily: 'Daily Life',
  academic: 'Academic Vocabulary',
  food: 'Food & Dining',
}

const grammarCategoryLabels: Record<string, string> = {
  'basic-tenses': 'Các thì cơ bản',
  'complex-sentences': 'Cấu trúc câu phức',
  'parts-of-speech': 'Từ loại',
}

const grammarLessonLabels: Record<string, string> = {
  'present-simple': 'Thì hiện tại đơn',
  'past-simple': 'Thì quá khứ đơn',
  'present-perfect': 'Thì hiện tại hoàn thành',
}

function buildPracticeCrumbs(pathname: string): Crumb[] {
  const parts = pathname.split('/').filter(Boolean)
  const crumbs: Crumb[] = [{ label: 'Trung tâm thực hành', href: '/main/practice-center' }]
  const skill = parts[2]

  if (skill && skillLabels[skill]) {
    crumbs.push({ label: skillLabels[skill], href: `/main/practice-center/${skill}` })
  }

  if (parts.includes('modules')) {
    const moduleId = parts[parts.indexOf('modules') + 1]
    if (moduleId) crumbs.push({ label: `Module ${moduleId.replace('module-', '')}` })
  }

  if (skill === 'speaking' && parts.includes('history')) {
    crumbs.splice(2)
    crumbs.push({ label: 'Lịch sử hội thoại', href: '/main/practice-center/speaking/history' })
    const conversationId = parts[parts.indexOf('history') + 1]
    if (conversationId) crumbs.push({ label: 'Chi tiết hội thoại' })
  }

  return crumbs
}

function buildReviewCrumbs(pathname: string): Crumb[] {
  const parts = pathname.split('/').filter(Boolean)
  const crumbs: Crumb[] = [{ label: 'Trung tâm ôn luyện', href: '/main/review-center' }]
  const area = parts[2]

  if (area === 'flashcards') {
    crumbs.push({ label: 'Flashcard', href: '/main/review-center/flashcards' })
    const topicId = parts[3]
    if (topicId) crumbs.push({ label: flashcardTopicLabels[topicId] ?? topicId, href: `/main/review-center/flashcards/${topicId}` })
    if (parts[4] === 'study') crumbs.push({ label: 'Học thẻ' })
  }

  if (area === 'grammar') {
    crumbs.push({ label: 'Ngữ pháp', href: '/main/review-center/grammar' })
    const categoryId = parts[3]
    if (categoryId) crumbs.push({ label: grammarCategoryLabels[categoryId] ?? categoryId, href: `/main/review-center/grammar/${categoryId}` })
    const lessonId = parts[4]
    if (lessonId) crumbs.push({ label: grammarLessonLabels[lessonId] ?? lessonId })
  }

  return crumbs
}

function buildCrumbs(pathname: string): Crumb[] {
  if (pathname === '/main/homepage') return [{ label: 'Trang chủ', href: '/main/homepage' }]
  if (pathname === '/main/progress') return [{ label: 'Trang chủ', href: '/main/homepage' }, { label: 'Tiến độ học tập', href: '/main/progress' }]
  if (pathname.startsWith('/main/practice-center')) return buildPracticeCrumbs(pathname)
  if (pathname.startsWith('/main/review-center')) return buildReviewCrumbs(pathname)
  return [{ label: 'English Academy', href: pathname }]
}

function getBreadcrumbScope(pathname: string): BreadcrumbScope {
  if (pathname === '/main/homepage' || pathname === '/main/progress') return 'home'
  if (pathname.startsWith('/main/practice-center')) return 'practice'
  if (pathname.startsWith('/main/review-center')) return 'review'
  return 'other'
}

function isSectionRoot(pathname: string) {
  return pathname === '/main/practice-center' || pathname === '/main/review-center'
}

function getScopedStorageKey(scope: BreadcrumbScope) {
  return `${breadcrumbStoragePrefix}:${scope}`
}

function getHistoryLabel(pathname: string) {
  const crumbs = buildCrumbs(pathname)
  return crumbs[crumbs.length - 1]?.label ?? 'English Academy'
}

function getCrumbForPath(pathname: string): Required<Crumb> {
  return { label: getHistoryLabel(pathname), href: pathname }
}

function readStoredTrail(scope: BreadcrumbScope): Crumb[] {
  if (typeof window === 'undefined') return []

  try {
    const rawTrail = window.sessionStorage.getItem(getScopedStorageKey(scope))
    if (!rawTrail) return []
    const parsed = JSON.parse(rawTrail)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item) => typeof item?.label === 'string' && typeof item?.href === 'string')
  } catch {
    return []
  }
}

function writeStoredTrail(scope: BreadcrumbScope, trail: Crumb[]) {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(getScopedStorageKey(scope), JSON.stringify(trail))
}

function readLastPath() {
  if (typeof window === 'undefined') return null
  return window.sessionStorage.getItem(lastPathStorageKey)
}

function writeLastPath(pathname: string) {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(lastPathStorageKey, pathname)
}

function seedTrailFromStaticCrumbs(pathname: string, fallbackCrumbs: Crumb[]) {
  return fallbackCrumbs
    .map((crumb, index) => (index === fallbackCrumbs.length - 1 ? getCrumbForPath(pathname) : crumb))
    .filter((crumb): crumb is Required<Crumb> => typeof crumb.label === 'string' && typeof crumb.href === 'string')
}

export default function DashboardTopBar() {
  const pathname = usePathname() || '/'
  const fallbackCrumbs = useMemo(() => buildCrumbs(pathname), [pathname])
  const breadcrumbScope = useMemo(() => getBreadcrumbScope(pathname), [pathname])
  const [historyCrumbs, setHistoryCrumbs] = useState<Crumb[]>(fallbackCrumbs)
  const shouldHideBreadcrumb = pathname === '/main/homepage' || pathname === '/main/practice-center' || pathname === '/main/review-center'

  useEffect(() => {
    const currentCrumb = getCrumbForPath(pathname)
    const lastPath = readLastPath()
    const lastScope = lastPath ? getBreadcrumbScope(lastPath) : null
    const storedTrail = readStoredTrail(breadcrumbScope)
    const existingIndex = storedTrail.findIndex((crumb) => crumb.href === pathname)

    let nextTrail: Crumb[]

    if (isSectionRoot(pathname)) {
      nextTrail = [currentCrumb]
    } else if (existingIndex >= 0) {
      nextTrail = storedTrail.slice(0, existingIndex + 1)
    } else if (lastPath && lastPath !== pathname && lastScope !== breadcrumbScope) {
      nextTrail = [getCrumbForPath(lastPath), currentCrumb]
    } else if (storedTrail.length > 0) {
      nextTrail = [...storedTrail, currentCrumb].slice(-8)
    } else {
      nextTrail = seedTrailFromStaticCrumbs(pathname, fallbackCrumbs)
    }

    const normalizedTrail =
      nextTrail.length > 0
        ? nextTrail.map((crumb, index) => (index === nextTrail.length - 1 ? currentCrumb : crumb))
        : [currentCrumb]

    writeStoredTrail(breadcrumbScope, normalizedTrail)
    writeLastPath(pathname)

    const updateId = window.setTimeout(() => setHistoryCrumbs(normalizedTrail), 0)
    return () => window.clearTimeout(updateId)
  }, [breadcrumbScope, fallbackCrumbs, pathname])

  const visibleCrumbs = historyCrumbs.length > 0 ? historyCrumbs : fallbackCrumbs
  const previousCrumb = visibleCrumbs.length > 1 ? visibleCrumbs[visibleCrumbs.length - 2] : fallbackCrumbs[fallbackCrumbs.length - 2]
  const canGoBack = !shouldHideBreadcrumb && Boolean(previousCrumb?.href)

  return (
    <header className="bg-surface/90 dark:bg-inverse-surface/90 backdrop-blur-md sticky top-0 z-40 flex min-h-16 items-center w-full px-container-margin py-3 border-b border-outline-variant/60">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {canGoBack ? (
          <Link
            href={previousCrumb?.href ?? '/main/homepage'}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container"
            aria-label="Quay lại"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </Link>
        ) : null}

        {!shouldHideBreadcrumb ? (
          <nav className="flex min-w-0 items-center gap-2 text-sm text-on-surface-variant" aria-label="Breadcrumb">
            {visibleCrumbs.map((crumb, index) => {
              const isLast = index === visibleCrumbs.length - 1
              return (
                <span key={`${crumb.label}-${crumb.href ?? index}`} className="flex min-w-0 items-center gap-2">
                  {crumb.href && !isLast ? (
                    <Link className="truncate hover:text-primary" href={crumb.href}>
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className={isLast ? 'truncate font-semibold text-primary' : 'truncate'}>{crumb.label}</span>
                  )}
                  {!isLast ? <span className="text-outline">›</span> : null}
                </span>
              )
            })}
          </nav>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <button className="relative flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container" aria-label="Thông báo">
          <span className="material-symbols-outlined">notifications</span>
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-error ring-2 ring-surface" />
        </button>
        <Link href="/main/settings" className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container" aria-label="Cài đặt">
          <span className="material-symbols-outlined">settings</span>
        </Link>
      </div>
    </header>
  )
}
