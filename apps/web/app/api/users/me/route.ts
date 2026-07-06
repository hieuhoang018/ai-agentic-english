import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { apiFetch, isApiError } from '@/lib/api/client';
import type { UpdateUserSettingsDto, UserDto, UserSettingsDto } from '@/lib/api/types';

export async function GET() {
  const { getToken, userId } = await auth();

  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const token = await getToken();
  if (!token) {
    return NextResponse.json({ message: 'Unable to acquire session token' }, { status: 401 });
  }

  try {
    const user = await apiFetch<UserDto>('/users/me', { token });
    return NextResponse.json(user);
  } catch (error) {
    if (isApiError(error)) {
      return NextResponse.json({ message: error.message, body: error.body }, { status: error.status });
    }

    return NextResponse.json({ message: 'Unable to load your account right now.' }, { status: 502 });
  }
}

export async function PATCH(request: NextRequest) {
  const { getToken, userId } = await auth();

  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const token = await getToken();
  if (!token) {
    return NextResponse.json({ message: 'Unable to acquire session token' }, { status: 401 });
  }

  const update = (await request.json()) as UpdateUserSettingsDto;

  try {
    const settings = await apiFetch<UserSettingsDto>('/users/me/settings', {
      method: 'PATCH',
      body: update,
      token,
    });
    return NextResponse.json(settings);
  } catch (error) {
    if (isApiError(error)) {
      return NextResponse.json({ message: error.message, body: error.body }, { status: error.status });
    }

    return NextResponse.json({ message: 'Unable to save your settings right now.' }, { status: 502 });
  }
}
