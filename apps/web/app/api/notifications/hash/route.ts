import { createHmac } from 'node:crypto';

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const secretKey = process.env.NOVU_API_KEY;
  if (!secretKey) {
    return NextResponse.json({ message: 'Novu is not configured' }, { status: 502 });
  }

  const subscriberHash = createHmac('sha256', secretKey).update(userId).digest('hex');

  return NextResponse.json({ subscriberId: userId, subscriberHash });
}
