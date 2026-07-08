import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { apiFetch, isApiError } from '@/lib/api/client';
import type { DueReviewItem } from '@/lib/api/types';

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
    const due = await apiFetch<DueReviewItem[]>(`/schedule/${userId}/due`, { token });
    return NextResponse.json(due);
  } catch (error) {
    if (isApiError(error)) {
      return NextResponse.json({ message: error.message, body: error.body }, { status: error.status });
    }

    return NextResponse.json({ message: 'Unable to load due review items right now.' }, { status: 502 });
  }
}
