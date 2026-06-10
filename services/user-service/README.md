# User Service

Owns:
- Mirrored user accounts, synced from Clerk via webhook (`clerkUserId`, email, name) - identity itself lives in Clerk; no passwords stored here.
- App settings not related to learning (e.g. daily time budget, personal preferences).

Does not own: identity/auth (Clerk), learner model / progress (Memory & Progress Service).

See root `README.md` sections 7.2 and 8.1./b