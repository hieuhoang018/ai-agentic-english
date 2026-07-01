import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { createLocalPresignedAudioUrl, validateAudioParams } from '../_lib';

export async function GET(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = new URL(request.url).searchParams;
  const bucket = searchParams.get('bucket');
  const key = searchParams.get('key');
  const validationError = validateAudioParams(bucket, key);
  if (validationError) return validationError;

  const audioBucket = bucket as string;
  const audioKey = key as string;
  let availabilityCheck: Response;

  try {
    availabilityCheck = await fetch(createLocalPresignedAudioUrl(audioBucket, audioKey), {
      headers: { Range: 'bytes=0-0' },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    return NextResponse.json({ message: 'Audio storage is not responding.' }, { status: 502 });
  }

  if (!availabilityCheck.ok) {
    return NextResponse.json(
      {
        message:
          availabilityCheck.status === 404
            ? 'Audio file is not available in local MinIO.'
            : 'Audio storage is not responding.',
      },
      { status: availabilityCheck.status === 404 ? 404 : 502 },
    );
  }

  return NextResponse.json({
    url: `/api/audio/stream?bucket=${encodeURIComponent(audioBucket)}&key=${encodeURIComponent(audioKey)}`,
  });
}
