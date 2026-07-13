'use client'

import { useUser } from '@clerk/nextjs'
import { Inbox } from '@novu/react'
import { useEffect, useState } from 'react'

import { useTheme } from '@/lib/useTheme'

const applicationIdentifier = process.env.NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER

type HashState = { status: 'loading' } | { status: 'success'; subscriberHash: string } | { status: 'error' }

// Novu's <Inbox> mounts renderBell's output into its own internally-managed DOM node
// (novuUI.mountComponent -> React createPortal) rather than plain light-DOM JSX, so our
// app's compiled Tailwind stylesheet (dark:text-on-primary etc.) doesn't reliably reach it —
// only an inline style is guaranteed to apply regardless of how/where Novu mounts this node.
function BellButton({ unreadCount, isDark }: { unreadCount?: number; isDark: boolean }) {
  return (
    <button
      type="button"
      className="relative flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container dark:text-on-primary"
      style={isDark ? { color: '#ffffff' } : undefined}
      aria-label="Thông báo"
    >
      <span className="material-symbols-outlined">notifications</span>
      {unreadCount ? <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-error ring-2 ring-surface" /> : null}
    </button>
  )
}

export default function NotificationInbox() {
  const { user } = useUser()
  const { resolvedTheme } = useTheme()
  const [hash, setHash] = useState<HashState>({ status: 'loading' })

  useEffect(() => {
    fetch('/api/notifications/hash')
      .then((response) => {
        if (!response.ok) throw new Error(`Request failed with ${response.status}`)
        return response.json() as Promise<{ subscriberHash: string }>
      })
      .then(({ subscriberHash }) => setHash({ status: 'success', subscriberHash }))
      .catch(() => setHash({ status: 'error' }))
  }, [])

  const isDark = resolvedTheme === 'dark'

  if (!applicationIdentifier || !user || hash.status !== 'success') {
    return <BellButton isDark={isDark} />
  }

  return (
    <Inbox
      subscriber={user.id}
      subscriberHash={hash.subscriberHash}
      applicationIdentifier={applicationIdentifier}
      renderBell={(unreadCount) => <BellButton unreadCount={unreadCount.total} isDark={isDark} />}
    />
  )
}
