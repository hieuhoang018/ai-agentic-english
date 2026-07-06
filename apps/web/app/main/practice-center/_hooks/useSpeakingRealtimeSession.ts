'use client'

import { useUser } from '@clerk/nextjs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  buildSpeakingSessionWebSocketUrl,
  createSpeakingAudioTurnMessage,
  createSpeakingStartMessage,
  createSpeakingTextTurnMessage,
  speakingEndMessage,
  type SpeakingGrammarFeedback,
  type SpeakingRealtimeClientMessage,
  type SpeakingRealtimeServerMessage,
  type SpeakingRealtimeStatus,
} from '../_types/speaking-realtime'

export type SpeakingRealtimeTranscriptMessage = {
  id: string
  speaker: 'ai' | 'user'
  content: string
  timestamp: string
  pendingTranscript?: boolean
  grammarFeedback?: SpeakingGrammarFeedback
  mockFeedback?: string | null
  translationZone?: string | null
}

export type UseSpeakingRealtimeSessionResult = {
  sessionId: string
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

function createSessionId() {
  return crypto.randomUUID()
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

function parseServerMessage(data: unknown): SpeakingRealtimeServerMessage {
  if (typeof data !== 'string') {
    throw new Error('Speaking socket received an unsupported message format.')
  }

  return JSON.parse(data) as SpeakingRealtimeServerMessage
}

export function useSpeakingRealtimeSession(): UseSpeakingRealtimeSessionResult {
  const { isLoaded, user } = useUser()
  const [sessionId] = useState(createSessionId)
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

  const setPendingTurnMessageId = useCallback((messageId: string | null) => {
    pendingTurnMessageIdRef.current = messageId
    setPendingTurnMessageIdState(messageId)
  }, [])

  const stopMediaTracks = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
    mediaStreamRef.current = null
  }, [])

  const speakAssistantReply = useCallback((reply: string) => {
    if (
      typeof window === 'undefined' ||
      !('speechSynthesis' in window) ||
      typeof SpeechSynthesisUtterance === 'undefined'
    ) {
      return
    }

    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(reply)
    utterance.lang = 'en-US'
    utterance.rate = 0.95
    window.speechSynthesis.speak(utterance)
  }, [])

  const cancelSpeech = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
  }, [])

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
    (content: string) => {
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: createMessageId('ai'),
          speaker: 'ai',
          content,
          timestamp: getDisplayTimestamp(),
        },
      ])
      speakAssistantReply(content)
    },
    [speakAssistantReply],
  )

  const updatePendingUserTurn = useCallback(
    (message: Extract<SpeakingRealtimeServerMessage, { type: 'turn_result' }>) => {
      const pendingMessageId = pendingTurnMessageIdRef.current
      if (!pendingMessageId) return

      setMessages((currentMessages) =>
        currentMessages.map((currentMessage) => {
          if (currentMessage.id !== pendingMessageId) return currentMessage

          return {
            ...currentMessage,
            content: message.transcript_text ?? currentMessage.content,
            pendingTranscript: false,
            grammarFeedback: message.grammar_feedback,
            mockFeedback: message.mock_feedback,
            translationZone: message.translation_zone,
          }
        }),
      )
      setPendingTurnMessageId(null)
    },
    [setPendingTurnMessageId],
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

      if (sendSocketMessage(createSpeakingTextTurnMessage(trimmedText))) {
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

      if (sendSocketMessage(createSpeakingAudioTurnMessage(audioBase64))) {
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

    const socket = new WebSocket(buildSpeakingSessionWebSocketUrl(sessionId))
    socketRef.current = socket

    socket.addEventListener('open', () => {
      if (socketRef.current !== socket) return

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
        appendAssistantMessage(serverMessage.assistant_message)
        if (!closeRequestedRef.current) setStatus('ready')
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

    return () => {
      cancelSpeech()
      abortRecording()

      if (socketRef.current !== socket) return

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
    cancelSpeech,
    isLoaded,
    sendSocketMessage,
    sessionId,
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
