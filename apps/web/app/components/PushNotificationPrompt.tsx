'use client'

import { useEffect, useState } from 'react'

const dismissedAtKey = 'english-academy:push-prompt-dismissed-at'
const reprompDismissWindowMs = 14 * 24 * 60 * 60 * 1000

function isRecentlyDismissed() {
  const dismissedAt = window.localStorage.getItem(dismissedAtKey)
  if (!dismissedAt) return false
  return Date.now() - Number(dismissedAt) < reprompDismissWindowMs
}

function markDismissed() {
  window.localStorage.setItem(dismissedAtKey, String(Date.now()))
}

function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

// PushManager.subscribe() needs the VAPID public key as a Uint8Array, not the
// base64url string it's distributed as.
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const base64Safe = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64Safe)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

export default function PushNotificationPrompt() {
  const [visible, setVisible] = useState(false)
  const [subscribing, setSubscribing] = useState(false)

  useEffect(() => {
    if (!isPushSupported()) return
    if (Notification.permission !== 'default') return
    if (isRecentlyDismissed()) return

    // window/navigator/Notification are unavailable during SSR, so this
    // can't be a lazy useState initializer — it has to run post-mount,
    // client-only, via this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(true)
  }, [])

  const dismiss = () => {
    markDismissed()
    setVisible(false)
  }

  const subscribe = async () => {
    setSubscribing(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        markDismissed()
        setVisible(false)
        return
      }

      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!publicKey) {
        console.error('NEXT_PUBLIC_VAPID_PUBLIC_KEY is not configured')
        setVisible(false)
        return
      }

      // `.ready` resolves once a registration exists and is active —
      // including one still finishing registration right now (SerwistProvider
      // registers on mount, which can still be in flight on a fresh page
      // load). It only hangs forever if a service worker is *never*
      // registered at all (e.g. `next dev`, where registration is
      // deliberately disabled) — guard that specific case with a timeout
      // instead of bailing out silently on every ordinary race.
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, reject) =>
          window.setTimeout(() => reject(new Error('service worker never became ready')), 10_000),
        ),
      ])

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      })
      if (!res.ok) {
        console.error('Failed to save push subscription', res.status, await res.text().catch(() => ''))
        return
      }

      setVisible(false)
    } catch (error) {
      console.error('Push subscription failed', error)
    } finally {
      setSubscribing(false)
    }
  }

  if (!visible) return null

  return (
    <div
      // Sits above InstallPwaPrompt's slot (both are fixed-bottom banners
      // that can legitimately be visible at once for a new user) instead of
      // overlapping it.
      className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-[80] flex justify-center px-4"
      role="dialog"
      aria-label="Bật thông báo"
    >
      <div className="flex w-full max-w-[28rem] items-center gap-3 rounded-xl border border-outline-variant bg-white p-4 shadow-[0_18px_60px_-36px_rgba(15,23,42,0.8)]">
        <span className="material-symbols-outlined shrink-0 text-primary">notifications</span>
        <div className="flex-1 text-sm">
          <p className="font-semibold text-on-surface">Bật thông báo để không bỏ lỡ nhắc nhở học tập</p>
        </div>
        <button
          type="button"
          onClick={subscribe}
          disabled={subscribing}
          className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          Bật
        </button>
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
