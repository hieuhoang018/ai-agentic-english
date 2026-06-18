import { HighlightContentInput, HighlightContentOutput, LlmClient, ValidationError, asyncHandler } from '@ai-agentic-english/shared';
import { createHash } from 'crypto';
import { Router } from 'express';
import { CacheClient } from '../lib/redisCache';

const CACHE_TTL_SECONDS = 24 * 60 * 60;

function cacheKey(userId: string, input: HighlightContentInput): string {
  const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  return `highlight-content:${userId}:${hash}`;
}

export function createHighlightsRouter(llmClient: LlmClient, cache: CacheClient): Router {
  const router = Router();

  router.post(
    '/highlights/generate-content',
    asyncHandler(async (req, res) => {
      const { userId, ...input } = req.body as { userId?: string } & HighlightContentInput;

      if (!userId || typeof userId !== 'string') {
        throw new ValidationError('userId is required');
      }

      const key = cacheKey(userId, input);
      const cached = await cache.get(key);
      if (cached) {
        res.json(JSON.parse(cached) as HighlightContentOutput);
        return;
      }

      const content = await llmClient.generateHighlightContent(input);
      await cache.set(key, JSON.stringify(content), CACHE_TTL_SECONDS);
      res.json(content);
    }),
  );

  return router;
}
