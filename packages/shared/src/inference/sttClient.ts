import { TranscribeAudioInput, TranscribeAudioOutput } from './types';

export interface SttClient {
  transcribeAudio(input: TranscribeAudioInput): Promise<TranscribeAudioOutput>;
}
