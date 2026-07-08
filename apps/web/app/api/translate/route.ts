import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { apiFetch, isApiError } from '@/lib/api/client';
import type { TranslateResponse } from '@/lib/api/types';

type TranslateRequestBody = {
  content?: string;
  session_type?: string;
};

export async function POST(request: Request) {
  const { getToken, userId } = await auth();

  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  let body: TranslateRequestBody;
  try {
    body = (await request.json()) as TranslateRequestBody;
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body.content !== 'string' || !body.content.trim()) {
    return NextResponse.json({ message: 'content is required' }, { status: 400 });
  }

  const token = await getToken();
  if (!token) {
    return NextResponse.json({ message: 'Unable to acquire session token' }, { status: 401 });
  }

  try {
    const result = await apiFetch<TranslateResponse>(`/translate/${userId}`, {
      method: 'POST',
      token,
      body: { content: body.content, session_type: body.session_type ?? 'exercise' },
    });
    return NextResponse.json(result);
  } catch (error) {
    if (isApiError(error)) {
      return NextResponse.json({ message: error.message, body: error.body }, { status: error.status });
    }

    return NextResponse.json({ message: 'Unable to translate this content right now.' }, { status: 502 });
  }
}
