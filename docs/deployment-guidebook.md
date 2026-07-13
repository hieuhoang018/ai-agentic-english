# Staged Deployment Plan: Real Internet PWA Domain

## Summary

Deploy the system using the guidebook's recommended **Vercel + Linux VM** path, with the PWA hosted on the root domain and backend traffic split across subdomains.

**Default path is $0 recurring cost.** The backend VM is provisioned on **Oracle Cloud's "Always
Free" tier** (not a trial — free forever within its limits), and the domain is a **free DuckDNS
subdomain** instead of a purchased one. Every other piece (Vercel, Clerk, Groq, OpenRouter, Novu)
already runs on a free tier in this project. Paid alternatives (Hetzner, DigitalOcean, AWS
Lightsail, GCP, a real purchased domain) still work with this same guide — swap them in at Stage 1
— but they cost money; Oracle + DuckDNS do not.

Chosen defaults:
- PWA domain: `https://yourdomain.com` on Vercel (Vercel's own free `*.vercel.app` domain also
  works with zero DNS setup if you don't want to deal with DuckDNS on the frontend side too)
- API domain: `https://api-yourapp.duckdns.org` routed to Kong on the backend VM
- Speaking WebSocket domain: `wss://speaking-yourapp.duckdns.org` routed to AGT-03 on the backend VM
- AI inference: live `Groq`/`OpenRouter` (both have free API tiers), no required public GPU/Ollama
  launch for v1
- Backend host: one Oracle Cloud **Always Free Ampere A1** VM (Ubuntu 22.04/24.04, 4 OCPU / 24GB
  RAM / 200GB boot volume — free forever, no credit-card charge as long as you stay within the
  Always Free shape) running the existing Docker Compose stack

## Stages

### Stage 1: Prepare Accounts, Domain, and Secrets

- **No-cost path (default)**: skip buying a domain. Create a free account at
  [duckdns.org](https://www.duckdns.org) (sign in with GitHub/Google, no card required) and
  register two free subdomains:
  - `api-yourapp.duckdns.org` for Kong
  - `speaking-yourapp.duckdns.org` for the tutor WebSocket
  - The PWA itself can stay on Vercel's free `yourapp.vercel.app` domain, or you can attach a
    third DuckDNS name (e.g. `yourapp.duckdns.org`) to the Vercel project if you want a
    consistent naming scheme — either is $0.
  - DuckDNS domains don't have DNS-level subdomain nesting the way a real registrar does — each
    one (`api-yourapp`, `speaking-yourapp`) is registered as its own independent top-level entry
    in the DuckDNS dashboard, not as a child of a single root domain.
  - **Paid alternative**: buy or select a real production domain and use
    `yourdomain.com`/`api.yourdomain.com`/`speaking.yourdomain.com` as below. Only do this if $0
    hosting isn't a hard requirement — everything else in this guide works identically either way.
- Create or verify accounts:
  - Vercel for `apps/web` (free tier)
  - **Oracle Cloud** account for the backend VM (free tier — see Stage 2; note Oracle requires a
    credit card on file for identity verification even though the Always Free shape itself is
    never charged, and Always Free A1 capacity can be temporarily unavailable in some regions —
    if instance creation fails with an "Out of capacity" error, retry later or try a different
    Oracle region on the same account)
  - DuckDNS account (free, no card)
  - Clerk production app (free tier)
  - Groq API key (free tier)
  - OpenRouter API key (free tier)
  - Novu API key, if notifications are enabled (free tier)
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

**No-cost path (default): Oracle Cloud "Always Free" Ampere A1**

- In the Oracle Cloud console, create a Compute instance:
  - Image: Ubuntu 22.04 or 24.04 (Canonical official image)
  - Shape: `VM.Standard.A1.Flex` (Ampere ARM) — set to the Always Free maximum, **4 OCPU / 24 GB
    RAM**, since the free allowance is a pooled 4 OCPU/24GB total across all your A1 instances in
    that account/region (one large instance is simpler than splitting it).
  - Boot volume: up to 200 GB also falls under the Always Free block storage allowance.
  - This meets and exceeds the guidebook's minimum sizing (4 vCPU / 16 GB RAM / 100 GB disk) at
    $0/month, so there is no separate "minimum vs. preferred" tier to choose between here — the
    free shape's max is the preferred sizing.
  - Note the instance's public IP once it's running; DuckDNS points at this IP (Stage 7).
- Install required runtime:
  ```bash
  sudo apt update
  sudo apt install -y git curl ca-certificates
  ```
- Install Docker Engine and Docker Compose plugin using the official Docker Ubuntu instructions
  (the ARM64 build of Docker works fine on A1's Ampere CPU — no image changes needed since every
  service here is already built from multi-arch or ARM-compatible base images).
- Configure the **cloud-side firewall** (Oracle Cloud console → the instance's VCN → Security
  List or Network Security Group → Ingress Rules):
  ```text
  22   SSH, restricted to your IP if possible
  80   HTTP
  443  HTTPS
  ```
- **Oracle-specific gotcha**: Oracle's Ubuntu images additionally ship with the OS-level
  `iptables`/`netfilter` firewall pre-configured to drop everything except SSH, independent of
  the cloud console's security list above — both layers must allow 80/443 or the console rule
  alone will not be enough and HTTP(S) will silently time out. On the VM itself:
  ```bash
  sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
  sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
  sudo netfilter-persistent save
  ```
- Do not publicly allow service ports such as `4001`, `4002`, `4005`, `5433`, `5434`, `5437`, `5438`, `6379`, `8000`, `8100-8111`, `9000`, `9001`, `9092`, or `11434` — on Oracle this means leaving them out of both the console security list/NSG and the `iptables` rules above.

**Paid alternative**: any Ubuntu 22.04/24.04 VM from Hetzner, DigitalOcean, AWS Lightsail, or GCP
Compute Engine works identically from Stage 3 onward. Minimum sizing 4 vCPU / 16 GB RAM / 100 GB
disk; preferred 8 vCPU / 24-32 GB RAM / 200 GB disk. Skip the iptables step above — it's specific
to Oracle's default Ubuntu image.

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
- Render Kong config for real Clerk and real PWA origin (use whichever PWA origin Stage 8 attached
  — Vercel's free `yourapp.vercel.app`, a DuckDNS name, or a purchased domain):
  ```bash
  CLERK_ISSUER=https://your-clerk-app.clerk.accounts.dev \
  CORS_ORIGIN=https://yourapp.vercel.app \
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
- Create a Caddyfile using the DuckDNS hostnames from Stage 7 (do Stage 7's DuckDNS registration
  first if working through this sequentially — Caddy needs the hostnames to already resolve to
  this VM before it can request a certificate for them):
  ```caddyfile
  api-yourapp.duckdns.org {
    reverse_proxy localhost:8000
  }

  speaking-yourapp.duckdns.org {
    reverse_proxy localhost:8103
  }
  ```
- Reload Caddy:
  ```bash
  sudo systemctl reload caddy
  ```
- Caddy should automatically issue Let's Encrypt TLS certificates for both `*.duckdns.org`
  subdomains — this works the same as a purchased domain since Let's Encrypt has no allowlist of
  registrars, it just needs the hostname to resolve to the VM.
- Verify public backend:
  ```bash
  curl https://api-yourapp.duckdns.org/api/health/user-service
  curl https://api-yourapp.duckdns.org/api/health/learning-materials-service
  curl https://api-yourapp.duckdns.org/api/health/notification-service
  ```
- **Paid-domain alternative**: same Caddyfile shape with `api.yourdomain.com` /
  `speaking.yourdomain.com` in place of the DuckDNS names — no other change.

### Stage 7: Configure DNS

**No-cost path (default): DuckDNS**

- In the DuckDNS dashboard, add the two subdomains registered in Stage 1
  (`api-yourapp`, `speaking-yourapp`) and set each one's IP to the Oracle VM's public IP.
- Unlike a real registrar's A record, DuckDNS's free tier has **no fixed-IP guarantee across VM
  recreation** — if the Oracle instance is ever terminated and recreated (not just rebooted; a
  reboot keeps the same public IP), its public IP can change, and the DuckDNS entries must be
  updated to match. Since Oracle Always Free instances keep a stable IP across normal reboots,
  this only matters if you rebuild the instance from scratch. To handle it automatically, install
  DuckDNS's own update cron job on the VM (from the DuckDNS dashboard's "install" instructions for
  Linux) — a small script + cron entry that periodically pings DuckDNS's update endpoint with the
  VM's current public IP, so DNS self-heals within minutes of any IP change instead of silently
  breaking.
- Point the PWA at Vercel as usual — either Vercel's own free `yourapp.vercel.app` domain (works
  immediately, no DNS step needed) or a third DuckDNS name pointed at Vercel's DNS target if you
  want a unified naming scheme.
- Do not expose a `minio` subdomain for v1 unless object access is intentionally made public or
  separately protected.
- Wait for DNS propagation, then verify:
  ```bash
  nslookup api-yourapp.duckdns.org
  nslookup speaking-yourapp.duckdns.org
  ```

**Paid-domain alternative**:
- Point root PWA domain to Vercel:
  ```text
  yourdomain.com -> Vercel DNS target
  ```
- Point backend subdomains to the VM public IP:
  ```text
  api.yourdomain.com      A -> <VM_PUBLIC_IP>
  speaking.yourdomain.com A -> <VM_PUBLIC_IP>
  ```
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
- Configure Vercel environment variables (no-cost path uses the DuckDNS backend hostnames from
  Stage 7; substitute `api.yourdomain.com`/`speaking.yourdomain.com` if you took the paid-domain
  alternative):
  ```env
  NEXT_PUBLIC_API_BASE_URL=https://api-yourapp.duckdns.org/api
  API_BASE_URL=https://api-yourapp.duckdns.org/api
  NEXT_PUBLIC_SPEAKING_WS_BASE_URL=wss://speaking-yourapp.duckdns.org

  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
  CLERK_SECRET_KEY=...

  NEXT_PUBLIC_CLERK_SIGN_IN_URL=/auth/sign-in
  NEXT_PUBLIC_CLERK_SIGN_UP_URL=/auth/sign-up
  NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL=/main/homepage
  NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL=/main/homepage

  NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER=...
  NOVU_API_KEY=...
  ```
- Attach the production domain — **no-cost path: skip this step entirely** and use Vercel's free
  `yourapp.vercel.app` domain as-is (no DNS configuration needed). Only attach a custom domain
  (a DuckDNS name or a purchased one) if you want a nicer PWA URL than `*.vercel.app`:
  ```text
  yourdomain.com
  ```
- Trigger a Vercel production deployment.

### Stage 9: Configure Clerk and Webhooks

- In Clerk production dashboard, configure allowed origins and redirects (use whichever PWA/API
  origins you actually attached in Stages 6-8 — `*.vercel.app`/DuckDNS by default):
  ```text
  https://yourapp.vercel.app
  https://api-yourapp.duckdns.org
  ```
- Configure sign-in/sign-up redirects to:
  ```text
  https://yourapp.vercel.app/main/homepage
  ```
- Add Clerk webhook endpoint:
  ```text
  https://api-yourapp.duckdns.org/api/webhooks/clerk
  ```
- Copy the production webhook secret into `infra/.env` as `CLERK_WEBHOOK_SECRET`.
- Re-render Kong and restart if Clerk issuer or CORS changed:
  ```bash
  CLERK_ISSUER=https://your-clerk-app.clerk.accounts.dev \
  CORS_ORIGIN=https://yourapp.vercel.app \
  npm run kong:render

  docker compose --env-file infra/.env \
    -f infra/docker-compose.yml \
    -f infra/docker-compose.prod.yml \
    up -d --build
  ```

### Stage 10: End-to-End Validation

- Public health checks:
  ```bash
  curl https://api-yourapp.duckdns.org/api/health/user-service
  curl https://api-yourapp.duckdns.org/api/health/learning-materials-service
  curl https://api-yourapp.duckdns.org/api/health/notification-service
  ```
- Browser checks:
  - Open `https://yourapp.vercel.app` (or your custom domain, if attached)
  - Sign up/sign in with Clerk
  - Confirm redirect to `/main/homepage`
  - Open practice center and review center
  - Start a speaking session and confirm `wss://speaking-yourapp.duckdns.org` connects
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
  - **No-cost path**: confirm the DuckDNS update cron job (Stage 7) is actually running
    (`crontab -l`, or check `/var/log/syslog`/DuckDNS's own log file it writes to) — a silently
    dead cron job is the one way this whole path can go down without any container or Caddy log
    showing an error, since everything on the VM would still be healthy while DNS quietly points
    at a stale IP.
- Re-run `npm run kong:render` on every deploy or Clerk key rotation.

## Public Interfaces and Configuration Changes

- PWA public origin becomes:
  ```text
  https://yourapp.vercel.app
  ```
  (or a custom domain, paid or DuckDNS, if attached in Stage 8)
- API base URL becomes:
  ```text
  https://api-yourapp.duckdns.org/api
  ```
- Speaking WebSocket base URL becomes:
  ```text
  wss://speaking-yourapp.duckdns.org
  ```
- Kong production config must be generated from real Clerk JWKS with:
  ```bash
  CLERK_ISSUER=...
  CORS_ORIGIN=https://yourapp.vercel.app
  ```
- Vercel must use production `NEXT_PUBLIC_API_BASE_URL`, `API_BASE_URL`, and `NEXT_PUBLIC_SPEAKING_WS_BASE_URL`; no deployed frontend env var should point to `localhost`.
- All of the above use DuckDNS/`*.vercel.app` names for the $0 path — anywhere `yourdomain.com`-style
  names appear elsewhere in this doc's examples, substitute your actual DuckDNS hostnames (or a
  purchased domain, if you took the paid alternative) consistently across Kong, Caddy, Vercel, and
  Clerk config — a mismatch between what Caddy/Kong expect and what Vercel/Clerk are configured
  with is the most common source of CORS/JWT-issuer failures after deploy.

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
- **Default target is $0 recurring cost**: Oracle Cloud "Always Free" Ampere A1 for the backend VM
  (4 OCPU / 24 GB RAM / 200 GB disk, free forever, not a time-limited trial) and free DuckDNS
  subdomains instead of a purchased domain. This was chosen over Hetzner/DigitalOcean/AWS
  Lightsail/GCP (all paid) and over Render/Railway/Fly's free tiers (real but too small — ≤1GB
  RAM and/or sleep-on-idle, nowhere near enough for 4 Postgres instances + Kafka + Kong + 11
  Python agent services running concurrently). Real idle memory usage of the full stack measured
  on a dev machine is ~2.6GB — comfortably inside the Always Free 24GB even with load headroom.
- The production PWA uses Vercel's free `*.vercel.app` domain by default, not a purchased root
  domain — attaching a custom domain (DuckDNS or paid) is optional and doesn't change anything
  else in this plan.
- `api-yourapp.duckdns.org` and `speaking-yourapp.duckdns.org` (or their paid-domain equivalents)
  point to the backend VM.
- Live AI uses Groq/OpenRouter (both free-tier API keys); local Ollama is not required for launch
  success.
- Caddy is the default reverse proxy because it handles HTTPS certificates automatically, and does
  so identically for DuckDNS names as for a purchased domain (Let's Encrypt has no
  registrar-based allowlist).
- Oracle's Always Free capacity/eligibility, and DuckDNS's free-tier terms, are both outside this
  repo's control and could change; if either stops being viable, every other stage of this plan is
  unaffected — only Stage 1 (domain) and Stage 2 (VM provider) need to be swapped for a paid
  alternative, which this doc documents inline at each stage.
- MinIO remains self-hosted inside Docker for v1; Cloud Storage/S3 migration is a later improvement.
- The current compose stack remains the source of truth for backend deployment; no Kubernetes or Cloud Run migration is part of this plan.
