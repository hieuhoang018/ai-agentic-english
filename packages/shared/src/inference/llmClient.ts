import {
  AnalyzeSessionTranscriptInput,
  AnalyzeSessionTranscriptOutput,
  GenerateLearningPathInput,
  GenerateLearningPathOutput,
  GradeOpenResponseInput,
  GradeOpenResponseOutput,
  HighlightContentInput,
  HighlightContentOutput,
  TutorReplyInput,
  TutorReplyOutput,
} from './types';

/** The only inference client surface AI Tutor Service calls into the self-hosted LLM through. */
export interface LlmClient {
  generateLearningPath(input: GenerateLearningPathInput): Promise<GenerateLearningPathOutput>;
  gradeOpenResponse(input: GradeOpenResponseInput): Promise<GradeOpenResponseOutput>;
  generateHighlightContent(input: HighlightContentInput): Promise<HighlightContentOutput>;
  tutorReply(input: TutorReplyInput): Promise<TutorReplyOutput>;
  analyzeSessionTranscript(input: AnalyzeSessionTranscriptInput): Promise<AnalyzeSessionTranscriptOutput>;
}
