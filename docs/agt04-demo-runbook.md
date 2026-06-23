# AGT-04 Feedback Agent — Demo Runbook

> Run every step in order. Never skip.
> Every failure has a fix immediately below it.
> All commands are PowerShell from the repo root.

---

## BEFORE ANYTHING: Navigate to the repo root

**Every command in this file must run from here.**

```powershell
cd "C:\Users\minhh\Side Hustles\ai-agentic-english"
```

Confirm:

```powershell
Get-Location
# Must end with: ai-agentic-english
```

If it does not — stop, run the `cd` above, then continue.

---

## STEP 1 — Confirm Docker is running

```powershell
docker version
```

**Expected:** output contains both `Client:` and `Server:` blocks with version numbers.

**If "error during connect" or "cannot find pipe":**
1. Open Docker Desktop from the Start menu
2. Wait until the tray icon is steady — hover it, it must say **"Engine running"**
3. Re-run `docker version` before continuing

---

## STEP 2 — Start all required services

AGT-04 has two dependencies:
- **AGT-06** (critical): every error detected by AGT-04 is dual-written to AGT-06 STM. If AGT-06 is down, `/feedback/speaking` and `/feedback/writing` raise and return HTTP 5xx.
- **Kafka** (best-effort): error events are also emitted to `agent.errors` topic. Kafka failure is logged but does not fail the request.
- **LanguageTool**: started alongside AGT-04 but bypassed in `INFERENCE_MODE=mock`.

```powershell
docker compose -f infra/docker-compose.yml up -d --build `
    postgres-agents redis kafka languagetool `
    agt06-memory agt04-feedback
```

First-time build takes 3–8 minutes. Subsequent runs are under 45 seconds.

**If "no configuration file provided" or "file not found":**
```powershell
Get-Location  # must end with ai-agentic-english
```

**If a container exits immediately after starting:**
```powershell
# Replace <service> with the failing service name shown in docker ps
docker compose -f infra/docker-compose.yml logs <service> --tail=40
# Fix the error, then re-run Step 2.
```

**If a port is already in use (e.g. 8104 or 8106):**
```powershell
netstat -ano | findstr ":8104"
# Note the PID in the far-right column, then kill it:
taskkill /PID <pid> /F
# Re-run Step 2.
```

**If the build fails with a pip error:**
```powershell
docker compose -f infra/docker-compose.yml build --no-cache agt04-feedback
docker compose -f infra/docker-compose.yml up -d agt04-feedback
```

---

## STEP 3 — Wait for postgres-agents to be healthy

AGT-06 needs postgres-agents before it can accept connections. Do not run Step 4 until this loop exits.

```powershell
Write-Host "Waiting for postgres-agents..."
do {
    $s = docker inspect --format="{{.State.Health.Status}}" ai-agentic-english-postgres-agents-1 2>$null
    if ($s -eq "healthy") { Write-Host "  postgres-agents is healthy." -ForegroundColor Green; break }
    Write-Host "  status: $s — retrying in 4s..."
    Start-Sleep 4
} while ($true)
```

**Expected:** loop exits within 30 seconds printing `postgres-agents is healthy.`

**If the container name is not found:**
```powershell
docker ps --format "table {{.Names}}"
# Find the actual postgres-agents container name and substitute it everywhere in this file.
```

**If health check is stuck on "starting" for more than 2 minutes:**
```powershell
docker compose -f infra/docker-compose.yml logs postgres-agents --tail=20
docker compose -f infra/docker-compose.yml restart postgres-agents
# Wait another 30s, then re-run the loop above.
```

---

## STEP 4 — Run database migrations

> Required on every fresh start and after any `docker compose down -v`.
> Safe to re-run — all statements use `IF NOT EXISTS`.

```powershell
Get-ChildItem "agents\migrations\*.sql" | Sort-Object Name | ForEach-Object {
    Write-Host "  -> $($_.Name)"
    Get-Content $_.FullName -Raw | docker exec -i ai-agentic-english-postgres-agents-1 psql -U postgres -d agent_ltm
    if ($LASTEXITCODE -ne 0) {
        Write-Host "FAILED on $($_.Name) — check error above." -ForegroundColor Red
        break
    }
}
Write-Host "Migrations complete." -ForegroundColor Green
```

**Expected:** 11 filenames printed (`001_extensions.sql` through `011_behavioral_patterns.sql`), each followed by SQL output (`CREATE TABLE`, `CREATE INDEX`, etc.).

**If a migration fails with "relation already exists":** that is fine — the `IF NOT EXISTS` guards are idempotent.

**If a migration fails with a connection error:**
```powershell
# postgres-agents is not healthy yet — re-run Step 3, then retry here.
docker compose -f infra/docker-compose.yml logs postgres-agents --tail=20
```

---

## STEP 5 — Wait for both agents to be ready

```powershell
$agents = @(
    @{ Name = "agt06-memory";    Url = "http://localhost:8106/health" },
    @{ Name = "agt04-feedback";  Url = "http://localhost:8104/health" }
)

foreach ($agent in $agents) {
    Write-Host "Waiting for $($agent.Name)..."
    $retries = 0
    do {
        try {
            $r = Invoke-RestMethod -Uri $agent.Url -TimeoutSec 2
            Write-Host "  UP: $($r.agent) — $($r.status)" -ForegroundColor Green
            break
        } catch {
            $retries++
            if ($retries -gt 40) {
                Write-Host "  TIMEOUT: $($agent.Name) did not start after 2 minutes." -ForegroundColor Red
                Write-Host "  Run: docker compose -f infra/docker-compose.yml logs $($agent.Name) --tail 50"
                break
            }
            Start-Sleep 3
        }
    } while ($true)
}
```

**Expected:**
```
Waiting for agt06-memory...
  UP: AGT-06 — ok
Waiting for agt04-feedback...
  UP: AGT-04 — ok
```

**If agt06-memory times out:**
```powershell
docker compose -f infra/docker-compose.yml logs agt06-memory --tail=50
# Common causes: asyncpg connection refused (migrations not run) → re-run Step 4.
# Redis not ready → re-run Step 2, then Step 3, then Step 4.
```

**If agt04-feedback times out:**
```powershell
docker compose -f infra/docker-compose.yml logs agt04-feedback --tail=50
# Common causes: import error (bad PYTHONPATH) → rebuild with --build flag in Step 2.
```

---

## STEP 6 — Verify health (explicit check before demo)

```powershell
$allOk = $true
@(
    @{port=8106; name="AGT-06  Memory (STM + LTM)"},
    @{port=8104; name="AGT-04  Feedback"}
) | ForEach-Object {
    try {
        $r = Invoke-RestMethod "http://localhost:$($_.port)/health"
        Write-Host "  [OK  ] $($_.port)  $($_.name)  — $($r.status)" -ForegroundColor Green
    } catch {
        Write-Host "  [FAIL] $($_.port)  $($_.name)  — not responding" -ForegroundColor Red
        $allOk = $false
    }
}
if (-not $allOk) {
    Write-Host "`nSTOP: One or more agents not ready. Re-run Step 2, then Step 5." -ForegroundColor Red
} else {
    Write-Host "`nBoth agents healthy. Proceed to Step 7." -ForegroundColor Green
}
```

**Expected:**
```
  [OK  ] 8106  AGT-06  Memory (STM + LTM)  — ok
  [OK  ] 8104  AGT-04  Feedback  — ok

Both agents healthy. Proceed to Step 7.
```

**If either line shows FAIL:**
```powershell
docker compose -f infra/docker-compose.yml logs agt06-memory   --tail=30
docker compose -f infra/docker-compose.yml logs agt04-feedback --tail=30
# Then re-run Step 2, re-run Step 5, and repeat Step 6.
```

---

## STEP 7 — Manager Demo

Copy the entire block below and run it as one unit in PowerShell.
Every line of output maps to a scene described in the comments.

```powershell
# ── Demo variables ─────────────────────────────────────────────────────────────
$DEMO_UID = "demo-feedback-$([guid]::NewGuid().ToString().Substring(0,8))"
$DEMO_SID = [guid]::NewGuid().ToString()

Clear-Host
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "    AI AGENTIC ENGLISH  —  AGT-04 FEEDBACK AGENT" -ForegroundColor Cyan
Write-Host "    INFERENCE_MODE: mock   (deterministic, no API keys)" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Demo user:    $DEMO_UID"
Write-Host "  Session ID:   $DEMO_SID"
Write-Host ""

# ── Scene 1: System check ──────────────────────────────────────────────────────
Write-Host "SCENE 1: LIVE AGENTS" -ForegroundColor White
Write-Host ""
@(
    @{port=8106; name="AGT-06  Memory Agent  (STM + LTM)"},
    @{port=8104; name="AGT-04  Feedback Agent"}
) | ForEach-Object {
    try {
        Invoke-RestMethod "http://localhost:$($_.port)/health" | Out-Null
        Write-Host "  [LIVE] $($_.name)" -ForegroundColor Green
    } catch {
        Write-Host "  [DOWN] $($_.name)  — run Step 2 first" -ForegroundColor Red
    }
}

# ── Scene 2: Speaking feedback ────────────────────────────────────────────────
Write-Host ""
Write-Host "SCENE 2: SPEAKING FEEDBACK" -ForegroundColor White
Write-Host ""
Write-Host "  Minh is practicing for a client presentation." -ForegroundColor Yellow
Write-Host "  He says (8 seconds):" -ForegroundColor Yellow
Write-Host ""
Write-Host "  +- MINH -----------------------------------------------------------" -ForegroundColor Yellow
Write-Host "  |  'I am works as a sales manager. Um, I go to meeting every week" -ForegroundColor Yellow
Write-Host "  |   with foreign client and I always nervous before present.'" -ForegroundColor Yellow
Write-Host "  +------------------------------------------------------------------" -ForegroundColor Yellow
Write-Host ""

$speakBody = @{
    transcript       = "I am works as a sales manager. Um, I go to meeting every week with foreign client and I always nervous before present."
    session_id       = $DEMO_SID
    clerk_user_id    = $DEMO_UID
    duration_seconds = 8.0
    skill_domain     = "SPEAKING"
} | ConvertTo-Json

$speak = Invoke-RestMethod -Method Post "http://localhost:8104/feedback/speaking" `
    -ContentType "application/json" -Body $speakBody

Write-Host "  FEEDBACK RETURNED:" -ForegroundColor White
Write-Host ""
Write-Host "  Grammar errors detected:  $($speak.total_errors_detected)"
Write-Host "  Errors surfaced to user:  $($speak.surfaced_error_count)  (throttled: $($speak.throttled))"
Write-Host ""
Write-Host "  Errors:"
$speak.grammar_errors | ForEach-Object {
    Write-Host "    [$($_.errorType)]  $($_.message)  (severity: $($_.severity))"
}
Write-Host ""
Write-Host "  Fluency metrics:" -ForegroundColor White
Write-Host "    Words per minute:  $($speak.fluency.words_per_minute)"
Write-Host "    Word count:        $($speak.fluency.word_count)"
Write-Host "    Filler density:    $($speak.fluency.filler_density)  (filler words: um, uh, like, etc.)"
Write-Host "    Duration:          $($speak.fluency.duration_seconds)s"

# ── Scene 3: Dual-write verification ─────────────────────────────────────────
Write-Host ""
Write-Host "SCENE 3: DUAL-WRITE — ERRORS PERSISTED TO REDIS STM" -ForegroundColor White
Write-Host ""
Write-Host "  AGT-04 wrote each grammar error to AGT-06 STM (Redis)." -ForegroundColor Yellow
Write-Host "  AGT-01 reads these errors at session end to update Minh's long-term profile." -ForegroundColor Yellow
Write-Host ""

$stmErrors = Invoke-RestMethod "http://localhost:8106/sessions/$DEMO_SID/errors"

Write-Host "  Errors in Redis STM (session:$DEMO_SID:errors):" -ForegroundColor White
Write-Host "  Count: $($stmErrors.Count)"
$stmErrors | ForEach-Object {
    Write-Host "    error_type=$($_.error_type)  skill_domain=$($_.skill_domain)  severity=$($_.severity)"
}

if ($stmErrors.Count -eq $speak.total_errors_detected) {
    Write-Host ""
    Write-Host "  DUAL-WRITE CONFIRMED: $($stmErrors.Count) error(s) in Redis match $($speak.total_errors_detected) detected." -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "  MISMATCH: $($stmErrors.Count) in Redis vs $($speak.total_errors_detected) detected — check AGT-06 logs." -ForegroundColor Red
}

# ── Scene 4: Writing feedback ─────────────────────────────────────────────────
Write-Host ""
Write-Host "SCENE 4: WRITING FEEDBACK" -ForegroundColor White
Write-Host ""
Write-Host "  Minh submits a draft email to a foreign client." -ForegroundColor Yellow
Write-Host ""
Write-Host "  +- MINH'S DRAFT ---------------------------------------------------" -ForegroundColor Yellow
Write-Host "  |  Dear Mr Johnson," -ForegroundColor Yellow
Write-Host "  |  I want to discuss about the project deadline with you." -ForegroundColor Yellow
Write-Host "  |  Please let me know if you have free time this week." -ForegroundColor Yellow
Write-Host "  |  Thank you for your understanding." -ForegroundColor Yellow
Write-Host "  +------------------------------------------------------------------" -ForegroundColor Yellow
Write-Host ""

$writingBody = @{
    draft         = "Dear Mr Johnson,`nI want to discuss about the project deadline with you.`nPlease let me know if you have free time this week.`nThank you for your understanding."
    prompt        = "Write a professional email to a foreign client requesting a meeting to discuss a project deadline."
    session_id    = $DEMO_SID
    clerk_user_id = $DEMO_UID
} | ConvertTo-Json

$writing = Invoke-RestMethod -Method Post "http://localhost:8104/feedback/writing" `
    -ContentType "application/json" -Body $writingBody

Write-Host "  WRITING QUALITY RUBRIC (0.0 = poor  →  1.0 = excellent):" -ForegroundColor White
Write-Host ""
Write-Host "    Grammar:    $($writing.quality_scores.grammar)"
Write-Host "    Coherence:  $($writing.quality_scores.coherence)"
Write-Host "    Cohesion:   $($writing.quality_scores.cohesion)"
Write-Host "    Register:   $($writing.quality_scores.register)"
Write-Host "    Structure:  $($writing.quality_scores.structure)"
Write-Host ""
Write-Host "    Vietnamese indirectness flag:  $($writing.quality_scores.vietnamese_indirectness)"
Write-Host ""
Write-Host "    Top improvement suggestions:" -ForegroundColor White
$writing.quality_scores.top_issues | ForEach-Object { Write-Host "      - $_" }
Write-Host ""
Write-Host "  Grammar errors: $($writing.total_errors)"
$writing.grammar_errors | ForEach-Object {
    Write-Host "    [$($_.errorType)]  $($_.message)"
}

# ── Scene 5: Comprehension feedback (stub) ───────────────────────────────────
Write-Host ""
Write-Host "SCENE 5: COMPREHENSION FEEDBACK (stub)" -ForegroundColor White
Write-Host ""
Write-Host "  Minh answered a listening comprehension question." -ForegroundColor Yellow
Write-Host ""

$compBody = @{
    responses     = @(@{ question_id = "q1"; answer = "B" })
    exercise_id   = "ex-listen-001"
    session_id    = $DEMO_SID
    clerk_user_id = $DEMO_UID
    skill_domain  = "LISTENING"
} | ConvertTo-Json -Depth 3

$comp = Invoke-RestMethod -Method Post "http://localhost:8104/feedback/comprehension" `
    -ContentType "application/json" -Body $compBody

Write-Host "  Score:        $($comp.score)"
Write-Host "  Skill domain: $($comp.skill_domain)"
Write-Host "  Note:         $($comp.feedback)"

# ── Scene 6: Session-end summary (stub) ──────────────────────────────────────
Write-Host ""
Write-Host "SCENE 6: SESSION-END SUMMARY (stub)" -ForegroundColor White
Write-Host ""
Write-Host "  Session ends — AGT-04 produces an end-of-session summary." -ForegroundColor Yellow
Write-Host ""

$endBody = @{
    session_id    = $DEMO_SID
    clerk_user_id = $DEMO_UID
} | ConvertTo-Json

$endResult = Invoke-RestMethod -Method Post "http://localhost:8104/feedback/session-end" `
    -ContentType "application/json" -Body $endBody

Write-Host "  Session ID:     $($endResult.session_id)"
Write-Host "  Summary:        $($endResult.summary)"
Write-Host "  Errors by skill: (pending Phase 4 implementation)"

# ── Scene 7: Kafka verification ───────────────────────────────────────────────
Write-Host ""
Write-Host "SCENE 7: KAFKA — AGENT.ERRORS TOPIC" -ForegroundColor White
Write-Host ""
Write-Host "  Reading last 5 messages from agent.errors..." -ForegroundColor Yellow
Write-Host ""

docker exec ai-agentic-english-kafka-1 /opt/kafka/bin/kafka-console-consumer.sh `
    --bootstrap-server localhost:9092 `
    --topic agent.errors `
    --from-beginning --max-messages 5 --timeout-ms 5000

Write-Host ""
Write-Host "  (TimeoutException at the end is normal — means 5-second read window expired cleanly.)" -ForegroundColor DarkGray

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "=========================================================" -ForegroundColor Green
Write-Host "  AGT-04 FEEDBACK AGENT — DEMO COMPLETE" -ForegroundColor Green
Write-Host ""
Write-Host "  WHAT WAS DEMONSTRATED:" -ForegroundColor Green
Write-Host "    [Speaking]  Grammar detection + fluency metrics (WPM, fillers)" -ForegroundColor Green
Write-Host "    [Speaking]  Dual-write: errors written to Redis STM via AGT-06" -ForegroundColor Green
Write-Host "    [Writing]   Quality rubric (grammar/coherence/cohesion/register/structure)" -ForegroundColor Green
Write-Host "    [Writing]   Vietnamese indirectness detection flag" -ForegroundColor Green
Write-Host "    [Kafka]     agent.errors events emitted for LTM persistence" -ForegroundColor Green
Write-Host "    [Stub]      Comprehension and session-end endpoints ready for Phase 4" -ForegroundColor Green
Write-Host ""
Write-Host "  All in INFERENCE_MODE=mock — no API keys required." -ForegroundColor Green
Write-Host "=========================================================" -ForegroundColor Green
```

---

### Step 7 troubleshooting (run these separately only if a scene fails)

**If Scene 2 `/feedback/speaking` returns HTTP 5xx:**
```powershell
docker compose -f infra/docker-compose.yml logs agt04-feedback --tail=30
docker compose -f infra/docker-compose.yml logs agt06-memory   --tail=30
# Root cause: AGT-04 tried to dual-write to AGT-06 and AGT-06 was not ready.
# AGT-06 is the critical path — this call hard-fails if AGT-06 STM is down.
# Fix: ensure AGT-06 is healthy (Step 6), then rerun Scene 2.
```

**If Scene 3 STM count is 0 (no errors in Redis):**
```powershell
# STM write failed silently — this should not happen as it raises on failure.
docker compose -f infra/docker-compose.yml logs agt04-feedback --tail=20
docker compose -f infra/docker-compose.yml logs agt06-memory   --tail=20
# Check for Redis connection errors. Ensure redis is running:
docker ps | findstr redis
```

**If Scene 4 `/feedback/writing` returns HTTP 5xx:**
```powershell
docker compose -f infra/docker-compose.yml logs agt04-feedback --tail=30
# Same as Scene 2 — dual-write to AGT-06 is critical. Fix AGT-06 first.
```

**If Scene 7 Kafka shows "topic does not exist" or returns 0 messages:**
```powershell
# List all topics to confirm agent.errors exists:
docker exec ai-agentic-english-kafka-1 /opt/kafka/bin/kafka-topics.sh `
    --bootstrap-server localhost:9092 --list

# If absent: the topic is auto-created on first emit.
# If no messages: the dual-write to Kafka was swallowed (best-effort path).
# Check AGT-04 logs for "Kafka dual-write failed":
docker compose -f infra/docker-compose.yml logs agt04-feedback --tail=30 2>&1 | Select-String "Kafka"
```

**If `$DEMO_SID` is null or STM returns "not found":**
```powershell
Write-Host "DEMO_SID = $DEMO_SID"
# If empty: the variable assignment at the top of Step 7 failed.
# Set it manually:
$DEMO_SID = [guid]::NewGuid().ToString()
Write-Host "New DEMO_SID = $DEMO_SID"
# Then rerun from Scene 2.
```

---

## Troubleshooting Quick Reference

| Error message | Cause | Fix |
|---|---|---|
| `No connection could be made` | Container not running | Re-run Step 2, then Step 5 |
| `no configuration file provided` | Wrong working directory | `cd` to repo root (top of file) |
| HTTP 5xx on `/feedback/speaking` | AGT-06 STM unreachable | Ensure `agt06-memory` is running and healthy |
| HTTP 5xx on `/feedback/writing` | AGT-06 STM unreachable | Same as above |
| STM errors count = 0 | Redis not running | `docker ps \| findstr redis` — restart if absent |
| `agent.errors` topic empty | Kafka dual-write failed | Check logs for "Kafka dual-write failed" |
| `field required: clerk_user_id` | Missing body field | All three fields required: `session_id`, `clerk_user_id`, payload |
| Port already in use | Another process on 8104/8106 | `netstat -ano \| findstr :<port>` then `taskkill /PID <pid> /F` |
| Wrong container name | Compose project name differs | `docker ps --format "table {{.Names}}"` and substitute everywhere |
| Migration error | DB not healthy at run time | Re-run Step 3, then Step 4 |

---

## Clean Shutdown

```powershell
# Stop just the AGT-04 containers (keeps volumes/data):
docker compose -f infra/docker-compose.yml stop `
    agt04-feedback agt06-memory languagetool kafka redis postgres-agents

# Or stop and remove containers + networks (keeps volumes):
docker compose -f infra/docker-compose.yml down

# Full wipe including volumes (requires re-running migrations next time):
docker compose -f infra/docker-compose.yml down -v
```

---

## Full Reset (if something is deeply broken)

```powershell
# 1. Wipe everything
docker compose -f infra/docker-compose.yml down -v

# 2. Rebuild and restart
docker compose -f infra/docker-compose.yml up -d --build `
    postgres-agents redis kafka languagetool `
    agt06-memory agt04-feedback

# 3. Wait for postgres-agents
Write-Host "Waiting for postgres-agents..."
do {
    $s = docker inspect --format="{{.State.Health.Status}}" ai-agentic-english-postgres-agents-1 2>$null
    if ($s -eq "healthy") { Write-Host "  healthy." -ForegroundColor Green; break }
    Write-Host "  $s — retrying in 4s..."
    Start-Sleep 4
} while ($true)

# 4. Re-run migrations
Get-ChildItem "agents\migrations\*.sql" | Sort-Object Name | ForEach-Object {
    Write-Host "  -> $($_.Name)"
    Get-Content $_.FullName -Raw | docker exec -i ai-agentic-english-postgres-agents-1 psql -U postgres -d agent_ltm
}
Write-Host "Reset complete. Start from Step 5." -ForegroundColor Green
```

> After `down -v`, containers are gone so migrations must wait until Step 3 completes (postgres-agents healthy).
> After full reset, follow Steps 5–7 in order.

---

## Architecture Notes (for Q&A)

| Component | Port | Role in AGT-04 demo |
|---|---|---|
| AGT-04 Feedback | 8104 | Grammar + fluency + writing quality analysis |
| AGT-06 Memory | 8106 | Receives error dual-writes via POST `/sessions/{id}/errors` |
| Redis | 6379 | STM backend — AGT-06 writes `session:{id}:errors` lists here |
| Kafka | 9092 / 9094 | Receives best-effort `agent.errors` events from AGT-04 |
| LanguageTool | 8082 | Grammar rule engine — bypassed in `INFERENCE_MODE=mock` |
| postgres-agents | 5438 | LTM backend (pgvector) — AGT-06 reads/writes here |

**Dual-write protocol** (core of AGT-04):
1. Every error detected during a turn is written to **AGT-06 STM** (synchronous, raises on failure — session correctness depends on this)
2. Every error is also emitted to **Kafka `agent.errors`** (best-effort, logs on failure, session continues)

**INFERENCE_MODE=mock** means:
- LanguageTool call returns one canned error: `mock_grammar / severity 1`
- LLM contextual check returns `[]` (skipped entirely)
- Writing quality rubric returns fixed stub scores (grammar=0.7, coherence=0.65, etc.)
- Fluency metrics (WPM, filler density) are **always real** — computed from the actual transcript text and `duration_seconds`
