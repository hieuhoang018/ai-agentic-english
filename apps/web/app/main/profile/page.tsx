import { UserProfile } from '@clerk/nextjs'

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
      />
    </div>
  )
}
