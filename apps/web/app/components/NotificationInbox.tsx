'use client'

import { useUser } from '@clerk/nextjs'
import { Inbox } from '@novu/react'
import { useEffect, useState } from 'react'

const applicationIdentifier = process.env.NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER

type HashState = { status: 'loading' } | { status: 'success'; subscriberHash: string } | { status: 'error' }

function BellButton({ unreadCount }: { unreadCount?: number }) {
  return (
    <button
      type="button"
      className="relative flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container"
      aria-label="Thông báo"
    >
      <span className="material-symbols-outlined">notifications</span>
      {unreadCount ? <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-error ring-2 ring-surface" /> : null}
    </button>
  )
}

export default function NotificationInbox() {
  const { user } = useUser()
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

  if (!applicationIdentifier || !user || hash.status !== 'success') {
    return <BellButton />
  }

  return (
    <Inbox
      subscriber={user.id}
      subscriberHash={hash.subscriberHash}
      applicationIdentifier={applicationIdentifier}
      renderBell={(unreadCount) => <BellButton unreadCount={unreadCount.total} />}
    />
  )
}
