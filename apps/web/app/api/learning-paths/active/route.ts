import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { isApiError } from '@/lib/api/client';
import { getActiveLearningPath } from '@/lib/onboarding/status';

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
    const activeLearningPath = await getActiveLearningPath(userId, token);
    if (!activeLearningPath) {
      return NextResponse.json({ message: 'No active learning path found' }, { status: 404 });
    }

    return NextResponse.json(activeLearningPath);
  } catch (error) {
    if (isApiError(error)) {
      return NextResponse.json({ message: error.message, body: error.body }, { status: error.status });
    }

    return NextResponse.json({ message: 'Unable to load your active learning path right now.' }, { status: 502 });
  }
}
