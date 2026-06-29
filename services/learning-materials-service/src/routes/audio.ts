import { ValidationError, asyncHandler, requireAuth } from '@ai-agentic-english/shared';
import { Router } from 'express';
import { AUDIO_BUCKETS, AudioBucket, StorageClient } from '../lib/storageClient';

export function createAudioRouter(storage: StorageClient): Router {
  const router = Router();

  router.get(
    '/url',
    requireAuth,
    asyncHandler(async (req, res) => {
      const { bucket, key } = req.query;

      if (typeof bucket !== 'string' || !AUDIO_BUCKETS.includes(bucket as AudioBucket)) {
        throw new ValidationError(
          `bucket must be one of: ${AUDIO_BUCKETS.join(', ')}`,
        );
      }
      if (typeof key !== 'string' || !key) {
        throw new ValidationError('key is required');
      }

      const url = await storage.generatePresignedGetUrl(bucket as AudioBucket, key);
      res.json({ url });
    }),
  );

  return router;
}
