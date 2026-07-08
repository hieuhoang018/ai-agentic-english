import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { apiFetch, isApiError } from '@/lib/api/client';
import type { ReviewCenterConversation } from '@/lib/api/types';

type UpdateTitleRequest = {
  title?: string;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ convId: string }> }) {
  const { getToken, userId } = await auth();

  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { convId } = await params;

  let body: UpdateTitleRequest;
  try {
    body = (await request.json()) as UpdateTitleRequest;
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body.title !== 'string' || body.title.trim() === '') {
    return NextResponse.json({ message: 'title is required' }, { status: 400 });
  }

  const token = await getToken();
  if (!token) {
    return NextResponse.json({ message: 'Unable to acquire session token' }, { status: 401 });
  }

  try {
    const conversation = await apiFetch<ReviewCenterConversation>(
      `/review-center/${userId}/conversations/${convId}/title`,
      { method: 'PATCH', token, body: { title: body.title } },
    );
    return NextResponse.json(conversation);
  } catch (error) {
    if (isApiError(error)) {
      return NextResponse.json({ message: error.message, body: error.body }, { status: error.status });
    }

    return NextResponse.json({ message: 'Unable to rename this conversation right now.' }, { status: 502 });
  }
}
