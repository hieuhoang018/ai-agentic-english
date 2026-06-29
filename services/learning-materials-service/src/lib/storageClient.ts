import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getEnv } from '@ai-agentic-english/shared';

export const AUDIO_BUCKETS = ['passage-audio', 'assessment-audio'] as const;
export type AudioBucket = (typeof AUDIO_BUCKETS)[number];

export function createStorageClient() {
  const accessKeyId = getEnv('MINIO_ACCESS_KEY', 'minioadmin');
  const secretAccessKey = getEnv('MINIO_SECRET_KEY', 'minioadmin');

  // MINIO_PUBLIC_ENDPOINT is the URL embedded in presigned URLs — must be reachable
  // by browsers/clients (e.g. http://localhost:9000 in dev). Falls back to MINIO_ENDPOINT
  // so local dev without docker works with a single env var.
  const publicEndpoint =
    process.env.MINIO_PUBLIC_ENDPOINT ?? getEnv('MINIO_ENDPOINT', 'http://localhost:9000');

  const s3 = new S3Client({
    endpoint: publicEndpoint,
    region: 'us-east-1',
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });

  return {
    async generatePresignedGetUrl(bucket: AudioBucket, key: string, expiresIn = 3600) {
      const command = new GetObjectCommand({ Bucket: bucket, Key: key });
      return getSignedUrl(s3, command, { expiresIn });
    },
  };
}

export type StorageClient = ReturnType<typeof createStorageClient>;
