import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { apiFetch, isApiError } from '@/lib/api/client';

type SubscribeBody = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
};

type UnsubscribeBody = {
  endpoint?: unknown;
};

async function getAuthOrResponse() {
  const { getToken, userId } = await auth();
  if (!userId) {
    return { response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }) } as const;
  }

  const token = await getToken();
  if (!token) {
    return {
      response: NextResponse.json({ message: 'Unable to acquire session token' }, { status: 401 }),
    } as const;
  }

  return { token } as const;
}

// Body is the browser's real PushSubscription.toJSON() shape.
export async function POST(request: Request) {
  const authResult = await getAuthOrResponse();
  if ('response' in authResult) return authResult.response;

  let body: SubscribeBody;
  try {
    body = (await request.json()) as SubscribeBody;
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body.endpoint !== 'string' || typeof body.keys?.p256dh !== 'string' || typeof body.keys?.auth !== 'string') {
    return NextResponse.json({ message: 'endpoint and keys.p256dh/keys.auth are required' }, { status: 400 });
  }

  try {
    await apiFetch<void>('/push-subscriptions', {
      method: 'POST',
      token: authResult.token,
      body: { endpoint: body.endpoint, keys: { p256dh: body.keys.p256dh, auth: body.keys.auth } },
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (isApiError(error)) {
      return NextResponse.json({ message: error.message, body: error.body }, { status: error.status });
    }

    return NextResponse.json({ message: 'Unable to save push subscription right now.' }, { status: 502 });
  }
}

export async function DELETE(request: Request) {
  const authResult = await getAuthOrResponse();
  if ('response' in authResult) return authResult.response;

  let body: UnsubscribeBody;
  try {
    body = (await request.json()) as UnsubscribeBody;
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body.endpoint !== 'string') {
    return NextResponse.json({ message: 'endpoint is required' }, { status: 400 });
  }

  try {
    await apiFetch<void>('/push-subscriptions', {
      method: 'DELETE',
      token: authResult.token,
      body: { endpoint: body.endpoint },
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (isApiError(error)) {
      return NextResponse.json({ message: error.message, body: error.body }, { status: error.status });
    }

    return NextResponse.json({ message: 'Unable to remove push subscription right now.' }, { status: 502 });
  }
}
