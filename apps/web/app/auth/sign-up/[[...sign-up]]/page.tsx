import React from 'react';
import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return <SignUp forceRedirectUrl="/onboarding/goals?fresh_signup=1" signInUrl="/auth/sign-in" />;
}
