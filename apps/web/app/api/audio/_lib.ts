import { createHash, createHmac } from 'node:crypto';
import { NextResponse } from 'next/server';

export const AUDIO_BUCKETS = new Set(['passage-audio', 'assessment-audio']);
const PRESIGNED_URL_EXPIRES_SECONDS = 60 * 60;

export function validateAudioParams(bucket: string | null, key: string | null) {
  if (!bucket || !key) {
    return NextResponse.json({ message: 'bucket and key are required' }, { status: 400 });
  }

  if (!AUDIO_BUCKETS.has(bucket)) {
    return NextResponse.json(
      { message: 'bucket must be one of: passage-audio, assessment-audio' },
      { status: 400 },
    );
  }

  return null;
}

function encodeRfc3986(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function encodeS3Path(value: string) {
  return value.split('/').map(encodeRfc3986).join('/');
}

function hmac(key: Buffer | string, value: string) {
  return createHmac('sha256', key).update(value, 'utf8').digest();
}

function hmacHex(key: Buffer | string, value: string) {
  return createHmac('sha256', key).update(value, 'utf8').digest('hex');
}

function getSigningKey(secretKey: string, dateStamp: string, region: string) {
  const dateKey = hmac(`AWS4${secretKey}`, dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, 's3');
  return hmac(serviceKey, 'aws4_request');
}

export function createLocalPresignedAudioUrl(bucket: string, key: string) {
  const endpoint = new URL(process.env.MINIO_SERVER_ENDPOINT ?? 'http://127.0.0.1:9000');
  const accessKey = process.env.MINIO_ACCESS_KEY ?? 'minioadmin';
  const secretKey = process.env.MINIO_SECRET_KEY ?? 'minioadmin';
  const region = process.env.MINIO_REGION ?? 'us-east-1';
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const host = endpoint.host;
  const canonicalUri = `${endpoint.pathname.replace(/\/$/, '')}/${encodeS3Path(bucket)}/${encodeS3Path(key)}`;
  const queryParams: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKey}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(PRESIGNED_URL_EXPIRES_SECONDS),
    'X-Amz-SignedHeaders': 'host',
  };
  const canonicalQueryString = Object.entries(queryParams)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([paramKey, paramValue]) => `${encodeRfc3986(paramKey)}=${encodeRfc3986(paramValue)}`)
    .join('&');
  const canonicalRequest = [
    'GET',
    canonicalUri,
    canonicalQueryString,
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    createHash('sha256').update(canonicalRequest, 'utf8').digest('hex'),
  ].join('\n');
  const signature = hmacHex(getSigningKey(secretKey, dateStamp, region), stringToSign);
  const url = new URL(endpoint);
  url.pathname = canonicalUri;
  url.search = `${canonicalQueryString}&X-Amz-Signature=${signature}`;

  return url.toString();
}
