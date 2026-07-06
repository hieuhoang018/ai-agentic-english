import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { apiFetch, isApiError } from '@/lib/api/client';
import type { SpeakingSessionTicketResponse } from '@/lib/api/types';

export async function POST() {
  const { getToken, userId } = await auth();

  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const token = await getToken();
  if (!token) {
    return NextResponse.json({ message: 'Unable to acquire session token' }, { status: 401 });
  }

  try {
    const ticket = await apiFetch<SpeakingSessionTicketResponse>('/speaking/session-ticket', {
      method: 'POST',
      token,
      body: { skill_focus: 'SPEAKING' },
    });

    return NextResponse.json(ticket);
  } catch (error) {
    if (isApiError(error)) {
      return NextResponse.json({ message: error.message, body: error.body }, { status: error.status });
    }

    return NextResponse.json({ message: 'Unable to start a speaking session right now.' }, { status: 502 });
  }
}
