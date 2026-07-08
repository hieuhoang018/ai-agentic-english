export const DEFAULT_SPEAKING_WS_BASE_URL = 'ws://localhost:8103'

export type SpeakingSkillFocus = 'SPEAKING'

export type SpeakingRealtimeStatus =
  | 'idle'
  | 'connecting'
  | 'ready'
  | 'recording'
  | 'sending'
  | 'receiving'
  | 'ending'
  | 'ended'
  | 'error'

export type SpeakingStartClientMessage = {
  type: 'start'
  clerk_user_id: string
  skill_focus: SpeakingSkillFocus
}

export type SpeakingTurnClientMessage = {
  type: 'turn'
  client_turn_id: string
  user_message?: string | null
  audio_base64?: string | null
}

export type SpeakingEndClientMessage = {
  type: 'end'
}

export type SpeakingRealtimeClientMessage =
  | SpeakingStartClientMessage
  | SpeakingTurnClientMessage
  | SpeakingEndClientMessage

export type SpeakingGrammarFeedback = {
  total_errors_detected?: number
  [key: string]: unknown
} | null

export type SpeakingSessionStartedServerMessage = {
  type: 'session_started'
  opening_message: string
}

export type SpeakingTurnResultServerMessage = {
  type: 'turn_result'
  client_turn_id: string
  assistant_message: string
  transcript_text: string | null
  mock_feedback: string | null
  language: string
}

export type SpeakingTurnFeedbackServerMessage = {
  type: 'turn_feedback'
  client_turn_id: string
  grammar_feedback: SpeakingGrammarFeedback
  translated_message: string | null
  translation_zone: string | null
}

export type SpeakingSessionEndedServerMessage = {
  type: 'session_ended'
}

export type SpeakingErrorServerMessage = {
  type: 'error'
  detail: string
}

export type SpeakingRealtimeServerMessage =
  | SpeakingSessionStartedServerMessage
  | SpeakingTurnResultServerMessage
  | SpeakingTurnFeedbackServerMessage
  | SpeakingSessionEndedServerMessage
  | SpeakingErrorServerMessage

export function getSpeakingWsBaseUrl() {
  return (process.env.NEXT_PUBLIC_SPEAKING_WS_BASE_URL ?? DEFAULT_SPEAKING_WS_BASE_URL).replace(/\/+$/, '')
}

export function buildSpeakingSessionWebSocketUrl(sessionId: string, baseUrl = getSpeakingWsBaseUrl()) {
  return new URL(`/ws/sessions/${encodeURIComponent(sessionId)}`, baseUrl).toString()
}

export function withSpeakingSessionTicket(wsUrl: string, ticket: string) {
  const url = new URL(wsUrl)
  url.searchParams.set('ticket', ticket)
  return url.toString()
}

export function createSpeakingStartMessage(clerkUserId: string): SpeakingStartClientMessage {
  return {
    type: 'start',
    clerk_user_id: clerkUserId,
    skill_focus: 'SPEAKING',
  }
}

export function createSpeakingTextTurnMessage(userMessage: string, clientTurnId: string): SpeakingTurnClientMessage {
  return {
    type: 'turn',
    client_turn_id: clientTurnId,
    user_message: userMessage,
  }
}

export function createSpeakingAudioTurnMessage(audioBase64: string, clientTurnId: string): SpeakingTurnClientMessage {
  return {
    type: 'turn',
    client_turn_id: clientTurnId,
    audio_base64: audioBase64,
  }
}

export const speakingEndMessage: SpeakingEndClientMessage = {
  type: 'end',
}
