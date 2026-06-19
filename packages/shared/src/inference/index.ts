import { getEnv } from '../env';
import { LlmClient } from './llmClient';
import { MockLlmClient, MockSttClient, MockTtsClient } from './mocks';
import { SttClient } from './sttClient';
import { TtsClient } from './ttsClient';

export * from './llmClient';
export * from './mocks';
export * from './sttClient';
export * from './ttsClient';
export * from './types';

export type InferenceMode = 'mock' | 'live';

export function getInferenceMode(): InferenceMode {
  const mode = getEnv('INFERENCE_MODE', 'mock');
  if (mode !== 'mock' && mode !== 'live') {
    throw new Error(`INFERENCE_MODE must be "mock" or "live", got "${mode}"`);
  }
  return mode;
}

// "live" adapters are owned by a separate AI engineer and will be dropped in behind these
// same interfaces later — until then, INFERENCE_MODE=live fails loudly instead of silently
// falling back to mock.
export function createLlmClient(): LlmClient {
  if (getInferenceMode() === 'live') {
    throw new Error('Live LLM adapter not implemented yet — set INFERENCE_MODE=mock');
  }
  return new MockLlmClient();
}

export function createSttClient(): SttClient {
  if (getInferenceMode() === 'live') {
    throw new Error('Live STT adapter not implemented yet — set INFERENCE_MODE=mock');
  }
  return new MockSttClient();
}

export function createTtsClient(): TtsClient {
  if (getInferenceMode() === 'live') {
    throw new Error('Live TTS adapter not implemented yet — set INFERENCE_MODE=mock');
  }
  return new MockTtsClient();
}
