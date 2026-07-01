import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { apiFetch, isApiError } from '@/lib/api/client';
import type { AssessmentResultDto } from '@/lib/api/types';

type AssessmentScoreRequest = {
  answers?: Array<{ questionId: string; answer: unknown }>;
};

export async function POST(request: Request) {
  const { getToken, userId } = await auth();

  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  let body: AssessmentScoreRequest;
  try {
    body = (await request.json()) as AssessmentScoreRequest;
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  if (!Array.isArray(body.answers)) {
    return NextResponse.json({ message: 'answers must be an array' }, { status: 400 });
  }

  const token = await getToken();
  if (!token) {
    return NextResponse.json({ message: 'Unable to acquire session token' }, { status: 401 });
  }

  try {
    const result = await apiFetch<AssessmentResultDto>('/assessment/score', {
      method: 'POST',
      token,
      body: { answers: body.answers },
    });
    return NextResponse.json(result);
  } catch (error) {
    if (isApiError(error)) {
      return NextResponse.json({ message: error.message, body: error.body }, { status: error.status });
    }

    return NextResponse.json({ message: 'Unable to score assessment.' }, { status: 502 });
  }
}
