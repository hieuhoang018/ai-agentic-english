'use client';

import { useCallback, useMemo, useState } from 'react';

import { isApiError } from './api/client';

export type AudioBucket = 'assessment-audio' | 'passage-audio';

type AudioUrlResponse = {
  url: string;
};

type CachedAudioUrl = {
  url: string;
  fetchedAt: number;
};

type PresignedAudioState =
  | { status: 'idle'; url: null; message?: undefined }
  | { status: 'loading'; url: null; message?: undefined }
  | { status: 'ready'; url: string; message?: undefined }
  | { status: 'error'; url: null; message: string };

type PresignedAudioRequestState = PresignedAudioState & {
  cacheKey: string | null;
};

const PRESIGNED_AUDIO_MAX_AGE_MS = 55 * 60 * 1000;
const audioUrlCache = new Map<string, CachedAudioUrl>();

function cacheKey(bucket: AudioBucket, key: string) {
  return `${bucket}:${key}`;
}

function getCachedAudioUrl(bucket: AudioBucket, key: string) {
  const cached = audioUrlCache.get(cacheKey(bucket, key));
  if (!cached) return null;

  if (Date.now() - cached.fetchedAt > PRESIGNED_AUDIO_MAX_AGE_MS) {
    audioUrlCache.delete(cacheKey(bucket, key));
    return null;
  }

  return cached.url;
}

function setCachedAudioUrl(bucket: AudioBucket, key: string, url: string) {
  audioUrlCache.set(cacheKey(bucket, key), { url, fetchedAt: Date.now() });
}

export function usePresignedAudioUrl(bucket?: AudioBucket | null, key?: string | null) {
  const normalizedKey = useMemo(() => key?.trim() || null, [key]);
  const currentCacheKey = bucket && normalizedKey ? cacheKey(bucket, normalizedKey) : null;
  const [requestState, setRequestState] = useState<PresignedAudioRequestState>({
    status: 'idle',
    url: null,
    cacheKey: null,
  });

  const cachedUrl = bucket && normalizedKey ? getCachedAudioUrl(bucket, normalizedKey) : null;
  const state: PresignedAudioState =
    requestState.cacheKey === currentCacheKey
      ? requestState
      : cachedUrl
        ? { status: 'ready', url: cachedUrl }
        : { status: 'idle', url: null };

  const load = useCallback(async () => {
    if (!bucket || !normalizedKey) {
      setRequestState({
        status: 'error',
        url: null,
        message: 'No audio is available for this listening item.',
        cacheKey: null,
      });
      return null;
    }

    const cachedUrl = getCachedAudioUrl(bucket, normalizedKey);
    if (cachedUrl) {
      setRequestState({ status: 'ready', url: cachedUrl, cacheKey: currentCacheKey });
      return cachedUrl;
    }

    setRequestState({ status: 'loading', url: null, cacheKey: currentCacheKey });

    try {
      const response = await fetch(
        `/api/audio/url?bucket=${encodeURIComponent(bucket)}&key=${encodeURIComponent(normalizedKey)}`,
        { cache: 'no-store' },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => undefined);
        throw {
          status: response.status,
          message:
            typeof body === 'object' &&
            body !== null &&
            'message' in body &&
            typeof body.message === 'string'
              ? body.message
              : response.statusText,
          body,
        };
      }

      const result = (await response.json()) as AudioUrlResponse;
      setCachedAudioUrl(bucket, normalizedKey, result.url);
      setRequestState({ status: 'ready', url: result.url, cacheKey: currentCacheKey });
      return result.url;
    } catch (error) {
      const message = isApiError(error)
        ? error.message
        : 'Unable to load audio right now. Please try again.';
      setRequestState({ status: 'error', url: null, message, cacheKey: currentCacheKey });
      return null;
    }
  }, [bucket, currentCacheKey, normalizedKey]);

  const markPlaybackFailed = useCallback(() => {
    if (bucket && normalizedKey) {
      audioUrlCache.delete(cacheKey(bucket, normalizedKey));
    }

    setRequestState({
      status: 'error',
      url: null,
      message: 'Audio is unavailable for this listening item.',
      cacheKey: currentCacheKey,
    });
  }, [bucket, currentCacheKey, normalizedKey]);

  return {
    ...state,
    hasAudio: Boolean(bucket && normalizedKey),
    load,
    markPlaybackFailed,
  };
}
