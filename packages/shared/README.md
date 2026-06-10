# Shared

Cross-cutting code shared between services and the frontend: TypeScript types/DTOs, Event Bus event schemas, and ID conventions.

Services reference each other only by ID (no shared tables or ORM entities) - this package is for shared *contracts* (types/schemas), not shared data access.
