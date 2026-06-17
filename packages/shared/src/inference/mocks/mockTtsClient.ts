import { TtsClient } from '../ttsClient';
import { SynthesizeSpeechInput, SynthesizeSpeechOutput } from '../types';

export class MockTtsClient implements TtsClient {
  async synthesizeSpeech(input: SynthesizeSpeechInput): Promise<SynthesizeSpeechOutput> {
    return { audio: new TextEncoder().encode(`(mock audio for: ${input.text})`), encoding: 'mock/pcm16' };
  }
}
