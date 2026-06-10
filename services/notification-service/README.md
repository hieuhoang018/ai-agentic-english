# Notification Service

Owns reminder timing and notification content/logic.

Responsibilities:
- Event-driven: consumes business events from the Event Bus (path ready, achievement reached, review due, etc.).
- Schedule-driven: runs its own scheduler for daily reminders and vocab/flashcard-of-the-day, reading reminder timing/content from Memory & Progress Service.
- Triggers Novu for multi-channel delivery (email/push/in-app).

Does not own: channel preferences/delivery (Novu), auth/login emails (Clerk).

See root `README.md` section 8.3.
