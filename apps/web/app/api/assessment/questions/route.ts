import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { apiFetch, isApiError } from '@/lib/api/client';
import type { AssessmentQuestionDto } from '@/lib/api/types';

export async function GET(request: Request) {
  const { getToken, userId } = await auth();

  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const token = await getToken();
  if (!token) {
    return NextResponse.json({ message: 'Unable to acquire session token' }, { status: 401 });
  }

  const searchParams = new URL(request.url).searchParams;
  const skill = searchParams.get('skill');
  const path = skill
    ? `/assessment/questions?skill=${encodeURIComponent(skill)}`
    : '/assessment/questions';

  try {
    const questions = await apiFetch<AssessmentQuestionDto[]>(path, { token });
    return NextResponse.json(questions);
  } catch (error) {
    if (isApiError(error)) {
      return NextResponse.json({ message: error.message, body: error.body }, { status: error.status });
    }

    return NextResponse.json({ message: 'Unable to load assessment questions.' }, { status: 502 });
  }
}
