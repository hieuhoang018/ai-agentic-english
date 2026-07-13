import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { apiFetch, isApiError } from '@/lib/api/client';
import type { OfflineReview, OfflineSyncResult } from '@/lib/api/types';

type SyncRequestBody = {
  reviews?: OfflineReview[];
};

export async function POST(request: Request) {
  const { getToken, userId } = await auth();

  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  let body: SyncRequestBody;
  try {
    body = (await request.json()) as SyncRequestBody;
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  if (!Array.isArray(body.reviews)) {
    return NextResponse.json({ message: 'reviews array is required' }, { status: 400 });
  }

  const token = await getToken();
  if (!token) {
    return NextResponse.json({ message: 'Unable to acquire session token' }, { status: 401 });
  }

  try {
    const result = await apiFetch<OfflineSyncResult>(`/offline/${userId}/sync`, {
      method: 'POST',
      token,
      body: { reviews: body.reviews },
    });
    return NextResponse.json(result);
  } catch (error) {
    if (isApiError(error)) {
      return NextResponse.json({ message: error.message, body: error.body }, { status: error.status });
    }

    return NextResponse.json({ message: 'Unable to sync offline reviews right now.' }, { status: 502 });
  }
}
