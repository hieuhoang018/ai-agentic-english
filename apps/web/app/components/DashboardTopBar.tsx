"use client"

import { useEffect, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Crumb = {
  label: string
  href?: string
}

type MainSection = 'home' | 'practice' | 'review'

type BreadcrumbConfig = {
  crumbs: Crumb[]
  backHref?: string
  hide?: boolean
}

const mainSectionStorageKey = 'english-academy:main-breadcrumb-section'

const mainSections: Record<MainSection, Required<Crumb>> = {
  home: { label: 'Trang chủ', href: '/main/homepage' },
  practice: { label: 'Trung tâm thực hành', href: '/main/practice-center' },
  review: { label: 'Trung tâm ôn luyện', href: '/main/review-center' },
}

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

const simplePageLabels: Record<string, string> = {
  '/main/about': 'Về chúng tôi',
  '/main/help': 'Trợ giúp',
  '/main/profile': 'Hồ sơ cá nhân',
  '/main/progress': 'Tiến độ học tập',
  '/main/settings': 'Cài đặt',
}

function isMainSection(value: string | null): value is MainSection {
  return value === 'home' || value === 'practice' || value === 'review'
}

function getAnchoredMainSection(pathname: string): MainSection | null {
  if (pathname === '/main/homepage' || pathname === '/main/progress') return 'home'
  if (pathname === '/main/practice-center') return 'practice'
  if (pathname === '/main/review-center') return 'review'
  return null
}

function getRouteMainSection(pathname: string): MainSection {
  if (pathname.startsWith('/main/practice-center')) return 'practice'
  if (pathname.startsWith('/main/review-center')) return 'review'
  return 'home'
}

function subscribeToMainSectionStore() {
  return () => {}
}

function getStoredMainSection(): MainSection | null {
  if (typeof window === 'undefined') return null

  const storedSection = window.sessionStorage.getItem(mainSectionStorageKey)
  return isMainSection(storedSection) ? storedSection : null
}

function getServerMainSection() {
  return null
}

function getCurrentMainSection(pathname: string, storedSection: MainSection | null): MainSection {
  const anchoredSection = getAnchoredMainSection(pathname)
  if (anchoredSection) return anchoredSection
  return storedSection ?? getRouteMainSection(pathname)
}

function buildPracticeCrumbs(pathname: string): Crumb[] {
  const parts = pathname.split('/').filter(Boolean)
  const crumbs: Crumb[] = [mainSections.practice]
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
  const crumbs: Crumb[] = [mainSections.review]
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

function getSimplePageLabel(pathname: string) {
  return simplePageLabels[pathname] ?? 'English Academy'
}

function getParentHref(crumbs: Crumb[]) {
  return crumbs.length > 1 ? crumbs[crumbs.length - 2]?.href : undefined
}

function applyMainSectionOrigin(crumbs: Crumb[], routeSection: MainSection, mainSection: MainSection) {
  if (mainSection === routeSection) return crumbs
  return [mainSections[mainSection], ...crumbs.slice(1)]
}

function buildBreadcrumbConfig(pathname: string, mainSection: MainSection): BreadcrumbConfig {
  if (pathname === '/main/homepage' || pathname === '/main/practice-center' || pathname === '/main/review-center') {
    return { crumbs: [], hide: true }
  }

  if (pathname === '/main/progress') {
    const crumbs = [mainSections.home, { label: getSimplePageLabel(pathname), href: pathname }]
    return { crumbs, backHref: mainSections.home.href }
  }

  if (pathname === '/main/about' || pathname === '/main/help' || pathname === '/main/profile' || pathname === '/main/settings') {
    const crumbs = [{ label: getSimplePageLabel(pathname), href: pathname }]
    return { crumbs, backHref: mainSections.home.href }
  }

  if (pathname.startsWith('/main/practice-center')) {
    const crumbs = applyMainSectionOrigin(buildPracticeCrumbs(pathname), 'practice', mainSection)
    return { crumbs, backHref: getParentHref(crumbs) ?? mainSections.practice.href }
  }

  if (pathname.startsWith('/main/review-center')) {
    const crumbs = applyMainSectionOrigin(buildReviewCrumbs(pathname), 'review', mainSection)
    return { crumbs, backHref: getParentHref(crumbs) ?? mainSections.review.href }
  }

  const crumbs = [mainSections.home, { label: getSimplePageLabel(pathname), href: pathname }]
  return { crumbs, backHref: mainSections.home.href }
}

export default function DashboardTopBar() {
  const pathname = usePathname() || '/'
  const storedMainSection = useSyncExternalStore(subscribeToMainSectionStore, getStoredMainSection, getServerMainSection)
  const mainSection = getCurrentMainSection(pathname, storedMainSection)
  const { crumbs, backHref, hide } = buildBreadcrumbConfig(pathname, mainSection)
  const canGoBack = !hide && Boolean(backHref)

  useEffect(() => {
    const anchoredSection = getAnchoredMainSection(pathname)
    if (!anchoredSection) return

    window.sessionStorage.setItem(mainSectionStorageKey, anchoredSection)
  }, [pathname])

  return (
    <header className="bg-surface/90 dark:bg-inverse-surface/90 backdrop-blur-md sticky top-0 z-40 flex min-h-16 items-center w-full px-container-margin py-3 border-b border-outline-variant/60">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {canGoBack ? (
          <Link
            href={backHref ?? mainSections.home.href}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container"
            aria-label="Quay lại"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </Link>
        ) : null}

        {!hide ? (
          <nav className="flex min-w-0 items-center gap-2 text-sm text-on-surface-variant" aria-label="Breadcrumb">
            {crumbs.map((crumb, index) => {
              const isLast = index === crumbs.length - 1
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
