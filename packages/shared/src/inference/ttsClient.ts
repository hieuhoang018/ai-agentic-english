import { SynthesizeSpeechInput, SynthesizeSpeechOutput } from './types';

export interface TtsClient {
  synthesizeSpeech(input: SynthesizeSpeechInput): Promise<SynthesizeSpeechOutput>;
}
