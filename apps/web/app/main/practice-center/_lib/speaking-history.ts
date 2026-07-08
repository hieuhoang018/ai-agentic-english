import type { ReviewCenterBundle, ReviewCenterConversation, ReviewCenterSession } from '@/lib/api/types'
import type { ConversationDetail, ConversationSummary, SpeakingMessage } from '../_types/speaking-history'

function parseTranscript(raw: unknown): SpeakingMessage[] {
  // conversation_archive.transcript is a jsonb column; asyncpg returns jsonb as a raw
  // JSON string (no codec registered), so it arrives over HTTP double-encoded as a string.
  let transcript = raw
  if (typeof transcript === 'string') {
    try {
      transcript = JSON.parse(transcript)
    } catch {
      return []
    }
  }
  if (!Array.isArray(transcript)) return []
  const messages: SpeakingMessage[] = []
  transcript.forEach((turn, index) => {
    if (typeof turn !== 'object' || turn === null) return
    const { role, content } = turn as Record<string, unknown>
    if (role !== 'user' && role !== 'assistant') return
    if (typeof content !== 'string' || content.trim() === '') return
    messages.push({ id: `${index}`, speaker: role === 'assistant' ? 'ai' : 'user', content })
  })
  return messages
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

function durationMinutes(start: string, end: string | null) {
  if (!end) return 0
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000))
}

function buildPreview(messages: SpeakingMessage[]) {
  const first = messages.find((message) => message.speaker === 'ai') ?? messages[0]
  if (!first) return 'Không có nội dung hội thoại.'
  return first.content.length > 90 ? `${first.content.slice(0, 90)}…` : first.content
}

type SpeakingSession = ReviewCenterSession & { conversation: ReviewCenterConversation }

function joinSpeakingSessions(bundle: ReviewCenterBundle): SpeakingSession[] {
  const conversationsBySession = new Map(bundle.conversations.map((conversation) => [conversation.session_id, conversation]))
  return bundle.sessions
    .filter((session) => session.skill_focus === 'SPEAKING' && session.end_time)
    .map((session) => {
      const conversation = conversationsBySession.get(session.session_id)
      return conversation ? { ...session, conversation } : null
    })
    .filter((session): session is SpeakingSession => session !== null)
    .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
}

export function buildConversationSummaries(bundle: ReviewCenterBundle): ConversationSummary[] {
  return joinSpeakingSessions(bundle).map((session) => {
    const messages = parseTranscript(session.conversation.transcript)
    const errorCount = bundle.errors.filter((error) => error.session_id === session.session_id).length
    return {
      id: session.conversation.conv_id,
      sessionId: session.session_id,
      date: formatDate(session.start_time),
      time: formatTime(session.start_time),
      durationMinutes: durationMinutes(session.start_time, session.end_time),
      title: session.conversation.title,
      preview: buildPreview(messages),
      errorCount,
    }
  })
}

export function buildConversationDetail(bundle: ReviewCenterBundle, conversationId: string): ConversationDetail | null {
  const session = joinSpeakingSessions(bundle).find((candidate) => candidate.conversation.conv_id === conversationId)
  if (!session) return null

  const messages = parseTranscript(session.conversation.transcript)
  const errors = bundle.errors
    .filter((error) => error.session_id === session.session_id)
    .map((error) => ({
      id: error.event_id,
      errorType: error.error_type,
      severity: error.severity,
      contextExcerpt: error.context_excerpt,
    }))

  return {
    id: session.conversation.conv_id,
    sessionId: session.session_id,
    date: formatDate(session.start_time),
    time: formatTime(session.start_time),
    durationMinutes: durationMinutes(session.start_time, session.end_time),
    title: session.conversation.title,
    preview: buildPreview(messages),
    errorCount: errors.length,
    messages,
    errors,
  }
}
