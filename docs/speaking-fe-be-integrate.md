# Plan: Wire Practice Center Speaking To AGT-03

## Summary

Implement this in two phases:

1. **Ship usable speaking practice with minimal backend touch** by wiring the frontend directly to AGT-03’s existing WebSocket: `/ws/sessions/{session_id}`. Use per-turn JSON messages, optional `audio_base64` recording upload, and browser `SpeechSynthesis` for tutor voice.
2. **Add README-style auth handshake later** with a Gateway-protected session-ticket endpoint, while preserving the same frontend hook and UI contract.

Do **not** implement server-side TTS in this pass. The current AGT-03 code and README §10.7.3 support browser `SpeechSynthesis` for real-time tutor voice.

## Stage 1 — Frontend Realtime Contract

Add frontend-only realtime types and config.

- Add `.env.example` entry:
  - `NEXT_PUBLIC_SPEAKING_WS_BASE_URL=ws://localhost:8103`
- Create a speaking realtime type module in the web app with these exact message shapes:
  - Client → server:
    - `{ type: 'start'; clerk_user_id: string; skill_focus: 'SPEAKING' }`
    - `{ type: 'turn'; user_message?: string | null; audio_base64?: string | null }`
    - `{ type: 'end' }`
  - Server → client:
    - `session_started` with `opening_message`
    - `turn_result` with `assistant_message`, `transcript_text`, `grammar_feedback`, `mock_feedback`, `translation_zone`
    - `session_ended`
    - `error`
- Keep these types local to `apps/web` for now to avoid touching shared/backend packages.

Acceptance:
- Frontend code can construct a valid AGT-03 WebSocket URL and typed message payloads without backend changes.

## Stage 2 — Speaking Session Hook

Create a client hook for the full WebSocket lifecycle.

Implementation guide:

- Add `useSpeakingRealtimeSession` under the Practice Center frontend area.
- Use Clerk `useUser()` to get `user.id`; this becomes `clerk_user_id`.
- Generate `sessionId` with `crypto.randomUUID()`.
- Connect to:
  - `${NEXT_PUBLIC_SPEAKING_WS_BASE_URL}/ws/sessions/${sessionId}`
- On `open`, send:
  - `{ type: 'start', clerk_user_id: user.id, skill_focus: 'SPEAKING' }`
- Maintain state:
  - `idle | connecting | ready | recording | sending | receiving | ending | ended | error`
- Maintain transcript messages:
  - AI opening message from `session_started.opening_message`
  - User text turns
  - User audio turns replaced with `transcript_text` after ASR result
  - AI replies from `turn_result.assistant_message`
- Add `sendText(text)`:
  - ignore empty text
  - append user message optimistically
  - send `{ type: 'turn', user_message: text }`
- Add recording support:
  - Use `navigator.mediaDevices.getUserMedia({ audio: true })`
  - Use `MediaRecorder`
  - Prefer MIME types in order: `audio/webm;codecs=opus`, `audio/webm`, browser default
  - On stop, convert Blob to base64 without the data URL prefix
  - Send `{ type: 'turn', audio_base64 }`
- Add client TTS:
  - On each AI reply, call `window.speechSynthesis.speak(new SpeechSynthesisUtterance(reply))`
  - Use `lang='en-US'`, `rate=0.95`
  - Cancel any previous utterance before speaking a new one
  - If unsupported, silently fall back to text-only
- Cleanup:
  - On explicit end, send `{ type: 'end' }`
  - On component unmount, send `{ type: 'end' }` if socket is open and session started
  - If socket closes unexpectedly, mark session ended/error; AGT-03 already cleans up abrupt disconnects.

Acceptance:
- User can start a speaking session, send typed text, receive AGT-03 responses, and hear browser-spoken AI replies.
- User can record one utterance, send it as `audio_base64`, and see the returned transcript.

## Stage 3 — Replace Mock Speaking Chat UI

Wire the current Practice Center speaking page to the new hook.

Implementation guide:

- Keep the existing visual structure of `SpeakingChat`.
- Stop rendering `session.messages` from `speaking-content.ts` for the active chat.
- Keep static `topic`, goals, and vocabulary suggestions for now; backend does not yet expose scenario/topic selection.
- Update controls:
  - Send button calls `sendText(draft)`
  - Mic button toggles `startRecording()` / `stopRecording()`
  - Add a small explicit end-session control in the chat header or footer
  - Disable send/mic while `connecting`, `sending`, `receiving`, or `ending`
- Status labels:
  - `connecting`: “Đang kết nối…”
  - `ready`: “Sẵn sàng”
  - `recording`: “Đang ghi âm…”
  - `sending/receiving`: “Đang xử lý…”
  - `ended`: “Đã kết thúc”
  - `error`: show concise retryable error
- Display feedback:
  - If `mock_feedback` exists, show it under the related turn.
  - If `grammar_feedback.total_errors_detected > 0`, show a short note such as `Detected 2 issue(s)`; do not build a full correction UI in this wiring pass.
- Leave speaking history pages unchanged because no frontend-facing conversation-history endpoint exists yet.

Acceptance:
- `/main/practice-center/speaking` is live-backed instead of mock-backed.
- History/transcript pages still render existing mock data and are not broken.

## Stage 4 — Gateway Ticket Handshake Follow-Up

Add the README-style auth handshake with minimal backend changes.

Implementation guide:

- Add AGT-03 ticket issuing endpoint:
  - Public upstream path: `POST /speaking/session-ticket`
  - Request: `{ clerk_user_id: string; skill_focus?: 'SPEAKING' }`
  - Response: `{ ticket: string; session_id: string; ws_url: string; expires_in_seconds: 60 }`
- Store tickets in Redis:
  - Key: `speaking-ticket:{ticket}`
  - Value: `{ session_id, clerk_user_id, skill_focus }`
  - TTL: 60 seconds
  - Consume/delete ticket on successful WebSocket validation.
- Update AGT-03 WebSocket handler:
  - Accept optional `?ticket=...`
  - If ticket is valid, bind socket to ticket metadata.
  - If `REQUIRE_SPEAKING_TICKET=true`, reject missing/invalid tickets.
  - Keep no-ticket mode allowed by default in local dev to avoid breaking current tests and direct development.
- Add Kong route:
  - `/api/speaking/session-ticket`
  - JWT-protected
  - Upstream: `http://agt03-tutor:8103/speaking/session-ticket`
- Update frontend hook:
  - If ticket endpoint is available, call `api('/speaking/session-ticket', { method: 'POST', body: { clerk_user_id: user.id, skill_focus: 'SPEAKING' } })`
  - Connect to returned `ws_url`
  - Fallback to direct `NEXT_PUBLIC_SPEAKING_WS_BASE_URL` only when the ticket request is disabled or unavailable in local dev.

Acceptance:
- Frontend can use Gateway-authenticated ticket flow without changing the chat UI.
- Direct WebSocket remains available for local development unless `REQUIRE_SPEAKING_TICKET=true`.

## Stage 5 — Tests And Verification

Run these after each implementation stage.

- Frontend:
  - `npm run lint --workspace apps/web`
  - `npm run build --workspace apps/web`
  - Manual browser check:
    - Open speaking page
    - Verify session starts and opening AI message appears
    - Send text turn and receive AI response
    - Record audio turn and receive transcript
    - End session and confirm controls disable cleanly
- Backend, for Stage 4:
  - Run AGT-03 tests inside an environment with Python deps:
    - `python -m pytest agents/agt03_tutor/tests/test_websocket_handler.py agents/agt03_tutor/tests/test_pipeline.py`
  - Add tests for:
    - ticket issuance stores Redis key with TTL
    - valid ticket permits WebSocket start
    - invalid ticket rejected when `REQUIRE_SPEAKING_TICKET=true`
    - ticket is one-time-use
    - existing no-ticket tests still pass when requirement is false
- Integration smoke:
  - Start Docker stack
  - Load `/main/practice-center/speaking`
  - Complete one text turn and one audio turn
  - End session
  - Confirm AGT-03 logs show session start/end and AGT-06 consolidation is attempted.

## Assumptions And Defaults

- User chose the **two-phase path**: direct WebSocket first, Gateway ticket hardening later.
- Initial implementation touches **frontend only**, plus `.env.example`.
- Browser `SpeechSynthesis` is the tutor voice path for this plan; no server-side TTS service is added.
- Audio is sent per turn as base64 WebM, not streamed as binary frames, because AGT-03 currently accepts `audio_base64`.
- Speaking history remains mock-backed until a frontend-facing conversation archive endpoint is planned.
- Production should enable `REQUIRE_SPEAKING_TICKET=true` after Stage 4 lands.
