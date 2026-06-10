# Kong Gateway

Configuration for Kong, the single entry point for client-to-backend traffic (routing, token auth, observability).

Handles the auth handshake for the real-time speaking feature (issues a short-lived session ticket); the audio WebSocket itself connects directly to the AI Tutor service, bypassing the gateway.

See root `README.md` sections 7.3 and 10.5.
