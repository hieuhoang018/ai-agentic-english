# AI Tutor Service

A lightweight orchestrator and the **only** service that calls the inference layer (self-hosted LLM, STT, TTS).

Owns:
- Conversations and messages.
- Session transcript store (per-session, real-time speaking).

Responsibilities:
- Orchestrates real-time speaking sessions (WebSocket, hybrid ingress - see root README 7.5 / 8.2.4).
- Orchestrates exercise grading/evaluation for open-ended items.
- Generates learning paths (reads catalog from Learning Materials Service, writes path back to it, initializes progress/schedule in Memory & Progress Service).
- Generates Review Center highlight content (interpretations/examples) on top of items selected by Memory & Progress Service.

See root `README.md` sections 7.2, 7.5, 8.2.1-8.2.4.
