# Web (PWA)

Next.js + React + TypeScript frontend, packaged as a Progressive Web App (Service Worker, IndexedDB for offline flashcards/highlights).

All requests to backend services go through the API Gateway (Kong), except the real-time speaking WebSocket, which connects directly to the AI Tutor service after a Gateway-issued session ticket.

See `README.md` (root) sections 7-8 for the full architecture and data flows.
