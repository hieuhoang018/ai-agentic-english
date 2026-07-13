# Staged Deployment Plan: Real Internet PWA Domain

## Summary

Deploy the system using the guidebook’s recommended **Vercel + Linux VM** path, with the PWA hosted on the root domain and backend traffic split across subdomains.

Chosen defaults:
- PWA domain: `https://yourdomain.com` on Vercel
- API domain: `https://api.yourdomain.com` routed to Kong on the backend VM
- Speaking WebSocket domain: `wss://speaking.yourdomain.com` routed to AGT-03 on the backend VM
- AI inference: live `Groq`/`OpenRouter`, no required public GPU/Ollama launch for v1
- Backend host: one Ubuntu 22.04/24.04 VM running the existing Docker Compose stack

## Stages

### Stage 1: Prepare Accounts, Domain, and Secrets

- Buy or select the production domain, then choose:
  - `yourdomain.com` for the PWA
  - `api.yourdomain.com` for Kong
  - `speaking.yourdomain.com` for the tutor WebSocket
- Create or verify accounts:
  - Vercel for `apps/web`
  - VM provider such as Oracle Cloud, Hetzner, DigitalOcean, AWS Lightsail, or GCP Compute Engine
  - Clerk production app
  - Groq API key
  - OpenRouter API key
  - Novu API key, if notifications are enabled
- Generate production internal secret:
  ```bash
  openssl rand -hex 32
  ```
- Record required values:
  ```env
  CLERK_ISSUER=https://your-clerk-app.clerk.accounts.dev
  CLERK_WEBHOOK_SECRET=...
  GROQ_API_KEY=...
  OPENROUTER_API_KEY=...
  INTERNAL_SECRET=...
  NOVU_API_KEY=...
  ```

### Stage 2: Provision Backend VM

- Create an Ubuntu 22.04/24.04 VM.
- Minimum beta sizing:
  - 4 vCPU / 16 GB RAM / 100 GB disk
- Preferred beta sizing:
  - 8 vCPU / 24-32 GB RAM / 200 GB disk
- Install required runtime:
  ```bash
  sudo apt update
  sudo apt install -y git curl ca-certificates
  ```
- Install Docker Engine and Docker Compose plugin using the official Docker Ubuntu instructions.
- Configure firewall/security group:
  ```text
  22   SSH, restricted to your IP if possible
  80   HTTP
  443  HTTPS
  ```
- Do not publicly allow service ports such as `4001`, `4002`, `4005`, `5433`, `5434`, `5437`, `5438`, `6379`, `8000`, `8100-8111`, `9000`, `9001`, `9092`, or `11434`.

### Stage 3: Configure Backend Repo on VM

- Clone the repo:
  ```bash
  git clone <repo-url>
  cd ai-agentic-english
  npm ci
  ```
- Create production env file:
  ```bash
  cp infra/.env.example infra/.env
  ```
- Fill `infra/.env` with production values:
  ```env
  CLERK_ISSUER=https://your-clerk-app.clerk.accounts.dev
  CLERK_WEBHOOK_SECRET=...
  GROQ_API_KEY=...
  OPENROUTER_API_KEY=...
  INTERNAL_SECRET=<openssl rand -hex 32 value>
  NOVU_API_KEY=...
  ```
- Render Kong config for real Clerk and real PWA origin:
  ```bash
  CLERK_ISSUER=https://your-clerk-app.clerk.accounts.dev \
  CORS_ORIGIN=https://yourdomain.com \
  npm run kong:render
  ```
- Confirm `gateway/kong/kong.generated.yml` exists before starting production compose.

### Stage 4: Start Backend Stack

- Start production backend:
  ```bash
  docker compose --env-file infra/.env \
    -f infra/docker-compose.yml \
    -f infra/docker-compose.prod.yml \
    up -d --build
  ```
- Confirm containers are running:
  ```bash
  docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml ps
  ```
- Check local backend health on the VM:
  ```bash
  curl http://localhost:8000/api/health/user-service
  curl http://localhost:8000/api/health/learning-materials-service
  curl http://localhost:8000/api/health/notification-service
  curl http://localhost:8100/health
  ```

### Stage 5: Run Migrations and Seed Data

- Run Prisma migrations:
  ```bash
  DATABASE_URL=postgresql://postgres:postgres@localhost:5433/user_service \
    npx prisma migrate deploy --schema services/user-service/prisma/schema.prisma

  DATABASE_URL=postgresql://postgres:postgres@localhost:5434/learning_materials_service \
    npx prisma migrate deploy --schema services/learning-materials-service/prisma/schema.prisma

  DATABASE_URL=postgresql://postgres:postgres@localhost:5437/notification_service \
    npx prisma migrate deploy --schema services/notification-service/prisma/schema.prisma
  ```
- Run agent LTM migrations:
  ```bash
  bash infra/scripts/run-agent-migrations.sh
  ```
- Seed learning materials:
  ```bash
  DATABASE_URL=postgresql://postgres:postgres@localhost:5434/learning_materials_service \
    npm run seed --workspace @ai-agentic-english/learning-materials-service

  DATABASE_URL=postgresql://postgres:postgres@localhost:5434/learning_materials_service \
    npm run seed:vocab --workspace @ai-agentic-english/learning-materials-service

  DATABASE_URL=postgresql://postgres:postgres@localhost:5434/learning_materials_service \
    npm run seed:grammar --workspace @ai-agentic-english/learning-materials-service

  DATABASE_URL=postgresql://postgres:postgres@localhost:5434/learning_materials_service \
    npm run seed:passages --workspace @ai-agentic-english/learning-materials-service

  DATABASE_URL=postgresql://postgres:postgres@localhost:5434/learning_materials_service \
    npm run seed:assessment --workspace @ai-agentic-english/learning-materials-service

  DATABASE_URL=postgresql://postgres:postgres@localhost:5434/learning_materials_service \
    npm run seed:generated --workspace @ai-agentic-english/learning-materials-service
  ```
- Populate MinIO audio using the guidebook/infra README ETL flow:
  ```bash
  pip3 install boto3
  python3 agents/tools/voa_passages_etl.py
  python3 agents/tools/librivox_etl.py
  python3 agents/tools/assessment_listening_etl.py
  ```

### Stage 6: Add HTTPS Reverse Proxy

- Install Caddy on the VM.
- Create a Caddyfile:
  ```caddyfile
  api.yourdomain.com {
    reverse_proxy localhost:8000
  }

  speaking.yourdomain.com {
    reverse_proxy localhost:8103
  }
  ```
- Reload Caddy:
  ```bash
  sudo systemctl reload caddy
  ```
- Caddy should automatically issue TLS certificates for both backend subdomains.
- Verify public backend:
  ```bash
  curl https://api.yourdomain.com/api/health/user-service
  curl https://api.yourdomain.com/api/health/learning-materials-service
  curl https://api.yourdomain.com/api/health/notification-service
  ```

### Stage 7: Configure DNS

- Point root PWA domain to Vercel:
  ```text
  yourdomain.com -> Vercel DNS target
  ```
- Point backend subdomains to the VM public IP:
  ```text
  api.yourdomain.com      A -> <VM_PUBLIC_IP>
  speaking.yourdomain.com A -> <VM_PUBLIC_IP>
  ```
- Do not expose `minio.yourdomain.com` for v1 unless object access is intentionally made public or separately protected.
- Wait for DNS propagation, then verify:
  ```bash
  nslookup yourdomain.com
  nslookup api.yourdomain.com
  nslookup speaking.yourdomain.com
  ```

### Stage 8: Deploy PWA to Vercel

- Create a Vercel project from the repo.
- Set root directory:
  ```text
  apps/web
  ```
- Build command:
  ```text
  npm run build
  ```
- Configure Vercel environment variables:
  ```env
  NEXT_PUBLIC_API_BASE_URL=https://api.yourdomain.com/api
  API_BASE_URL=https://api.yourdomain.com/api
  NEXT_PUBLIC_SPEAKING_WS_BASE_URL=wss://speaking.yourdomain.com

  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
  CLERK_SECRET_KEY=...

  NEXT_PUBLIC_CLERK_SIGN_IN_URL=/auth/sign-in
  NEXT_PUBLIC_CLERK_SIGN_UP_URL=/auth/sign-up
  NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL=/main/homepage
  NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL=/main/homepage

  NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER=...
  NOVU_API_KEY=...
  ```
- Attach the production domain:
  ```text
  yourdomain.com
  ```
- Trigger a Vercel production deployment.

### Stage 9: Configure Clerk and Webhooks

- In Clerk production dashboard, configure allowed origins and redirects:
  ```text
  https://yourdomain.com
  https://api.yourdomain.com
  ```
- Configure sign-in/sign-up redirects to:
  ```text
  https://yourdomain.com/main/homepage
  ```
- Add Clerk webhook endpoint:
  ```text
  https://api.yourdomain.com/api/webhooks/clerk
  ```
- Copy the production webhook secret into `infra/.env` as `CLERK_WEBHOOK_SECRET`.
- Re-render Kong and restart if Clerk issuer or CORS changed:
  ```bash
  CLERK_ISSUER=https://your-clerk-app.clerk.accounts.dev \
  CORS_ORIGIN=https://yourdomain.com \
  npm run kong:render

  docker compose --env-file infra/.env \
    -f infra/docker-compose.yml \
    -f infra/docker-compose.prod.yml \
    up -d --build
  ```

### Stage 10: End-to-End Validation

- Public health checks:
  ```bash
  curl https://api.yourdomain.com/api/health/user-service
  curl https://api.yourdomain.com/api/health/learning-materials-service
  curl https://api.yourdomain.com/api/health/notification-service
  ```
- Browser checks:
  - Open `https://yourdomain.com`
  - Sign up/sign in with Clerk
  - Confirm redirect to `/main/homepage`
  - Open practice center and review center
  - Start a speaking session and confirm `wss://speaking.yourdomain.com` connects
  - Play listening audio and confirm presigned MinIO audio URLs resolve
- PWA checks:
  - Chrome DevTools → Application → Manifest has no errors
  - Service worker is registered
  - Install prompt appears on supported browsers
  - Installed app opens standalone
  - Offline fallback page works
- Logs:
  ```bash
  docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml logs --tail=100 kong
  docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml logs --tail=100 agt03-tutor
  docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml logs --tail=100 learning-materials-service
  ```

### Stage 11: Hardening and Operations

- Keep the cloud firewall restricted to `22`, `80`, and `443`.
- Treat Docker-published internal ports as VM-local only because the firewall blocks public access.
- Add a follow-up production override to bind direct service ports to `127.0.0.1` for defense in depth.
- Add VM backups or disk snapshots before real users join.
- Back up Docker volumes:
  - Postgres service DBs
  - Agent LTM Postgres
  - MinIO data
  - Ollama models, if local fallback is used later
- Add basic monitoring:
  - VM CPU/RAM/disk alerts
  - Docker container restart alerts
  - Caddy access/error logs
  - Kong logs
- Re-run `npm run kong:render` on every deploy or Clerk key rotation.

## Public Interfaces and Configuration Changes

- PWA public origin becomes:
  ```text
  https://yourdomain.com
  ```
- API base URL becomes:
  ```text
  https://api.yourdomain.com/api
  ```
- Speaking WebSocket base URL becomes:
  ```text
  wss://speaking.yourdomain.com
  ```
- Kong production config must be generated from real Clerk JWKS with:
  ```bash
  CLERK_ISSUER=...
  CORS_ORIGIN=https://yourdomain.com
  ```
- Vercel must use production `NEXT_PUBLIC_API_BASE_URL`, `API_BASE_URL`, and `NEXT_PUBLIC_SPEAKING_WS_BASE_URL`; no deployed frontend env var should point to `localhost`.

## Test Plan

- Build tests before deploy:
  ```bash
  npm run build
  npm run lint
  ```
- Backend smoke tests:
  - Kong health routes return `200`
  - Orchestrator health returns `200`
  - Clerk-protected routes reject missing JWT
  - Clerk-authenticated frontend requests succeed
- Data tests:
  - Learning-materials seed data is non-empty
  - Audio rows with `audioKey` resolve to actual MinIO objects
  - Agent LTM migrations created `vector` extension and agent tables
- PWA tests:
  - Manifest, service worker, install prompt, standalone launch
  - Offline fallback
  - HTTPS padlock on root domain
- Real workflow tests:
  - Sign up
  - Onboarding
  - Generated plan
  - Reading/listening exercise
  - Speaking session ticket + WebSocket connection
  - Review center loads

## Assumptions

- The first real deployment uses the guidebook path: Vercel frontend plus one backend VM.
- The production PWA uses the root domain, not `app.yourdomain.com`.
- `api.yourdomain.com` and `speaking.yourdomain.com` point to the backend VM.
- Live AI uses Groq/OpenRouter; local Ollama is not required for launch success.
- Caddy is the default reverse proxy because it handles HTTPS certificates automatically.
- MinIO remains self-hosted inside Docker for v1; Cloud Storage/S3 migration is a later improvement.
- The current compose stack remains the source of truth for backend deployment; no Kubernetes or Cloud Run migration is part of this plan.
