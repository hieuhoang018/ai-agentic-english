import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { isApiError } from '@/lib/api/client';
import { getOnboardingStatus } from '@/lib/onboarding/status';

export async function GET() {
  const { getToken, userId } = await auth();

  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const token = await getToken();
  if (!token) {
    return NextResponse.json({ message: 'Unable to acquire session token' }, { status: 401 });
  }

  try {
    const status = await getOnboardingStatus(userId, token);
    return NextResponse.json(status);
  } catch (error) {
    if (isApiError(error)) {
      return NextResponse.json({ message: error.message, body: error.body }, { status: error.status });
    }

    return NextResponse.json({ message: 'Unable to load onboarding status right now.' }, { status: 502 });
  }
}
