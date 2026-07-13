"use client"

import { SignOutButton, UserProfile } from '@clerk/nextjs'

export default function ProfilePage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl justify-center">
      <UserProfile
        routing="hash"
        appearance={{
          elements: {
            rootBox: 'w-full',
            cardBox: 'w-full shadow-none border border-outline-variant rounded-lg',
          },
        }}
      >
        <UserProfile.Page
          label="Sign out"
          url="sign-out"
          labelIcon={<span className="material-symbols-outlined text-base">logout</span>}
        >
          <div className="space-y-5 p-6">
            <div>
              <h2 className="text-xl font-bold text-on-surface dark:text-on-primary">Sign out</h2>
              <p className="mt-2 text-sm text-on-surface-variant dark:text-surface-dim">
                End your current session and return to the landing page.
              </p>
            </div>
            <SignOutButton redirectUrl="/">
              <button
                type="button"
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-error px-5 text-sm font-bold text-on-error transition-colors hover:bg-error/90"
              >
                Sign out
              </button>
            </SignOutButton>
          </div>
        </UserProfile.Page>
      </UserProfile>
    </div>
  )
}
