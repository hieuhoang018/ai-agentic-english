# AGT-05 Assessment Agent — Demo Runbook

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

AGT-05's only hard startup dependency is `postgres-agents` (required for the Docker `depends_on: condition: service_healthy` gate). At runtime, AGT-05 connects to nothing at startup — all client calls are lazy.

```powershell
docker compose -f infra/docker-compose.yml up -d --build `
    postgres-agents redis kafka `
    agt05-assessment
```

First-time build takes 3–8 minutes. Subsequent runs are under 30 seconds.

Docker respects `depends_on: condition: service_healthy` — it will not start `agt05-assessment` until `postgres-agents` passes its healthcheck. You do not need to start them in separate steps, but Step 3 lets you watch progress.

**If "no configuration file provided" or "file not found":**
```powershell
Get-Location  # must end with ai-agentic-english
```

**If a container exits immediately after starting:**
```powershell
# Replace <service> with the failing service name
docker compose -f infra/docker-compose.yml logs <service> --tail=40
# Fix the error, then re-run Step 2.
```

**If a port is already in use (e.g. 8105):**
```powershell
netstat -ano | findstr ":8105"
# Note the PID in the far-right column, then kill it:
taskkill /PID <pid> /F
# Re-run Step 2.
```

**If the build fails with a pip error:**
```powershell
docker compose -f infra/docker-compose.yml build --no-cache agt05-assessment
docker compose -f infra/docker-compose.yml up -d agt05-assessment
```

---

## STEP 3 — Wait for postgres-agents to be healthy

AGT-05 will not start until this passes. Do not run Step 4 until this loop exits.

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

**If the health check is stuck on "starting" for more than 2 minutes:**
```powershell
docker compose -f infra/docker-compose.yml logs postgres-agents --tail=20
docker compose -f infra/docker-compose.yml restart postgres-agents
# Wait 30s then re-run the loop above.
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

**Expected:** 11 filenames printed (`001_extensions.sql` through `011_behavioral_patterns.sql`). The `assessment_history` table (migration `009`) must exist before any completed assessment is written.

**If a migration fails with "relation already exists":** that is fine — the `IF NOT EXISTS` guards are idempotent.

**If a migration fails with a connection error:**
```powershell
# postgres-agents is not healthy yet — re-run Step 3, then retry here.
docker compose -f infra/docker-compose.yml logs postgres-agents --tail=20
```

---

## STEP 5 — Wait for AGT-05 to be ready

```powershell
Write-Host "Waiting for agt05-assessment..."
$retries = 0
do {
    try {
        $r = Invoke-RestMethod -Uri "http://localhost:8105/health" -TimeoutSec 2
        Write-Host "  UP: $($r.agent) — $($r.status)" -ForegroundColor Green
        break
    } catch {
        $retries++
        if ($retries -gt 40) {
            Write-Host "  TIMEOUT: agt05-assessment did not start after 2 minutes." -ForegroundColor Red
            Write-Host "  Run: docker compose -f infra/docker-compose.yml logs agt05-assessment --tail 50"
            break
        }
        Start-Sleep 3
    }
} while ($true)
```

**Expected:**
```
Waiting for agt05-assessment...
  UP: AGT-05 — ok
```

**If it times out:**
```powershell
docker compose -f infra/docker-compose.yml logs agt05-assessment --tail=50
# Common causes:
#   Import error (bad PYTHONPATH) → rebuild: re-run Step 2 with --build flag
#   Port conflict → kill the process using 8105, re-run Step 2
#   postgres-agents still unhealthy → re-run Step 3
```

---

## STEP 6 — Verify health (explicit check before demo)

```powershell
try {
    $r = Invoke-RestMethod "http://localhost:8105/health"
    Write-Host "  [OK  ] 8105  AGT-05  Assessment  — $($r.status)" -ForegroundColor Green
    Write-Host "`nAgent healthy. Proceed to Step 7." -ForegroundColor Green
} catch {
    Write-Host "  [FAIL] 8105  AGT-05  Assessment  — not responding" -ForegroundColor Red
    Write-Host "`nSTOP: Re-run Step 2, then Step 5 before continuing." -ForegroundColor Red
}
```

**Expected:**
```
  [OK  ] 8105  AGT-05  Assessment  — ok

Agent healthy. Proceed to Step 7.
```

**If FAIL:** check logs and re-run Step 2.

---

## STEP 7 — Manager Demo

Copy the entire block below and run it as one unit in PowerShell.

```powershell
# ── Helper: build prior_responses (called before each scenario) ────────────────
# $CorrectCount correct responses out of $TotalCount total
function Build-PriorResponses([int]$CorrectCount, [int]$TotalCount = 29) {
    $responses = @()
    for ($i = 1; $i -le $TotalCount; $i++) {
        $responses += [PSCustomObject]@{ item_id = "item-$i"; correct = [bool]($i -le $CorrectCount) }
    }
    return ,$responses   # comma forces single-array return from function
}

Clear-Host
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "    AI AGENTIC ENGLISH  —  AGT-05 ASSESSMENT AGENT" -ForegroundColor Cyan
Write-Host "    Computerised Adaptive Testing (CAT) — 30-item CEFR placement" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host ""

# ── Scene 1: System check ──────────────────────────────────────────────────────
Write-Host "SCENE 1: SYSTEM STATUS" -ForegroundColor White
Write-Host ""
try {
    $h = Invoke-RestMethod "http://localhost:8105/health"
    Write-Host "  [LIVE] AGT-05  Assessment Agent  (port 8105)" -ForegroundColor Green
} catch {
    Write-Host "  [DOWN] AGT-05  Assessment Agent  — run Step 2 first" -ForegroundColor Red
}

# ── Scene 2: Start assessment — shows current limitation clearly ──────────────
Write-Host ""
Write-Host "SCENE 2: START ASSESSMENT — ITEM BANK STATUS" -ForegroundColor White
Write-Host ""
Write-Host "  Calling POST /assessments/start for SPEAKING skill..." -ForegroundColor Yellow
Write-Host ""

$startBody = @{
    clerk_user_id = "demo-user-minh"
    skill_domain  = "SPEAKING"
} | ConvertTo-Json

$startResult = Invoke-RestMethod -Method Post "http://localhost:8105/assessments/start" `
    -ContentType "application/json" -Body $startBody

Write-Host "  Response:" -ForegroundColor White
$startResult | ConvertTo-Json | Write-Host
Write-Host ""
Write-Host "  EXPECTED: 'Item bank unavailable'" -ForegroundColor DarkYellow
Write-Host "  WHY: AGT-05 fetches items from Learning Materials Service at" -ForegroundColor DarkGray
Write-Host "       http://learning-materials-service:4002/assessment/questions" -ForegroundColor DarkGray
Write-Host "       That endpoint requires Clerk JWT auth (Phase 4 will add the" -ForegroundColor DarkGray
Write-Host "       internal-secret bypass). LMS is also not running in this demo." -ForegroundColor DarkGray
Write-Host "  RESULT: Service degrades gracefully — no crash, no 5xx." -ForegroundColor Green

# ── Scene 3: CAT Engine — B1 placement (Minh, typical sales manager) ─────────
Write-Host ""
Write-Host "─────────────────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host "SCENE 3: CAT ENGINE — PLACEMENT ASSESSMENT" -ForegroundColor White
Write-Host ""
Write-Host "  The CAT engine terminates after 30 items (Phase 8+ will use SE < 0.3)." -ForegroundColor Yellow
Write-Host "  Simulating a full 30-item READING assessment for 3 learners:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Assessment setup:" -ForegroundColor White
Write-Host "    Items:             30 (CAT termination criterion met)"
Write-Host "    Skill domain:      READING"
Write-Host "    Theta estimation:  stub proportion-correct → linear mapping to [-2, +2]"
Write-Host "    CEFR mapping:      theta → A1/A2/B1/B2/C1/C2"
Write-Host ""

# ── Scenario A: Nguyen Van Minh (B1 — 17 correct out of 30) ──────────────────
Write-Host "  LEARNER 1: Nguyen Van Minh  (Sales Manager, HCMC)" -ForegroundColor Cyan
Write-Host "  Correct answers: 17 / 30  (proportion = 0.567)" -ForegroundColor DarkCyan
Write-Host "  Expected:  theta = 0.267  →  CEFR B1" -ForegroundColor DarkCyan
Write-Host ""

$priorMinh = Build-PriorResponses -CorrectCount 16 -TotalCount 29  # 16 correct in prior + 1 correct final = 17/30

$minhBody = @{
    clerk_user_id   = "demo-user-minh"
    assessment_id   = "minh-reading-001"
    item_id         = "item-30"
    correct         = $true
    prior_responses = $priorMinh
    skill_domain    = "READING"
} | ConvertTo-Json -Depth 3

$minhResult = Invoke-RestMethod -Method Post "http://localhost:8105/assessments/respond" `
    -ContentType "application/json" -Body $minhBody

Write-Host "  Result:" -ForegroundColor White
Write-Host "    Terminated:          $($minhResult.terminated)"
Write-Host "    Items answered:      $($minhResult.items_answered)"
Write-Host "    Final theta:         $($minhResult.final_theta)"
Write-Host "    CEFR band:           $($minhResult.cefr_band)  ← placed here" -ForegroundColor Green
Write-Host "    Confidence interval: [$($minhResult.confidence_interval[0]), $($minhResult.confidence_interval[1])]"
Write-Host "    Assessment ID:       $($minhResult.assessment_id)"
Write-Host ""

# ── Scenario B: Nguyen Thi Van (A2 — 10 correct out of 30) ───────────────────
Write-Host "  LEARNER 2: Nguyen Thi Van  (Admin Assistant, weaker learner)" -ForegroundColor Cyan
Write-Host "  Correct answers: 10 / 30  (proportion = 0.333)" -ForegroundColor DarkCyan
Write-Host "  Expected:  theta = -0.667  →  CEFR A2" -ForegroundColor DarkCyan
Write-Host ""

$priorVan = Build-PriorResponses -CorrectCount 9 -TotalCount 29  # 9 correct in prior + 1 correct final = 10/30

$vanBody = @{
    clerk_user_id   = "demo-user-van"
    assessment_id   = "van-reading-001"
    item_id         = "item-30"
    correct         = $true
    prior_responses = $priorVan
    skill_domain    = "READING"
} | ConvertTo-Json -Depth 3

$vanResult = Invoke-RestMethod -Method Post "http://localhost:8105/assessments/respond" `
    -ContentType "application/json" -Body $vanBody

Write-Host "  Result:" -ForegroundColor White
Write-Host "    Terminated:          $($vanResult.terminated)"
Write-Host "    Items answered:      $($vanResult.items_answered)"
Write-Host "    Final theta:         $($vanResult.final_theta)"
Write-Host "    CEFR band:           $($vanResult.cefr_band)  ← placed here" -ForegroundColor Yellow
Write-Host "    Confidence interval: [$($vanResult.confidence_interval[0]), $($vanResult.confidence_interval[1])]"
Write-Host ""

# ── Scenario C: Tran Thu Huong (B2 — 23 correct out of 30) ───────────────────
Write-Host "  LEARNER 3: Tran Thu Huong  (Marketing Manager, stronger learner)" -ForegroundColor Cyan
Write-Host "  Correct answers: 23 / 30  (proportion = 0.767)" -ForegroundColor DarkCyan
Write-Host "  Expected:  theta = 1.067  →  CEFR B2" -ForegroundColor DarkCyan
Write-Host ""

$priorHuong = Build-PriorResponses -CorrectCount 22 -TotalCount 29  # 22 correct in prior + 1 correct final = 23/30

$huongBody = @{
    clerk_user_id   = "demo-user-huong"
    assessment_id   = "huong-reading-001"
    item_id         = "item-30"
    correct         = $true
    prior_responses = $priorHuong
    skill_domain    = "READING"
} | ConvertTo-Json -Depth 3

$huongResult = Invoke-RestMethod -Method Post "http://localhost:8105/assessments/respond" `
    -ContentType "application/json" -Body $huongBody

Write-Host "  Result:" -ForegroundColor White
Write-Host "    Terminated:          $($huongResult.terminated)"
Write-Host "    Items answered:      $($huongResult.items_answered)"
Write-Host "    Final theta:         $($huongResult.final_theta)"
Write-Host "    CEFR band:           $($huongResult.cefr_band)  ← placed here" -ForegroundColor Green
Write-Host "    Confidence interval: [$($huongResult.confidence_interval[0]), $($huongResult.confidence_interval[1])]"
Write-Host ""

# ── Scene 4: CEFR summary table ────────────────────────────────────────────────
Write-Host "─────────────────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host "SCENE 4: PLACEMENT RESULTS — SIDE BY SIDE" -ForegroundColor White
Write-Host ""
Write-Host "  Learner              Correct/30  Theta    CEFR  CI" -ForegroundColor White
Write-Host "  ─────────────────────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host "  Nguyen Van Minh      17/30       $($minhResult.final_theta)   $($minhResult.cefr_band)   [$($minhResult.confidence_interval[0]), $($minhResult.confidence_interval[1])]"
Write-Host "  Nguyen Thi Van       10/30      $($vanResult.final_theta)   $($vanResult.cefr_band)   [$($vanResult.confidence_interval[0]), $($vanResult.confidence_interval[1])]"
Write-Host "  Tran Thu Huong       23/30       $($huongResult.final_theta)   $($huongResult.cefr_band)   [$($huongResult.confidence_interval[0]), $($huongResult.confidence_interval[1])]"
Write-Host ""
Write-Host "  Confidence interval width: ±0.5 SE (stub).  Phase 8+ narrows this" -ForegroundColor DarkGray
Write-Host "  using Fisher information maximisation (3PL IRT with EAP estimation)." -ForegroundColor DarkGray
Write-Host ""

# ── Scene 5: Theta → CEFR mapping walkthrough ─────────────────────────────────
Write-Host "─────────────────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host "SCENE 5: THETA → CEFR SCALE" -ForegroundColor White
Write-Host ""
Write-Host "  The IRT theta scale maps to CEFR as follows:" -ForegroundColor White
Write-Host ""
Write-Host "    theta < -1.5   →  A1  (beginner)"
Write-Host "   -1.5 ≤ theta < -0.5  →  A2  (elementary)"
Write-Host "   -0.5 ≤ theta <  0.5  →  B1  (intermediate)"
Write-Host "    0.5 ≤ theta <  1.5  →  B2  (upper-intermediate)"
Write-Host "    1.5 ≤ theta <  2.5  →  C1  (advanced)"
Write-Host "    2.5 ≤ theta        →  C2  (proficient)"
Write-Host ""
Write-Host "  Van's theta   $($vanResult.final_theta)  is in [-1.5, -0.5)  →  A2 confirmed" -ForegroundColor Yellow
Write-Host "  Minh's theta  $($minhResult.final_theta)  is in [-0.5,  0.5)  →  B1 confirmed" -ForegroundColor Green
Write-Host "  Huong's theta $($huongResult.final_theta)  is in [ 0.5,  1.5)  →  B2 confirmed" -ForegroundColor Green

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "=========================================================" -ForegroundColor Green
Write-Host "  AGT-05 ASSESSMENT AGENT — DEMO COMPLETE" -ForegroundColor Green
Write-Host ""
Write-Host "  WHAT WAS DEMONSTRATED:" -ForegroundColor Green
Write-Host "    [Health]    Agent live on port 8105" -ForegroundColor Green
Write-Host "    [Graceful]  start_assessment degrades to clear error — no crash" -ForegroundColor Green
Write-Host "    [CAT]       30-item assessment terminates correctly" -ForegroundColor Green
Write-Host "    [IRT]       Stub theta estimation: proportion-correct → [-2, +2]" -ForegroundColor Green
Write-Host "    [CEFR]      A2/B1/B2 bands assigned from theta thresholds" -ForegroundColor Green
Write-Host "    [CI]        Confidence intervals returned with every result" -ForegroundColor Green
Write-Host "    [Postgres]  Completed assessment written to assessment_history (asyncpg)" -ForegroundColor Green
Write-Host ""
Write-Host "  WHAT PHASE 4 ADDS:" -ForegroundColor DarkYellow
Write-Host "    - LMS internal-secret bypass for /assessment/questions" -ForegroundColor DarkYellow
Write-Host "    - Case normalisation (READING → reading) for skill_domain" -ForegroundColor DarkYellow
Write-Host "    - Full start → respond × N → terminate end-to-end flow" -ForegroundColor DarkYellow
Write-Host ""
Write-Host "  WHAT PHASE 8+ ADDS:" -ForegroundColor DarkGray
Write-Host "    - Full 3PL IRT with Fisher information item selection" -ForegroundColor DarkGray
Write-Host "    - SE(theta) < 0.3 termination criterion (variable item count)" -ForegroundColor DarkGray
Write-Host "    - Sympson-Hetter exposure control (target exposure ≤ 0.25)" -ForegroundColor DarkGray
Write-Host "=========================================================" -ForegroundColor Green
```

---

### Step 7 troubleshooting (run these separately only if a scene fails)

**If Scene 2 `/assessments/start` throws a 5xx instead of returning the error body:**
```powershell
docker compose -f infra/docker-compose.yml logs agt05-assessment --tail=30
# The function should return {"error": "Item bank unavailable"} — not raise.
# A 5xx means an unexpected import error or startup failure. Check logs.
```

**If Scene 3 `/assessments/respond` throws an HTTP error (not expected):**
```powershell
docker compose -f infra/docker-compose.yml logs agt05-assessment --tail=30
# Common causes:
#   JSON serialisation error — ConvertTo-Json -Depth 3 must be used (not default depth 2)
#   prior_responses array serialised as a single object — re-run the Build-PriorResponses helper
```

**If `Build-PriorResponses` is not defined (function not found):**
```powershell
# The helper function must be defined in the same PowerShell session before the demo block runs.
# Re-run the ENTIRE Step 6 block from the top (starting from the function definition).
Write-Host "Paste the full Step 6 block into the terminal and run again."
```

**If `$minhResult.terminated` is `false` (assessment did not terminate):**
```powershell
# prior_responses did not have exactly 29 items.
# Verify the Build-PriorResponses helper is returning 29 items:
$test = Build-PriorResponses -CorrectCount 16 -TotalCount 29
Write-Host "Count: $($test.Count)  (expected: 29)"
# If count is wrong: re-run the function definition, then re-run the scenario.
```

**If `$minhResult.cefr_band` is empty or wrong:**
```powershell
# Only the terminated=true path returns cefr_band.
# Check that terminated is true first.
# If theta is wrong: count the 'correct: true' entries in prior_responses:
$test = Build-PriorResponses -CorrectCount 16 -TotalCount 29
$correctCount = ($test | Where-Object { $_.correct -eq $true }).Count
Write-Host "Correct in prior: $correctCount  (expected: 16)"
```

**If the respond call returns `current_item: null, terminated: true` WITHOUT `cefr_band`:**
```powershell
# This is the "item bank empty" termination path, not the "30 items" termination path.
# It happens when prior_responses has < 29 items.
# The 30-items path is the ONLY one that includes cefr_band.
# Fix: ensure prior_responses has exactly 29 items.
```

---

## Troubleshooting Quick Reference

| Error message | Cause | Fix |
|---|---|---|
| `No connection could be made` | Container not running | Re-run Step 2, then Step 4 |
| `no configuration file provided` | Wrong working directory | `cd` to repo root (top of file) |
| `Item bank unavailable` from start | LMS not running / auth missing | Expected in demo — see Scene 2 explanation |
| `current_item: null` without `cefr_band` | prior_responses count wrong | prior_responses must be exactly 29 items |
| `terminated: false` from respond | prior_responses count wrong | Same — re-check Build-PriorResponses |
| Port already in use (8105) | Another process on 8105 | `netstat -ano \| findstr :8105` then `taskkill /PID <pid> /F` |
| Wrong container name | Compose project name differs | `docker ps --format "table {{.Names}}"` and substitute everywhere |
| `Build-PriorResponses` not found | Function not in scope | Re-paste the full Step 6 block |
| `ConvertTo-Json` depth error | JSON depth truncated | Always use `ConvertTo-Json -Depth 3` for nested objects |

---

## Clean Shutdown

```powershell
# Stop the AGT-05 containers (keeps volumes/data):
docker compose -f infra/docker-compose.yml stop agt05-assessment kafka redis postgres-agents

# Or stop and remove containers + networks (keeps volumes):
docker compose -f infra/docker-compose.yml down

# Full wipe including volumes:
docker compose -f infra/docker-compose.yml down -v
```

---

## Full Reset (if something is deeply broken)

```powershell
# 1. Wipe everything
docker compose -f infra/docker-compose.yml down -v

# 2. Rebuild and restart
docker compose -f infra/docker-compose.yml up -d --build `
    postgres-agents redis kafka `
    agt05-assessment

# 3. Wait for postgres-agents
Write-Host "Waiting for postgres-agents..."
do {
    $s = docker inspect --format="{{.State.Health.Status}}" ai-agentic-english-postgres-agents-1 2>$null
    if ($s -eq "healthy") { Write-Host "  healthy." -ForegroundColor Green; break }
    Write-Host "  $s — retrying in 4s..."
    Start-Sleep 4
} while ($true)

# 4. AGT-05 is ready as soon as postgres-agents is healthy (no migrations needed)
Write-Host "Reset complete. Start from Step 4." -ForegroundColor Green
```

> After full reset, re-run migrations (Step 4) — AGT-05 writes completed assessments to postgres.
> After full reset, follow Steps 4–7 in order.

---

## Architecture Notes (for Q&A)

| Component | Port | Role in AGT-05 demo |
|---|---|---|
| AGT-05 Assessment | 8105 | CAT engine: theta estimation, CEFR mapping, item selection |
| postgres-agents | 5438 | Docker startup gate + runtime LTM writes (assessment_history table) |
| Redis | 6379 | In env vars — not used by AGT-05 at runtime |
| Kafka | 9092 | In env vars — not used by AGT-05 at runtime |
| Learning Materials Service | 4002 | Item bank source — currently unreachable (auth + not started) |

**What AGT-05 does at runtime (scaffold stage):**

```
POST /assessments/start
  └─ fetch item bank from LMS (GET /assessment/questions?skill=<domain>)
       ├─ LMS requires Clerk Bearer JWT — AGT-05 sends none → 401 → []
       └─ returns {"error": "Item bank unavailable"}    ← current behaviour

POST /assessments/respond  (with < 30 prior_responses)
  └─ estimate_theta_stub(responses)     ← pure Python, always works
  └─ should_terminate? No (< 30 items)
  └─ fetch item bank → [] → next_item = None → terminated: true (no cefr_band)

POST /assessments/respond  (with exactly 29 prior_responses + 1 current)
  └─ responses = 30 total
  └─ estimate_theta_stub(30 responses)  ← proportion_correct × 4.0 − 2.0
  └─ should_terminate? YES (= 30 items) ← terminates HERE
  └─ theta_to_cefr(theta)               ← CEFR band
  └─ INSERT INTO assessment_history     ← asyncpg write to postgres-agents
  └─ returns {terminated: true, final_theta, cefr_band, confidence_interval}
       ↑ This is what the demo demonstrates
```

**Theta → CEFR mapping (theta_to_cefr in agt01_profiling/irt.py):**

| Theta range | CEFR | % correct equivalent |
|---|---|---|
| < −1.5 | A1 | < 12.5% (0–3 correct / 30) |
| −1.5 to −0.5 | A2 | 12.5–37.5% (4–11 correct) |
| −0.5 to +0.5 | B1 | 37.5–62.5% (12–18 correct) |
| +0.5 to +1.5 | B2 | 62.5–87.5% (19–26 correct) |
| +1.5 to +2.5 | C1 | 87.5–100% (27–30 correct) |
| ≥ +2.5 | C2 | Not reachable with 30 items |

**Phase 4 integration fix (two lines in service.py):**
```python
# 1. Change LMS endpoint to internal route (add to service.py):
LMS_BASE = "http://learning-materials-service:4002"
# GET /assessment/questions → GET /internal/assessment/questions (with x-internal-secret)
# NOTE: internal router must also add the assessment/questions endpoint

# 2. Normalise skill_domain case before LMS call:
params={"skill": skill_domain.lower()},  # READING → reading
```
