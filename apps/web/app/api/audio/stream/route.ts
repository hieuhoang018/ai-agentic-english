import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { createLocalPresignedAudioUrl, validateAudioParams } from '../_lib';

const forwardedHeaders = [
  'accept-ranges',
  'cache-control',
  'content-length',
  'content-range',
  'content-type',
] as const;

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
  const range = request.headers.get('range');
  const upstream = await fetch(createLocalPresignedAudioUrl(audioBucket, audioKey), {
    headers: range ? { Range: range } : undefined,
    cache: 'no-store',
  });
  const headers = new Headers();

  for (const header of forwardedHeaders) {
    const value = upstream.headers.get(header);
    if (value) headers.set(header, value);
  }

  if (!headers.has('content-type')) {
    headers.set('content-type', 'audio/mpeg');
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}
