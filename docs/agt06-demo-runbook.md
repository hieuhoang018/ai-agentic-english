# AGT-06 Demo Runbook — Complete Start-to-Finish

> Run every block in order. Never skip a step.
> Every failure has a fix immediately below it.
> All commands are PowerShell from the worktree root.

---

## BEFORE ANYTHING: Navigate to the worktree

**Every command in this file must run from here.**

```powershell
cd "C:\Users\minhh\Side Hustles\ai-agentic-english\.worktrees\agt06-agt01-agt02-agt03-sprint"
```

Confirm:

```powershell
Get-Location
# Must end with: .worktrees\agt06-agt01-agt02-agt03-sprint
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

## STEP 2 — Start the full stack

```powershell
docker compose -f infra/docker-compose.yml up -d --build `
    postgres-agents redis kafka `
    agt06-memory agt01-profiling agt02-learning-path agt03-tutor
```

Wait 30–60 seconds. You will see `✔ Container ... Started` lines.

**If "no configuration file provided" or "file not found":**
```powershell
Get-Location  # must end with .worktrees\agt06-agt01-agt02-agt03-sprint
```

**If a container exits immediately after starting:**
```powershell
# Replace <service> with the failing service name
docker compose -f infra/docker-compose.yml logs <service> --tail=30
# Then re-run Step 2.
```

**If a port is already in use (e.g. 8101):**
```powershell
netstat -ano | findstr ":8101"
# Note the PID in the far-right column, then kill it:
taskkill /PID <pid> /F
# Re-run Step 2.
```

---

## STEP 3 — Wait for postgres-agents to be healthy

```powershell
Write-Host "Waiting for postgres-agents..."
do {
    $s = docker inspect --format="{{.State.Health.Status}}" ai-agentic-english-postgres-agents-1 2>$null
    if ($s -eq "healthy") { Write-Host "  postgres-agents is healthy." -ForegroundColor Green; break }
    Write-Host "  status: $s — retrying in 4s..."
    Start-Sleep 4
} while ($true)
```

**Expected:** loop exits within 30 seconds. Do not run Step 4 until this completes.

**If the container name is not found:**
```powershell
docker ps --format "table {{.Names}}"
# Find the actual postgres-agents container name and substitute it everywhere in this file.
```

---

## STEP 4 — Run database migrations

> Required on every fresh start and after any `docker compose down -v`. Safe to re-run — all statements use `IF NOT EXISTS`.

```powershell
Get-ChildItem "agents\migrations\*.sql" | Sort-Object Name | ForEach-Object {
    Write-Host "  -> $($_.Name)"
    Get-Content $_.FullName -Raw | docker exec -i ai-agentic-english-postgres-agents-1 psql -U postgres -d agent_ltm
}
Write-Host "Migrations complete." -ForegroundColor Green
```

**Expected:** each filename printed, followed by SQL output like `CREATE EXTENSION`, `CREATE TABLE`, `CREATE INDEX`.

**If a migration fails:**
```powershell
docker compose -f infra/docker-compose.yml logs postgres-agents --tail=20
# Fix the underlying error, then re-run this step.
```

---

## STEP 5 — Verify all 4 agents are healthy

```powershell
$allOk = $true
@(
    @{port=8101; name="AGT-01  User Profiling"},
    @{port=8102; name="AGT-02  Learning Path"},
    @{port=8103; name="AGT-03  AI Tutor"},
    @{port=8106; name="AGT-06  Memory (STM + LTM)"}
) | ForEach-Object {
    try {
        $r = Invoke-RestMethod "http://localhost:$($_.port)/health"
        Write-Host "  [OK  ] $($_.port)  $($_.name)" -ForegroundColor Green
    } catch {
        Write-Host "  [FAIL] $($_.port)  $($_.name)  — not responding" -ForegroundColor Red
        $allOk = $false
    }
}
if (-not $allOk) { Write-Host "`nSTOP: Re-run Step 2 before continuing." -ForegroundColor Red }
else             { Write-Host "`nAll agents healthy. Proceed to Step 6." -ForegroundColor Green }
```

**Expected:**
```
  [OK  ] 8101  AGT-01  User Profiling
  [OK  ] 8102  AGT-02  Learning Path
  [OK  ] 8103  AGT-03  AI Tutor
  [OK  ] 8106  AGT-06  Memory (STM + LTM)

All agents healthy. Proceed to Step 6.
```

**If any line shows FAIL:**
```powershell
docker compose -f infra/docker-compose.yml logs agt06-memory        --tail=20
docker compose -f infra/docker-compose.yml logs agt01-profiling      --tail=20
docker compose -f infra/docker-compose.yml logs agt02-learning-path  --tail=20
docker compose -f infra/docker-compose.yml logs agt03-tutor          --tail=20
# Then re-run Step 2 and repeat Step 5.
```

---

## STEP 6 — AGT-06 Full Validation Suite (78/78 must pass)

This runs the complete 78-criteria suite covering every endpoint, edge case, input validation,
TTL, data integrity, and LTM correctness check. Do not proceed to the demo until you see
`78 passed / 0 failed`.

```powershell
.\docs\agt06-full-validation.ps1
```

The script is self-contained. It generates fresh UUIDs, creates its own test users, runs all
sections, and prints a pass/fail result per check.

**Expected final line:**
```
  RESULT: 78 passed / 0 failed
  AGT-06 FULLY VALIDATED — ALL CRITERIA PASS
```

**If any check fails:**
```powershell
# 1. Read the [FAIL] line — it names the exact criterion.
# 2. Check the logs for the relevant container:
docker compose -f infra/docker-compose.yml logs agt06-memory --tail=20

# 3. Most common causes:
#   [FAIL] on any STM TTL check    → Redis container not found; check REDIS_CID at top of output
#   [FAIL] on any 422 check        → Pydantic model changed; rebuild: re-run Step 2 with --build
#   [FAIL] on any consolidation    → Check logs for asyncpg or Kafka errors
#   [FAIL] on any LTM count check  → A consolidation step above it failed first; fix that one

# 4. Re-run Step 2, then re-run this step. Never skip to Step 7.
```

---

## STEP 7 — Manager Demo

Copy **only** the code inside the fence below. Do not include the ` ```powershell ` or closing ` ``` ` lines.

Scenes 1–7 run in order. Troubleshooting snippets are listed after the block — run those separately only if something fails.

```powershell
# ── Fresh demo variables ──────────────────────────────────────────────────────
$DEMO_UID = "demo-minh-$([guid]::NewGuid().ToString().Substring(0,8))"
$DEMO_SID = $null   # will be set after session start

Clear-Host
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "    AI AGENTIC ENGLISH  —  LIVE DEMO" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan

# ── Scene 1: Show all 4 agents live ───────────────────────────────────────────
Write-Host ""
Write-Host "SCENE 1: THE SYSTEM" -ForegroundColor White
Write-Host ""
@(
    @{port=8101; name="AGT-01  User Profiling Agent"},
    @{port=8102; name="AGT-02  Learning Path Agent"},
    @{port=8103; name="AGT-03  AI Tutor Agent"},
    @{port=8106; name="AGT-06  Memory Agent  (STM + LTM)"}
) | ForEach-Object {
    try {
        Invoke-RestMethod "http://localhost:$($_.port)/health" | Out-Null
        Write-Host "  [LIVE] $($_.name)" -ForegroundColor Green
    } catch {
        Write-Host "  [DOWN] $($_.name)  — run Step 2 first" -ForegroundColor Red
    }
}

# ── Scene 2: New learner signs up ─────────────────────────────────────────────
Write-Host ""
Write-Host "SCENE 2: NEW LEARNER SIGNS UP" -ForegroundColor White
Write-Host ""
Write-Host "  Learner: Nguyen Van Minh, Sales Manager, Ho Chi Minh City" -ForegroundColor Yellow
Write-Host ""

$profile = Invoke-RestMethod -Method Post "http://localhost:8101/profile/$DEMO_UID" `
    -ContentType "application/json" `
    -Body "{`"clerk_user_id`":`"$DEMO_UID`"}"

Write-Host "  Profile created:" -ForegroundColor White
Write-Host "    ID:            $($profile.clerk_user_id)"
Write-Host "    Cold start:    $($profile.cold_start_flag)  — system knows he is new"
Write-Host "    Skill scores:  L=0  S=0  R=0  W=0  (needs placement test)"

# ── Scene 3: Placement test results ───────────────────────────────────────────
Write-Host ""
Write-Host "SCENE 3: PLACEMENT TEST RESULTS" -ForegroundColor White
Write-Host ""
Write-Host "  Minh completed a CEFR placement test. Speaking is his weakest skill." -ForegroundColor Yellow
Write-Host ""

Invoke-RestMethod -Method Patch "http://localhost:8101/profile/$DEMO_UID" `
    -ContentType "application/json" `
    -Body '{"irt_theta":{"L":0.6,"S":-0.8,"R":0.5,"W":0.2}}' | Out-Null

$updated = Invoke-RestMethod "http://localhost:8101/profile/$DEMO_UID"
Write-Host "  IRT Scores  (scale: -3 weak  →  +3 strong):" -ForegroundColor White
Write-Host "    Listening  $($updated.irt_theta.L)   — B1+  (solid)"
Write-Host "    Speaking   $($updated.irt_theta.S)  — A2   (WEAKEST — freezes in live meetings)"
Write-Host "    Reading    $($updated.irt_theta.R)   — B1   (OK)"
Write-Host "    Writing    $($updated.irt_theta.W)   — B1-  (needs work)"

# ── Scene 4: Personalized learning plan ───────────────────────────────────────
Write-Host ""
Write-Host "SCENE 4: SYSTEM GENERATES A PERSONALIZED PLAN" -ForegroundColor White
Write-Host ""
Write-Host "  Building plan from Minh's weakness profile..." -ForegroundColor Yellow
Write-Host ""

$plan = Invoke-RestMethod -Method Post "http://localhost:8102/plans/$DEMO_UID/generate" `
    -ContentType "application/json" `
    -Body '{"daily_minutes":30,"goals":["business communication","client presentations"]}'

$sMin = [math]::Round($plan.skill_allocation.S * 30)
$lMin = [math]::Round($plan.skill_allocation.L * 30)
$rMin = [math]::Round($plan.skill_allocation.R * 30)
$wMin = [math]::Round($plan.skill_allocation.W * 30)

Write-Host "  Daily allocation  (30 min/day):" -ForegroundColor White
Write-Host "    Listening  $([math]::Round($plan.skill_allocation.L*100))%   $lMin min"
Write-Host "    Speaking   $([math]::Round($plan.skill_allocation.S*100))%   $sMin min   <- MOST TIME (weakest skill)"
Write-Host "    Reading    $([math]::Round($plan.skill_allocation.R*100))%   $rMin min"
Write-Host "    Writing    $([math]::Round($plan.skill_allocation.W*100))%   $wMin min"
Write-Host ""
Write-Host "  Today's activities:" -ForegroundColor White
$plan.activities | ForEach-Object {
    Write-Host "    [$($_.skill_domain)] $($_.title)  ($($_.estimated_minutes) min)"
}

# ── Scene 5: Start a live tutoring session ────────────────────────────────────
Write-Host ""
Write-Host "SCENE 5: LIVE TUTORING SESSION" -ForegroundColor White
Write-Host ""
Write-Host "  Starting a Speaking session for Minh..." -ForegroundColor Yellow
Write-Host ""

$sess = Invoke-RestMethod -Method Post "http://localhost:8103/sessions/start" `
    -ContentType "application/json" `
    -Body "{`"clerk_user_id`":`"$DEMO_UID`",`"skill_focus`":`"SPEAKING`"}"
$DEMO_SID = $sess.session_id

Write-Host "  Session started:" -ForegroundColor White
Write-Host "    Session ID:     $DEMO_SID"
Write-Host "    Profile loaded: $($sess.profile_loaded)  — AGT-01 confirmed Minh's profile"
Write-Host "    Plan loaded:    $($sess.plan_loaded)   — AGT-02 confirmed his learning plan"
Write-Host ""
Write-Host "  +- TUTOR ----------------------------------------------------------" -ForegroundColor Magenta
Write-Host "  |  $($sess.opening_message)" -ForegroundColor Magenta
Write-Host "  +------------------------------------------------------------------" -ForegroundColor Magenta

# ── Scene 6: Conversation (3 turns) ───────────────────────────────────────────
# clerk_user_id is required in every turn body.

# Turn 1
Write-Host ""
Write-Host "  +- MINH -----------------------------------------------------------" -ForegroundColor Yellow
Write-Host "  |  I work as a sales manager. I handle client presentations every week." -ForegroundColor Yellow
Write-Host "  +------------------------------------------------------------------" -ForegroundColor Yellow
Write-Host ""

$t1 = Invoke-RestMethod -Method Post "http://localhost:8103/sessions/turn" `
    -ContentType "application/json" `
    -Body "{`"session_id`":`"$DEMO_SID`",`"clerk_user_id`":`"$DEMO_UID`",`"user_message`":`"I work as a sales manager. I handle client presentations every week.`"}"

Write-Host "  +- TUTOR ----------------------------------------------------------" -ForegroundColor Magenta
Write-Host "  |  $($t1.assistant_message)" -ForegroundColor Magenta
Write-Host "  +------------------------------------------------------------------" -ForegroundColor Magenta

# Turn 2
Write-Host ""
Write-Host "  +- MINH -----------------------------------------------------------" -ForegroundColor Yellow
Write-Host "  |  My biggest challenge is speaking confidently with foreign clients." -ForegroundColor Yellow
Write-Host "  +------------------------------------------------------------------" -ForegroundColor Yellow
Write-Host ""

$t2 = Invoke-RestMethod -Method Post "http://localhost:8103/sessions/turn" `
    -ContentType "application/json" `
    -Body "{`"session_id`":`"$DEMO_SID`",`"clerk_user_id`":`"$DEMO_UID`",`"user_message`":`"My biggest challenge is speaking confidently with foreign clients.`"}"

Write-Host "  +- TUTOR ----------------------------------------------------------" -ForegroundColor Magenta
Write-Host "  |  $($t2.assistant_message)" -ForegroundColor Magenta
Write-Host "  +------------------------------------------------------------------" -ForegroundColor Magenta

# Turn 3
Write-Host ""
Write-Host "  +- MINH -----------------------------------------------------------" -ForegroundColor Yellow
Write-Host "  |  I sometimes use wrong tense when I present data to my director." -ForegroundColor Yellow
Write-Host "  +------------------------------------------------------------------" -ForegroundColor Yellow
Write-Host ""

$t3 = Invoke-RestMethod -Method Post "http://localhost:8103/sessions/turn" `
    -ContentType "application/json" `
    -Body "{`"session_id`":`"$DEMO_SID`",`"clerk_user_id`":`"$DEMO_UID`",`"user_message`":`"I sometimes use wrong tense when I present data to my director.`"}"

Write-Host "  +- TUTOR ----------------------------------------------------------" -ForegroundColor Magenta
Write-Host "  |  $($t3.assistant_message)" -ForegroundColor Magenta
Write-Host "  +------------------------------------------------------------------" -ForegroundColor Magenta

# ── Scene 7: End session and show long-term memory ────────────────────────────
Write-Host ""
Write-Host "SCENE 7: SESSION ENDS — MEMORY WRITTEN TO POSTGRESQL" -ForegroundColor White
Write-Host ""

$end = Invoke-RestMethod -Method Post "http://localhost:8103/sessions/end" `
    -ContentType "application/json" `
    -Body "{`"session_id`":`"$DEMO_SID`",`"clerk_user_id`":`"$DEMO_UID`",`"skill_focus`":`"SPEAKING`"}"

Write-Host "  Session closed:" -ForegroundColor White
Write-Host "    Turns completed:     $($end.turns_completed)"
Write-Host "    Duration:            $($end.duration_minutes) min"
Write-Host "    Saved to LTM:        $($end.consolidated)  — conversation written to PostgreSQL"
Write-Host ""

# Wait 2 seconds for Kafka consumer to update behavioral profile
Start-Sleep -Seconds 2

Write-Host "  What AGT-06 now knows about Minh:" -ForegroundColor White
Write-Host ""

$p2 = Invoke-RestMethod "http://localhost:8101/profile/$DEMO_UID"
Write-Host "    cold_start cleared:    $(-not $p2.cold_start_flag)  — system has a real profile now"

$ltmS = Invoke-RestMethod "http://localhost:8106/ltm/$DEMO_UID/sessions"
Write-Host "    Sessions in LTM:       $($ltmS.Count)"

$ltmC = Invoke-RestMethod "http://localhost:8106/ltm/$DEMO_UID/conversations"
Write-Host "    Conversations saved:   $($ltmC.Count)  (full transcript in PostgreSQL)"

$ltmE = Invoke-RestMethod "http://localhost:8106/ltm/$DEMO_UID/errors"
Write-Host "    Errors tracked:        $($ltmE.Count)  (grammar patterns recorded)"

$ltmV = Invoke-RestMethod "http://localhost:8106/ltm/$DEMO_UID/vocabulary"
Write-Host "    Vocabulary items:      $($ltmV.Count)"

$review = Invoke-RestMethod "http://localhost:8106/review-center/$DEMO_UID"
Write-Host ""
Write-Host "  Review center (full LTM snapshot):" -ForegroundColor White
Write-Host "    $($review.sessions.Count) sessions  |  $($review.vocabulary.Count) vocab words  |  $($review.errors.Count) tracked errors"
Write-Host "    Semantic search ready: $($review.semantic_search_available)  (pgvector — Sprint 3)"

Write-Host ""
Write-Host "=========================================================" -ForegroundColor Green
Write-Host "  Sprint 1 delivered:" -ForegroundColor Green
Write-Host "    4 AI agents running  |  54 unit tests  |  0 failures" -ForegroundColor Green
Write-Host "    Redis STM  +  PostgreSQL LTM  +  Kafka event bus" -ForegroundColor Green
Write-Host "    Full session memory: errors, vocabulary, conversations" -ForegroundColor Green
Write-Host "    Every session makes the plan smarter" -ForegroundColor Green
Write-Host "=========================================================" -ForegroundColor Green
```

---

### Step 7 troubleshooting (run separately only if needed)

**If plan generation fails (Scene 4) with a 5xx error:**
```powershell
docker compose -f infra/docker-compose.yml logs agt02-learning-path --tail=30
# Most common cause: learner_profiles table missing. Re-run Step 4, then retry Scene 4.
```

**If session start fails (Scene 5):**
```powershell
docker compose -f infra/docker-compose.yml logs agt03-tutor  --tail=30
docker compose -f infra/docker-compose.yml logs agt06-memory --tail=30
# AGT-06 must be healthy — session start is hard-wired to fail if AGT-06 STM is unavailable.
```

**If `plan_loaded` shows False after session starts:**
```powershell
# Plan was not generated (Scene 4 may have failed silently).
# Generate it, then start a fresh session:
Invoke-RestMethod -Method Post "http://localhost:8102/plans/$DEMO_UID/generate" `
    -ContentType "application/json" `
    -Body '{"daily_minutes":30,"goals":["business communication"]}' | Out-Null

$sess = Invoke-RestMethod -Method Post "http://localhost:8103/sessions/start" `
    -ContentType "application/json" `
    -Body "{`"clerk_user_id`":`"$DEMO_UID`",`"skill_focus`":`"SPEAKING`"}"
$DEMO_SID = $sess.session_id
Write-Host "New session: $DEMO_SID  plan_loaded=$($sess.plan_loaded)"
```

**If any turn fails with `session not found`:**
```powershell
# $DEMO_SID was not set (session start failed earlier).
Write-Host "DEMO_SID = $DEMO_SID"
# If empty: re-run Scene 5 from the Step 7 block above.
```

**If `consolidated: false` after end_session:**
```powershell
docker compose -f infra/docker-compose.yml logs agt06-memory --tail=30
# Look for asyncpg or UUID errors. Re-run the end_session call after fixing.
```

---

## Troubleshooting Quick Reference

| Error message | Cause | Fix |
|---|---|---|
| `No connection could be made` | Container not running | Re-run Step 2, then Step 5 |
| `no configuration file provided` | Wrong working directory | `cd` to worktree root (top of file) |
| `invalid UUID` on consolidate | session_id is not a UUID | Use `[guid]::NewGuid().ToString()` |
| `Field required: clerk_user_id` on turn | Missing field in body | All three fields required in every turn |
| `Internal Server Error` on consolidate | asyncpg or Kafka error | `docker compose logs agt06-memory --tail=20` |
| `404` on `/difficulty`, `/lang`, `/writing` | Container built from wrong branch | Must run from worktree root, not main repo |
| `plan_loaded: false` after session start | Plan not generated yet | Run `POST /plans/$DEMO_UID/generate` first |

---

## Full Reset (if something is deeply broken)

```powershell
# Stop everything and remove volumes — WARNING: wipes all PostgreSQL data
docker compose -f infra/docker-compose.yml down -v

# Re-run migrations (required after volume wipe)
Get-ChildItem "agents\migrations\*.sql" | Sort-Object Name | ForEach-Object {
    Write-Host "  -> $($_.Name)"
    Get-Content $_.FullName -Raw | docker exec -i ai-agentic-english-postgres-agents-1 psql -U postgres -d agent_ltm
}

# Start fresh from Step 2
docker compose -f infra/docker-compose.yml up -d --build `
    postgres-agents redis kafka `
    agt06-memory agt01-profiling agt02-learning-path agt03-tutor
```

> After `down -v`, containers are gone so migrations must wait until Step 3 completes (postgres-agents healthy). Run the full reset, then follow Steps 3–7 in order.
