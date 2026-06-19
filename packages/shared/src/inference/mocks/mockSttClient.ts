import { SttClient } from '../sttClient';
import { TranscribeAudioInput, TranscribeAudioOutput } from '../types';

export class MockSttClient implements SttClient {
  async transcribeAudio(_input: TranscribeAudioInput): Promise<TranscribeAudioOutput> {
    return { transcript: '(mock transcript)' };
  }
}
