'use client'

import { useEffect, useState } from 'react'

const dismissedAtKey = 'english-academy:pwa-install-dismissed-at'
const reprompDismissWindowMs = 14 * 24 * 60 * 60 * 1000

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function isRecentlyDismissed() {
  const dismissedAt = window.localStorage.getItem(dismissedAtKey)
  if (!dismissedAt) return false
  return Date.now() - Number(dismissedAt) < reprompDismissWindowMs
}

function markDismissed() {
  window.localStorage.setItem(dismissedAtKey, String(Date.now()))
}

function isStandaloneDisplayMode() {
  const isIosStandalone = (window.navigator as { standalone?: boolean }).standalone === true
  return isIosStandalone || window.matchMedia('(display-mode: standalone)').matches
}

function isIos() {
  return /iPad|iPhone|iPod/.test(window.navigator.userAgent) && !('MSStream' in window)
}

export default function InstallPwaPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showIosInstructions, setShowIosInstructions] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (isStandaloneDisplayMode() || isRecentlyDismissed()) return

    if (isIos()) {
      // window/navigator are unavailable during SSR, so this can't be a lazy useState
      // initializer — it has to run post-mount, client-only, via this effect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowIosInstructions(true)
      return
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  }, [])

  const dismiss = () => {
    markDismissed()
    setDismissed(true)
  }

  const install = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    setDeferredPrompt(null)
    if (choice.outcome === 'dismissed') markDismissed()
  }

  if (dismissed || (!deferredPrompt && !showIosInstructions)) return null

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[80] flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
      role="dialog"
      aria-label="Cài đặt ứng dụng"
    >
      <div className="flex w-full max-w-md items-center gap-3 rounded-xl border border-outline-variant bg-white p-4 shadow-[0_18px_60px_-36px_rgba(15,23,42,0.8)]">
        <span className="material-symbols-outlined shrink-0 text-primary">
          {showIosInstructions ? 'add_to_home_screen' : 'download'}
        </span>
        <div className="flex-1 text-sm">
          {showIosInstructions ? (
            <p className="text-on-surface">
              Cài English Academy lên máy: nhấn <span className="material-symbols-outlined align-text-bottom text-[16px]">ios_share</span> rồi chọn{' '}
              <strong>&quot;Thêm vào MH chính&quot;</strong>.
            </p>
          ) : (
            <p className="font-semibold text-on-surface">Cài English Academy để dùng nhanh và tiện hơn</p>
          )}
        </div>
        {!showIosInstructions && (
          <button
            type="button"
            onClick={install}
            className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-white"
          >
            Cài đặt
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Đóng"
          className="shrink-0 rounded-full p-1 text-on-surface-variant hover:bg-surface-container"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>
    </div>
  )
}
