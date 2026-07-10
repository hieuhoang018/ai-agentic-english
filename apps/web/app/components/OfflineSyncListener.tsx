'use client'

import { useEffect } from 'react'

import { watchForOnlineFlush } from '@/lib/offline/reviews'

// Renders nothing — just keeps the offline-review queue draining in the
// background regardless of which page is currently mounted. See
// docs/pwa-offline-sync-and-push-plan.md Stage 3.
export default function OfflineSyncListener() {
  useEffect(() => watchForOnlineFlush(), [])

  return null
}
