# Memory & Progress Service

Owns all dynamic learner state:
- Learner model (current level, timeBudget, learning goals, weak areas).
- Progress and FSRS review schedule.
- Mistakes and Review Center highlights (highlights are derived/lazy, no separate store).
- Exercise attempts and feedback records.

Responsibilities:
- Determines the next exercise/review item.
- Applies deterministic learner-model updates (mastery, FSRS, mistake aggregation) after each attempt and after speaking sessions.
- Selects items for Review Center highlights (deterministic selection; AI Tutor generates the explanatory content).
- Serves the offline data package (flashcards due + FSRS state + latest highlight snapshot) and consumes offline sync results.
- Provides reminder timing/content to the Notification Service.

See root `README.md` sections 7.2, 8.2.1-8.2.5, 8.3.
