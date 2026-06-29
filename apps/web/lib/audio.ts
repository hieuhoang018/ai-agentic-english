export type AudioBucket = 'assessment-audio' | 'passage-audio' | 'exercise-audio';

export function resolveAudioUrl(bucket: AudioBucket, audioKey?: string | null) {
  const audioBaseUrl = process.env.NEXT_PUBLIC_AUDIO_BASE_URL?.trim();
  const normalizedAudioKey = audioKey
    ?.trim()
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');

  if (!audioBaseUrl || !normalizedAudioKey) {
    return null;
  }

  return `${audioBaseUrl.replace(/\/+$/, '')}/${bucket}/${normalizedAudioKey}`;
}
