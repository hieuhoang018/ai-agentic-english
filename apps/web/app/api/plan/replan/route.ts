import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { apiFetch, isApiError } from '@/lib/api/client';
import type { ReplanResponse } from '@/lib/api/types';

type ReplanRequest = {
  daily_minutes?: number;
  goals?: string[];
  skill_estimates?: Record<string, number>;
};

export async function POST(request: Request) {
  const { getToken, userId } = await auth();

  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  let body: ReplanRequest;
  try {
    body = (await request.json()) as ReplanRequest;
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body.daily_minutes !== 'number') {
    return NextResponse.json({ message: 'daily_minutes is required' }, { status: 400 });
  }

  const token = await getToken();
  if (!token) {
    return NextResponse.json({ message: 'Unable to acquire session token' }, { status: 401 });
  }

  try {
    const result = await apiFetch<ReplanResponse>(`/replan/${userId}`, {
      method: 'POST',
      token,
      body: {
        daily_minutes: body.daily_minutes,
        goals: body.goals ?? [],
        skill_estimates: body.skill_estimates,
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    if (isApiError(error)) {
      return NextResponse.json({ message: error.message, body: error.body }, { status: error.status });
    }

    return NextResponse.json({ message: 'Unable to regenerate your learning plan right now.' }, { status: 502 });
  }
}
