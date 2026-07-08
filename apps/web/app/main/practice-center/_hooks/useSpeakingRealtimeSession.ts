'use client'

import { useUser } from '@clerk/nextjs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  buildSpeakingSessionWebSocketUrl,
  createSpeakingAudioTurnMessage,
  createSpeakingStartMessage,
  createSpeakingTextTurnMessage,
  speakingEndMessage,
  withSpeakingSessionTicket,
  type SpeakingGrammarFeedback,
  type SpeakingRealtimeClientMessage,
  type SpeakingRealtimeServerMessage,
  type SpeakingRealtimeStatus,
} from '../_types/speaking-realtime'
import type { SpeakingSessionTicketResponse } from '@/lib/api/types'

export type SpeakingRealtimeTranscriptMessage = {
  id: string
  speaker: 'ai' | 'user'
  content: string
  clientTurnId?: string
  displayContent?: string
  revealedCharCount?: number
  isSpeaking?: boolean
  language?: string | null
  timestamp: string
  pendingTranscript?: boolean
  grammarFeedback?: SpeakingGrammarFeedback
  mockFeedback?: string | null
  translatedMessage?: string | null
  translationZone?: string | null
}

type ActiveAssistantSpeech = {
  messageId: string
  content: string
  utterance: SpeechSynthesisUtterance
  wordEndIndices: number[]
  revealedCharCount: number
  fallbackWordIndex: number
  fallbackStartTimerId: number | null
  fallbackIntervalId: number | null
  completed: boolean
}

const ASSISTANT_SPEECH_LANG = 'en-US'
const ASSISTANT_SPEECH_RATE = 0.95
const FALLBACK_REVEAL_START_DELAY_MS = 900
const FALLBACK_BASE_WORDS_PER_MINUTE = 165

export type UseSpeakingRealtimeSessionResult = {
  sessionId: string | null
  status: SpeakingRealtimeStatus
  messages: SpeakingRealtimeTranscriptMessage[]
  error: string | null
  isRecording: boolean
  canSendTurn: boolean
  sendText: (text: string) => void
  startRecording: () => Promise<void>
  stopRecording: () => void
  endSession: () => void
}

function createMessageId(prefix: 'ai' | 'user') {
  return `${prefix}-${crypto.randomUUID()}`
}

function getDisplayTimestamp() {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date())
}

function getPreferredRecorderOptions() {
  if (typeof MediaRecorder === 'undefined') return undefined

  for (const mimeType of ['audio/webm;codecs=opus', 'audio/webm']) {
    if (MediaRecorder.isTypeSupported(mimeType)) return { mimeType }
  }

  return undefined
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.addEventListener('loadend', () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Could not read audio recording.'))
        return
      }

      const [, base64 = ''] = reader.result.split(',')
      resolve(base64)
    })

    reader.addEventListener('error', () => {
      reject(new Error('Could not read audio recording.'))
    })

    reader.readAsDataURL(blob)
  })
}

function isWhitespace(character: string) {
  return /\s/.test(character)
}

function getWordEndIndices(content: string) {
  return Array.from(content.matchAll(/\S+/g), (match) => (match.index ?? 0) + match[0].length)
}

function getFirstWordEndCharCount(content: string) {
  return getWordEndIndices(content)[0] ?? content.length
}

function getRevealCharCountForBoundary(content: string, charIndex: number) {
  let index = Math.max(0, Math.min(charIndex, content.length))

  while (index < content.length && isWhitespace(content[index] ?? '')) {
    index += 1
  }

  if (index >= content.length) return content.length

  let wordEnd = index

  while (wordEnd < content.length && !isWhitespace(content[wordEnd] ?? '')) {
    wordEnd += 1
  }

  return wordEnd
}

function getFallbackWordIntervalMs() {
  return Math.round(60_000 / (FALLBACK_BASE_WORDS_PER_MINUTE * ASSISTANT_SPEECH_RATE))
}

function parseServerMessage(data: unknown): SpeakingRealtimeServerMessage {
  if (typeof data !== 'string') {
    throw new Error('Speaking socket received an unsupported message format.')
  }

  return JSON.parse(data) as SpeakingRealtimeServerMessage
}

async function requestSpeakingSessionTicket(): Promise<SpeakingSessionTicketResponse> {
  const response = await fetch('/api/speaking/session-ticket', { method: 'POST' })

  if (!response.ok) {
    throw new Error('Could not start a speaking session right now.')
  }

  return (await response.json()) as SpeakingSessionTicketResponse
}

export function useSpeakingRealtimeSession(): UseSpeakingRealtimeSessionResult {
  const { isLoaded, user } = useUser()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [status, setStatus] = useState<SpeakingRealtimeStatus>('idle')
  const [messages, setMessages] = useState<SpeakingRealtimeTranscriptMessage[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pendingTurnMessageId, setPendingTurnMessageIdState] = useState<string | null>(null)

  const socketRef = useRef<WebSocket | null>(null)
  const startedRef = useRef(false)
  const closeRequestedRef = useRef(false)
  const pendingTurnMessageIdRef = useRef<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const cancelRecordingRef = useRef(false)
  const activeSpeechRef = useRef<ActiveAssistantSpeech | null>(null)

  const setPendingTurnMessageId = useCallback((messageId: string | null) => {
    pendingTurnMessageIdRef.current = messageId
    setPendingTurnMessageIdState(messageId)
  }, [])

  const stopMediaTracks = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
    mediaStreamRef.current = null
  }, [])

  const clearSpeechTimers = useCallback((activeSpeech: ActiveAssistantSpeech) => {
    if (activeSpeech.fallbackStartTimerId !== null) {
      window.clearTimeout(activeSpeech.fallbackStartTimerId)
      activeSpeech.fallbackStartTimerId = null
    }

    if (activeSpeech.fallbackIntervalId !== null) {
      window.clearInterval(activeSpeech.fallbackIntervalId)
      activeSpeech.fallbackIntervalId = null
    }
  }, [])

  const finishAssistantMessageReveal = useCallback((messageId: string) => {
    setMessages((currentMessages) =>
      currentMessages.map((currentMessage) => {
        if (currentMessage.id !== messageId) return currentMessage

        return {
          ...currentMessage,
          displayContent: currentMessage.content,
          revealedCharCount: currentMessage.content.length,
          isSpeaking: false,
        }
      }),
    )
  }, [])

  const revealAssistantMessage = useCallback((messageId: string, charCount: number) => {
    setMessages((currentMessages) =>
      currentMessages.map((currentMessage) => {
        if (currentMessage.id !== messageId) return currentMessage

        const boundedCharCount = Math.max(0, Math.min(charCount, currentMessage.content.length))
        const revealedCharCount = Math.max(currentMessage.revealedCharCount ?? 0, boundedCharCount)

        return {
          ...currentMessage,
          displayContent: currentMessage.content.slice(0, revealedCharCount),
          revealedCharCount,
          isSpeaking: true,
        }
      }),
    )
  }, [])

  const stopActiveSpeech = useCallback(
    (revealFullMessage = true) => {
      const activeSpeech = activeSpeechRef.current

      if (activeSpeech) {
        activeSpeech.completed = true
        clearSpeechTimers(activeSpeech)
        activeSpeechRef.current = null

        if (revealFullMessage) {
          finishAssistantMessageReveal(activeSpeech.messageId)
        }
      }

      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
    },
    [clearSpeechTimers, finishAssistantMessageReveal],
  )

  const startFallbackReveal = useCallback(
    (activeSpeech: ActiveAssistantSpeech) => {
      if (activeSpeechRef.current !== activeSpeech || activeSpeech.completed) return

      if (activeSpeech.fallbackStartTimerId !== null) {
        window.clearTimeout(activeSpeech.fallbackStartTimerId)
        activeSpeech.fallbackStartTimerId = null
      }

      if (activeSpeech.fallbackIntervalId !== null) return

      activeSpeech.fallbackWordIndex = activeSpeech.wordEndIndices.findIndex(
        (wordEndIndex) => wordEndIndex > activeSpeech.revealedCharCount,
      )

      if (activeSpeech.fallbackWordIndex < 0) return

      const revealNextFallbackWord = () => {
        if (activeSpeechRef.current !== activeSpeech || activeSpeech.completed) return

        const nextCharCount = activeSpeech.wordEndIndices[activeSpeech.fallbackWordIndex]

        if (typeof nextCharCount !== 'number') {
          if (activeSpeech.fallbackIntervalId !== null) {
            window.clearInterval(activeSpeech.fallbackIntervalId)
            activeSpeech.fallbackIntervalId = null
          }
          return
        }

        activeSpeech.fallbackWordIndex += 1
        activeSpeech.revealedCharCount = Math.max(activeSpeech.revealedCharCount, nextCharCount)
        revealAssistantMessage(activeSpeech.messageId, activeSpeech.revealedCharCount)
      }

      activeSpeech.fallbackIntervalId = window.setInterval(revealNextFallbackWord, getFallbackWordIntervalMs())
      revealNextFallbackWord()
    },
    [revealAssistantMessage],
  )

  const speakAssistantReply = useCallback(
    (messageId: string, reply: string) => {
      stopActiveSpeech()

      if (
        typeof window === 'undefined' ||
        !('speechSynthesis' in window) ||
        typeof SpeechSynthesisUtterance === 'undefined'
      ) {
        finishAssistantMessageReveal(messageId)
        return
      }

      const wordEndIndices = getWordEndIndices(reply)

      if (reply.length === 0 || wordEndIndices.length === 0) {
        finishAssistantMessageReveal(messageId)
        return
      }

      const utterance = new SpeechSynthesisUtterance(reply)
      utterance.lang = ASSISTANT_SPEECH_LANG
      utterance.rate = ASSISTANT_SPEECH_RATE

      const activeSpeech: ActiveAssistantSpeech = {
        messageId,
        content: reply,
        utterance,
        wordEndIndices,
        revealedCharCount: 0,
        fallbackWordIndex: 0,
        fallbackStartTimerId: null,
        fallbackIntervalId: null,
        completed: false,
      }

      const revealActiveSpeech = (charCount: number) => {
        if (activeSpeechRef.current !== activeSpeech || activeSpeech.completed) return

        activeSpeech.revealedCharCount = Math.max(
          activeSpeech.revealedCharCount,
          Math.min(charCount, activeSpeech.content.length),
        )
        revealAssistantMessage(activeSpeech.messageId, activeSpeech.revealedCharCount)
      }

      const finishActiveSpeech = () => {
        if (activeSpeechRef.current !== activeSpeech || activeSpeech.completed) return

        activeSpeech.completed = true
        clearSpeechTimers(activeSpeech)
        activeSpeechRef.current = null
        finishAssistantMessageReveal(activeSpeech.messageId)
      }

      utterance.onstart = () => {
        revealActiveSpeech(wordEndIndices[0] ?? getFirstWordEndCharCount(reply))
      }

      utterance.onboundary = (event) => {
        if (typeof event.charIndex !== 'number' || Number.isNaN(event.charIndex)) return

        const revealCharCount = getRevealCharCountForBoundary(reply, event.charIndex)
        revealActiveSpeech(revealCharCount)

        if ((!event.name || event.name === 'word') && event.charIndex > 0) {
          if (activeSpeech.fallbackStartTimerId !== null) {
            window.clearTimeout(activeSpeech.fallbackStartTimerId)
            activeSpeech.fallbackStartTimerId = null
          }

          if (activeSpeech.fallbackIntervalId !== null) {
            window.clearInterval(activeSpeech.fallbackIntervalId)
            activeSpeech.fallbackIntervalId = null
          }
        }
      }

      utterance.onend = finishActiveSpeech
      utterance.onerror = finishActiveSpeech

      activeSpeechRef.current = activeSpeech
      activeSpeech.fallbackStartTimerId = window.setTimeout(() => {
        startFallbackReveal(activeSpeech)
      }, FALLBACK_REVEAL_START_DELAY_MS)

      try {
        window.speechSynthesis.speak(utterance)
      } catch {
        finishActiveSpeech()
      }
    },
    [
      clearSpeechTimers,
      finishAssistantMessageReveal,
      revealAssistantMessage,
      startFallbackReveal,
      stopActiveSpeech,
    ],
  )

  const cancelSpeech = useCallback((revealFullMessage = true) => {
    stopActiveSpeech(revealFullMessage)
  }, [stopActiveSpeech])

  const sendSocketMessage = useCallback((message: SpeakingRealtimeClientMessage) => {
    const socket = socketRef.current

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setError('Speaking session is not connected.')
      setStatus('error')
      return false
    }

    socket.send(JSON.stringify(message))
    return true
  }, [])

  const appendAssistantMessage = useCallback(
    (content: string, clientTurnId?: string) => {
      const messageId = createMessageId('ai')

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: messageId,
          speaker: 'ai',
          content,
          clientTurnId,
          displayContent: '',
          revealedCharCount: 0,
          isSpeaking: true,
          timestamp: getDisplayTimestamp(),
        },
      ])
      speakAssistantReply(messageId, content)
    },
    [speakAssistantReply],
  )

  const updatePendingUserTurn = useCallback(
    (message: Extract<SpeakingRealtimeServerMessage, { type: 'turn_result' }>) => {
      const turnMessageId = message.client_turn_id || pendingTurnMessageIdRef.current
      if (!turnMessageId) return

      setMessages((currentMessages) =>
        currentMessages.map((currentMessage) => {
          if (currentMessage.id !== turnMessageId) return currentMessage

          return {
            ...currentMessage,
            content: message.transcript_text ?? currentMessage.content,
            pendingTranscript: false,
            mockFeedback: message.mock_feedback,
            language: message.language,
          }
        }),
      )
      if (pendingTurnMessageIdRef.current === turnMessageId) {
        setPendingTurnMessageId(null)
      }
    },
    [setPendingTurnMessageId],
  )

  const applyTurnFeedback = useCallback(
    (message: Extract<SpeakingRealtimeServerMessage, { type: 'turn_feedback' }>) => {
      setMessages((currentMessages) =>
        currentMessages.map((currentMessage) => {
          if (currentMessage.id === message.client_turn_id) {
            return {
              ...currentMessage,
              grammarFeedback: message.grammar_feedback,
              translationZone: message.translation_zone,
            }
          }

          if (currentMessage.clientTurnId !== message.client_turn_id) return currentMessage

          return {
            ...currentMessage,
            translatedMessage: message.translated_message,
            translationZone: message.translation_zone,
          }
        }),
      )
    },
    [],
  )

  const sendText = useCallback(
    (text: string) => {
      const trimmedText = text.trim()
      if (!trimmedText || pendingTurnMessageIdRef.current || status !== 'ready') return

      const messageId = createMessageId('user')
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: messageId,
          speaker: 'user',
          content: trimmedText,
          timestamp: getDisplayTimestamp(),
        },
      ])
      setPendingTurnMessageId(messageId)
      setStatus('sending')

      if (sendSocketMessage(createSpeakingTextTurnMessage(trimmedText, messageId))) {
        setStatus('receiving')
        return
      }

      setPendingTurnMessageId(null)
    },
    [sendSocketMessage, setPendingTurnMessageId, status],
  )

  const sendAudioTurn = useCallback(
    (audioBase64: string) => {
      if (!audioBase64 || pendingTurnMessageIdRef.current) return

      const messageId = createMessageId('user')
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: messageId,
          speaker: 'user',
          content: 'Processing audio...',
          timestamp: getDisplayTimestamp(),
          pendingTranscript: true,
        },
      ])
      setPendingTurnMessageId(messageId)
      setStatus('sending')

      if (sendSocketMessage(createSpeakingAudioTurnMessage(audioBase64, messageId))) {
        setStatus('receiving')
        return
      }

      setPendingTurnMessageId(null)
    },
    [sendSocketMessage, setPendingTurnMessageId],
  )

  const handleRecordingStop = useCallback(async () => {
    const wasCancelled = cancelRecordingRef.current
    cancelRecordingRef.current = false
    mediaRecorderRef.current = null
    stopMediaTracks()

    const audioChunks = audioChunksRef.current
    audioChunksRef.current = []

    if (wasCancelled) return

    if (audioChunks.length === 0) {
      setStatus('ready')
      return
    }

    try {
      const audioBlob = new Blob(audioChunks, { type: audioChunks[0]?.type || 'audio/webm' })
      const audioBase64 = await blobToBase64(audioBlob)
      sendAudioTurn(audioBase64)
    } catch (recordingError) {
      setError(recordingError instanceof Error ? recordingError.message : 'Could not process audio recording.')
      setStatus('error')
    }
  }, [sendAudioTurn, stopMediaTracks])

  const startRecording = useCallback(async () => {
    if (status !== 'ready' || pendingTurnMessageIdRef.current) return

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      setError('Audio recording is not supported in this browser.')
      setStatus('error')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorderOptions = getPreferredRecorderOptions()
      const recorder = recorderOptions ? new MediaRecorder(stream, recorderOptions) : new MediaRecorder(stream)

      audioChunksRef.current = []
      cancelRecordingRef.current = false
      mediaStreamRef.current = stream
      mediaRecorderRef.current = recorder

      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data)
      })

      recorder.addEventListener('stop', () => {
        void handleRecordingStop()
      })

      recorder.start()
      setError(null)
      setStatus('recording')
    } catch (recordingError) {
      stopMediaTracks()
      setError(recordingError instanceof Error ? recordingError.message : 'Could not start audio recording.')
      setStatus('error')
    }
  }, [handleRecordingStop, status, stopMediaTracks])

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') return

    setStatus('sending')
    recorder.stop()
  }, [])

  const abortRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current
    cancelRecordingRef.current = true
    audioChunksRef.current = []

    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    } else {
      mediaRecorderRef.current = null
      stopMediaTracks()
    }
  }, [stopMediaTracks])

  const endSession = useCallback(() => {
    closeRequestedRef.current = true
    setStatus('ending')
    abortRecording()
    cancelSpeech()

    const socket = socketRef.current
    if (!socket) {
      startedRef.current = false
      setStatus('ended')
      return
    }

    if (socket.readyState === WebSocket.OPEN && startedRef.current) {
      sendSocketMessage(speakingEndMessage)
      return
    }

    socket.close()
  }, [abortRecording, cancelSpeech, sendSocketMessage])

  useEffect(() => {
    if (!isLoaded) return

    if (!user?.id) {
      return
    }

    closeRequestedRef.current = false
    startedRef.current = false

    let cancelled = false
    let socket: WebSocket | null = null

    async function connect() {
      let ticket: SpeakingSessionTicketResponse

      try {
        ticket = await requestSpeakingSessionTicket()
      } catch (ticketError) {
        if (cancelled) return
        setError(ticketError instanceof Error ? ticketError.message : 'Could not start a speaking session.')
        setStatus('error')
        return
      }

      if (cancelled) return

      setSessionId(ticket.session_id)

      socket = new WebSocket(
        withSpeakingSessionTicket(buildSpeakingSessionWebSocketUrl(ticket.session_id), ticket.ticket),
      )
      socketRef.current = socket

      socket.addEventListener('open', () => {
        if (socketRef.current !== socket || !user?.id) return

        setError(null)
        sendSocketMessage(createSpeakingStartMessage(user.id))
      })

      socket.addEventListener('message', (event) => {
        if (socketRef.current !== socket) return

        let serverMessage: SpeakingRealtimeServerMessage

        try {
          serverMessage = parseServerMessage(event.data)
        } catch (parseError) {
          setError(parseError instanceof Error ? parseError.message : 'Could not read speaking response.')
          setStatus('error')
          return
        }

        if (serverMessage.type === 'session_started') {
          startedRef.current = true
          appendAssistantMessage(serverMessage.opening_message)
          setStatus('ready')
          return
        }

        if (serverMessage.type === 'turn_result') {
          updatePendingUserTurn(serverMessage)
          appendAssistantMessage(serverMessage.assistant_message, serverMessage.client_turn_id)
          if (!closeRequestedRef.current) setStatus('ready')
          return
        }

        if (serverMessage.type === 'turn_feedback') {
          applyTurnFeedback(serverMessage)
          return
        }

        if (serverMessage.type === 'session_ended') {
          startedRef.current = false
          closeRequestedRef.current = true
          setStatus('ended')
          return
        }

        setPendingTurnMessageId(null)
        setError(serverMessage.detail)
        setStatus('error')
      })

      socket.addEventListener('error', () => {
        if (socketRef.current !== socket) return

        setError('Speaking session connection failed.')
        setStatus('error')
      })

      socket.addEventListener('close', () => {
        if (socketRef.current !== socket) return

        socketRef.current = null
        stopMediaTracks()

        if (closeRequestedRef.current) {
          startedRef.current = false
          setStatus('ended')
          return
        }

        setError('Speaking session disconnected unexpectedly.')
        setStatus('error')
      })
    }

    void connect()

    return () => {
      cancelled = true
      cancelSpeech(false)
      abortRecording()

      if (!socket || socketRef.current !== socket) return

      closeRequestedRef.current = true

      if (socket.readyState === WebSocket.OPEN && startedRef.current) {
        socket.send(JSON.stringify(speakingEndMessage))
      }

      socket.close()
      socketRef.current = null
    }
  }, [
    abortRecording,
    appendAssistantMessage,
    applyTurnFeedback,
    cancelSpeech,
    isLoaded,
    sendSocketMessage,
    setPendingTurnMessageId,
    stopMediaTracks,
    updatePendingUserTurn,
    user?.id,
  ])

  const effectiveStatus: SpeakingRealtimeStatus =
    isLoaded && !user?.id ? 'error' : isLoaded && user?.id && status === 'idle' ? 'connecting' : status
  const effectiveError = isLoaded && !user?.id ? 'Sign in to start a speaking session.' : effectiveStatus === 'connecting' ? null : error
  const canSendTurn = useMemo(
    () => effectiveStatus === 'ready' && pendingTurnMessageId === null,
    [effectiveStatus, pendingTurnMessageId],
  )

  return {
    sessionId,
    status: effectiveStatus,
    messages,
    error: effectiveError,
    isRecording: effectiveStatus === 'recording',
    canSendTurn,
    sendText,
    startRecording,
    stopRecording,
    endSession,
  }
}
