import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { apiFetch, isApiError } from '@/lib/api/client';
import type { RateReviewResponse } from '@/lib/api/types';

type RateReviewRequest = {
  item_id?: string;
  quality?: number;
};

export async function POST(request: Request) {
  const { getToken, userId } = await auth();

  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  let body: RateReviewRequest;
  try {
    body = (await request.json()) as RateReviewRequest;
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body.item_id !== 'string' || typeof body.quality !== 'number') {
    return NextResponse.json({ message: 'item_id and quality are required' }, { status: 400 });
  }

  const token = await getToken();
  if (!token) {
    return NextResponse.json({ message: 'Unable to acquire session token' }, { status: 401 });
  }

  try {
    const result = await apiFetch<RateReviewResponse>(`/schedule/${userId}/rate`, {
      method: 'POST',
      token,
      body: { item_id: body.item_id, quality: body.quality },
    });
    return NextResponse.json(result);
  } catch (error) {
    if (isApiError(error)) {
      return NextResponse.json({ message: error.message, body: error.body }, { status: error.status });
    }

    return NextResponse.json({ message: 'Unable to submit review rating.' }, { status: 502 });
  }
}
