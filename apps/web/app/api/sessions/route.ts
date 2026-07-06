import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { apiFetch, isApiError } from '@/lib/api/client';
import type { SessionSummaryItem } from '@/lib/api/types';

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
    const sessions = await apiFetch<SessionSummaryItem[]>(`/sessions/${userId}?limit=50`, { token });
    return NextResponse.json(sessions);
  } catch (error) {
    if (isApiError(error)) {
      return NextResponse.json({ message: error.message, body: error.body }, { status: error.status });
    }

    return NextResponse.json({ message: 'Unable to load your session history right now.' }, { status: 502 });
  }
}
