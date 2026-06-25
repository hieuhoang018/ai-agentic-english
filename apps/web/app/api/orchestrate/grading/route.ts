import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { apiFetch, isApiError } from '@/lib/api/client';
import type { GradingRequest, GradingResponse } from '@/lib/api/types';

export async function POST(request: Request) {
  const { getToken, userId } = await auth();

  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  let body: Partial<GradingRequest>;
  try {
    body = (await request.json()) as Partial<GradingRequest>;
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body.exerciseId !== 'string' || typeof body.attemptedAnswer !== 'string') {
    return NextResponse.json({ message: 'exerciseId and attemptedAnswer are required' }, { status: 400 });
  }

  const token = await getToken();
  if (!token) {
    return NextResponse.json({ message: 'Unable to acquire session token' }, { status: 401 });
  }

  try {
    const result = await apiFetch<GradingResponse>('/orchestrate/grading', {
      method: 'POST',
      token,
      body: {
        exerciseId: body.exerciseId,
        attemptedAnswer: body.attemptedAnswer,
        userId,
      } satisfies GradingRequest,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (isApiError(error)) {
      return NextResponse.json({ message: error.message, body: error.body }, { status: error.status });
    }

    return NextResponse.json({ message: 'Unable to check your answer right now.' }, { status: 502 });
  }
}
