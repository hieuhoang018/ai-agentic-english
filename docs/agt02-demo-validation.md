# AGT-02 Learning Path Agent — Demo Runbook

> Validates AGT-02 from a fresh terminal to 100% confirmed working.
> All Docker — no local Python venv required.
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

---

## STEP 1 — Confirm Docker is running

```powershell
docker version
```

**Expected:** output contains both `Client:` and `Server:` blocks.

**If "error during connect" or "cannot find pipe":**
1. Open Docker Desktop from the Start menu
2. Wait until the tray icon is steady ("Engine running")
3. Re-run `docker version` before continuing

---

## STEP 2 — Start the required services

AGT-02 calls AGT-01 over HTTP to fetch the learner profile before generating a plan.
AGT-01 must be running or plan generation falls back to a cold-start profile.

```powershell
docker compose -f infra/docker-compose.yml up -d --build `
    postgres-agents redis kafka agt01-profiling agt02-learning-path
```

**Expected (last lines):**
```
✔ Container ai-agentic-english-postgres-agents-1      Healthy
✔ Container ai-agentic-english-redis-1                Running
✔ Container ai-agentic-english-kafka-1                Running
✔ Container ai-agentic-english-agt01-profiling-1      Started
✔ Container ai-agentic-english-agt02-learning-path-1  Started
```

First-time build takes 1–3 minutes (Docker pulls base image and runs `pip install`). Subsequent runs are under 30 seconds.

**If "no configuration file provided":**
```powershell
Get-Location  # must end with .worktrees\agt06-agt01-agt02-agt03-sprint
```

**If a port is already in use (e.g. 8101 or 8102):**
```powershell
netstat -ano | findstr ":8102"
# Note the PID in the right column, then:
taskkill /PID <pid> /F
# Re-run Step 2.
```

**If build fails with a pip error:**
```powershell
docker compose -f infra/docker-compose.yml build --no-cache agt02-learning-path
docker compose -f infra/docker-compose.yml up -d postgres-agents redis kafka agt01-profiling agt02-learning-path
```

**If a container shows Exit:**
```powershell
docker compose -f infra/docker-compose.yml logs agt02-learning-path --tail=30
docker compose -f infra/docker-compose.yml logs agt01-profiling      --tail=30
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

Do not run Step 4 until this loop exits.

---

## STEP 4 — Run database migrations

> Required on first run and after any `docker compose down -v`. Safe to re-run.

```powershell
Get-ChildItem "agents\migrations\*.sql" | Sort-Object Name | ForEach-Object {
    Write-Host "  -> $($_.Name)"
    Get-Content $_.FullName -Raw | docker exec -i ai-agentic-english-postgres-agents-1 psql -U postgres -d agent_ltm
}
Write-Host "Migrations complete." -ForegroundColor Green
```

**Expected:** each filename printed, then SQL output (`CREATE TABLE`, `CREATE INDEX`).

**If "No such container":**
```powershell
docker ps --format "table {{.Names}}"
# Find the actual name and substitute it above.
```

---

## STEP 5 — Confirm both agents are healthy

```powershell
$allOk = $true
@(
    @{port=8101; name="AGT-01  User Profiling"},
    @{port=8102; name="AGT-02  Learning Path"}
) | ForEach-Object {
    try {
        $r = Invoke-RestMethod "http://localhost:$($_.port)/health"
        Write-Host "  [OK  ] $($_.port)  $($_.name)" -ForegroundColor Green
    } catch {
        Write-Host "  [FAIL] $($_.port)  $($_.name)  — not responding" -ForegroundColor Red
        $allOk = $false
    }
}
if (-not $allOk) { Write-Host "`nSTOP: Fix failing agents before continuing." -ForegroundColor Red }
else             { Write-Host "`nBoth agents healthy. Proceed." -ForegroundColor Green }
```

**If AGT-02 FAIL:**
```powershell
docker compose -f infra/docker-compose.yml logs agt02-learning-path --tail=30
```

---

## TEST A — Health endpoint

```powershell
Invoke-RestMethod -Uri "http://localhost:8102/health" -Method GET | ConvertTo-Json
```

**Expected:**
```json
{
    "status":  "ok",
    "agent":  "AGT-02",
    "name":  "Learning Path"
}
```

**If "Unable to connect to the remote server":**
```powershell
docker compose -f infra/docker-compose.yml ps agt02-learning-path
# If STATUS is not "running", return to Step 2.
```

---

## TEST B — Generate a plan for a cold-start user

AGT-02 calls AGT-01 to fetch the learner profile first. With no prior profile, it falls back to
cold-start defaults and still generates a valid plan.

```powershell
$plan = Invoke-RestMethod -Uri "http://localhost:8102/plans/user-demo-001/generate" `
    -Method POST -ContentType "application/json" `
    -Body '{"daily_minutes":30,"goals":["business communication"]}'
$plan | ConvertTo-Json -Depth 5
```

**Expected shape:**
```json
{
    "plan_id":          "<uuid>",
    "clerk_user_id":    "user-demo-001",
    "lm_plan_id":       "<uuid>",
    "version":          1,
    "skill_allocation": { "L": 0.25, "S": 0.25, "R": 0.25, "W": 0.25 },
    "activities":       [ ... ],
    "rationale":        "[MOCK LLM AGT02] ...",
    "is_active":        true
}
```

For a cold-start user all `irt_theta` are 0.0 → allocation is equal across all 4 skills (before flooring).

**Verify skill_allocation sums to 1.0:**
```powershell
$total = $plan.skill_allocation.L + $plan.skill_allocation.S + $plan.skill_allocation.R + $plan.skill_allocation.W
Write-Host "Allocation sum: $total  (must be 1.0)"
```

**Verify activities were generated:**
```powershell
Write-Host "Activity count: $($plan.activities.Count)  (must be > 0)"
$plan.activities | ForEach-Object {
    Write-Host "  [$($_.skill_domain)] $($_.title)  ($($_.estimated_minutes) min)"
}
```

**If 500 error:**
```powershell
docker compose -f infra/docker-compose.yml logs agt02-learning-path --tail=30
# Most common cause: agent_learning_plans table missing. Re-run Step 4.
```

**If 422 Unprocessable Entity:**
```powershell
# The body is missing or malformed. Run exactly:
Invoke-RestMethod -Uri "http://localhost:8102/plans/user-demo-001/generate" `
    -Method POST -ContentType "application/json" -Body '{}'
# Empty body {} is valid — all fields have defaults.
```

---

## TEST C — Plan reflects IRT scores (weakness-weighted allocation)

Create a user with a weak Speaking score, generate their plan, confirm Speaking gets the most time.

```powershell
# Create the user profile and set Speaking as the weakest skill
Invoke-RestMethod -Method POST -Uri "http://localhost:8101/profile/user-irt-test" `
    -ContentType "application/json" `
    -Body '{"clerk_user_id": "user-irt-test"}' | Out-Null

Invoke-RestMethod -Method PATCH -Uri "http://localhost:8101/profile/user-irt-test" `
    -ContentType "application/json" `
    -Body '{"irt_theta": {"L": 0.6, "S": -0.8, "R": 0.5, "W": 0.2}}' | Out-Null

# Generate plan
$irt_plan = Invoke-RestMethod -Uri "http://localhost:8102/plans/user-irt-test/generate" `
    -Method POST -ContentType "application/json" `
    -Body '{"daily_minutes":30,"goals":["speaking fluency"]}'

$sMin = [math]::Round($irt_plan.skill_allocation.S * 30)
$lMin = [math]::Round($irt_plan.skill_allocation.L * 30)
$rMin = [math]::Round($irt_plan.skill_allocation.R * 30)
$wMin = [math]::Round($irt_plan.skill_allocation.W * 30)

Write-Host "Daily allocation (30 min):" -ForegroundColor White
Write-Host "  Listening  $([math]::Round($irt_plan.skill_allocation.L*100))%   $lMin min"
Write-Host "  Speaking   $([math]::Round($irt_plan.skill_allocation.S*100))%   $sMin min"
Write-Host "  Reading    $([math]::Round($irt_plan.skill_allocation.R*100))%   $rMin min"
Write-Host "  Writing    $([math]::Round($irt_plan.skill_allocation.W*100))%   $wMin min"

# Verify Speaking has the highest allocation
$maxSkill = @{L=$irt_plan.skill_allocation.L; S=$irt_plan.skill_allocation.S; R=$irt_plan.skill_allocation.R; W=$irt_plan.skill_allocation.W}.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 1
if ($maxSkill.Key -eq "S") {
    Write-Host "PASS: Speaking has the highest allocation (weakest skill gets most time)." -ForegroundColor Green
} else {
    Write-Host "FAIL: Expected S to be highest, got $($maxSkill.Key)" -ForegroundColor Red
}
```

**Expected:** Speaking (`S`) has the highest allocation percentage, because its `irt_theta = -0.8` creates the largest gap from the target (`1.0`).

---

## TEST D — Get active plan

```powershell
$active = Invoke-RestMethod -Uri "http://localhost:8102/plans/user-irt-test/active" -Method GET
$active | ConvertTo-Json -Depth 3
```

**Expected:** same plan as returned by generate, with `is_active: true`. `version: 1`.

**If 404:**
```powershell
# No plan exists for this user. Generate one first (Test C), then retry.
```

---

## TEST E — Replan (version increments, previous plan deactivated)

```powershell
$replan = Invoke-RestMethod -Uri "http://localhost:8102/plans/user-irt-test/replan" `
    -Method POST -ContentType "application/json" `
    -Body '{"daily_minutes":20,"goals":["client presentations"]}'

Write-Host "New version: $($replan.version)  (expected: 2)"

if ($replan.version -eq 2) {
    Write-Host "PASS: version incremented to 2." -ForegroundColor Green
} else {
    Write-Host "FAIL: expected version 2, got $($replan.version)" -ForegroundColor Red
}

# Confirm old plan was deactivated — active plan is now version 2
$active2 = Invoke-RestMethod -Uri "http://localhost:8102/plans/user-irt-test/active"
Write-Host "Active version: $($active2.version)  (expected: 2)"
```

---

## TEST F — Get today's plan

```powershell
$today = Invoke-RestMethod -Uri "http://localhost:8102/plans/user-irt-test/today" -Method GET
$today | ConvertTo-Json -Depth 3

Write-Host "Total minutes today: $($today.daily_minutes)"
Write-Host "Activities:"
$today.activities | ForEach-Object {
    Write-Host "  [$($_.skill_domain)] $($_.title)  ($($_.estimated_minutes) min)"
}
```

**Expected:** `activities` array non-empty, `daily_minutes > 0`, `plan_id` matches the active plan.

---

## TEST G — User with no plan returns empty today plan (not 404)

```powershell
$noplan = Invoke-RestMethod -Uri "http://localhost:8102/plans/user-no-plan/today" -Method GET
$noplan | ConvertTo-Json

if ($noplan.activities.Count -eq 0 -and $noplan.plan_id -eq $null) {
    Write-Host "PASS: empty today plan returned for user with no plan." -ForegroundColor Green
} else {
    Write-Host "FAIL: unexpected response: $($noplan | ConvertTo-Json)" -ForegroundColor Red
}
```

---

## TEST H — Active plan 404 for user with no plan

```powershell
    try {
        Invoke-RestMethod -Uri "http://localhost:8102/plans/user-no-plan/active" -Method GET
        Write-Host "FAIL: should have returned 404." -ForegroundColor Red
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        if ($code -eq 404) {
            Write-Host "PASS: active plan correctly returns 404 when no plan exists." -ForegroundColor Green
        } else {
            Write-Host "UNEXPECTED: got HTTP $code" -ForegroundColor Red
        }
    }
```

---

## TEST I — Run all checks in one block

```powershell
Write-Host "`n=== HEALTH ===" -ForegroundColor Cyan
Invoke-RestMethod -Uri "http://localhost:8102/health" | ConvertTo-Json

Write-Host "`n=== GENERATE (cold-start) ===" -ForegroundColor Cyan
$p = Invoke-RestMethod -Uri "http://localhost:8102/plans/user-demo-001/generate" `
    -Method POST -ContentType "application/json" -Body '{}'
Write-Host "plan_id=$($p.plan_id)  version=$($p.version)  activities=$($p.activities.Count)"

Write-Host "`n=== ACTIVE ===" -ForegroundColor Cyan
$a = Invoke-RestMethod -Uri "http://localhost:8102/plans/user-demo-001/active"
Write-Host "version=$($a.version)  is_active=$($a.is_active)"

Write-Host "`n=== TODAY ===" -ForegroundColor Cyan
$t = Invoke-RestMethod -Uri "http://localhost:8102/plans/user-demo-001/today"
Write-Host "plan_id=$($t.plan_id)  daily_minutes=$($t.daily_minutes)  activities=$($t.activities.Count)"

Write-Host "`n=== ALL CHECKS PASSED ===" -ForegroundColor Green
```

---

## Final Checklist

| # | Check | Pass Criteria |
|---|---|---|
| 1 | `GET /health` | `{"status":"ok","agent":"AGT-02","name":"Learning Path"}` |
| 2 | `POST /plans/.../generate` (cold-start) | `plan_id` is UUID, `version=1`, `activities` non-empty, allocation sums to 1.0 |
| 3 | `POST /plans/.../generate` (IRT-weighted) | `skill_allocation.S` is the highest (weakest skill `S=-0.8`) |
| 4 | `GET /plans/.../active` | Returns active plan, `is_active: true` |
| 5 | `POST /plans/.../replan` | `version` increments to 2; previous plan deactivated |
| 6 | `GET /plans/.../today` | `activities` non-empty, `daily_minutes > 0` |
| 7 | `GET /plans/user-no-plan/today` | `activities: []`, `plan_id: null` — not 404 |
| 8 | `GET /plans/user-no-plan/active` | HTTP 404 |

**All 8 pass = AGT-02 is fully validated.**

---

## Troubleshooting Quick Reference

| Symptom | Command |
|---|---|
| 500 on plan generate | `docker compose -f infra/docker-compose.yml logs agt02-learning-path --tail=30` — likely missing table; re-run Step 4 |
| Cold-start profile on IRT test | AGT-01 is not running or unreachable; check `docker compose ... logs agt01-profiling --tail=20` |
| `version` stays at 1 on replan | Check logs for transaction error; re-run Step 4 to confirm `agent_learning_plans` table exists |
| Container not starting | `docker compose -f infra/docker-compose.yml logs <service> --tail=30` |
| Wrong container name | `docker ps --format "table {{.Names}}"` |

---

## Full Reset

```powershell
docker compose -f infra/docker-compose.yml down -v

docker compose -f infra/docker-compose.yml up -d --build `
    postgres-agents redis kafka agt01-profiling agt02-learning-path

Write-Host "Waiting for postgres-agents..."
do {
    $s = docker inspect --format="{{.State.Health.Status}}" ai-agentic-english-postgres-agents-1 2>$null
    if ($s -eq "healthy") { Write-Host "  healthy." -ForegroundColor Green; break }
    Start-Sleep 4
} while ($true)

Get-ChildItem "agents\migrations\*.sql" | Sort-Object Name | ForEach-Object {
    Write-Host "  -> $($_.Name)"
    Get-Content $_.FullName -Raw | docker exec -i ai-agentic-english-postgres-agents-1 psql -U postgres -d agent_ltm
}
Write-Host "Reset complete. Start from Test A." -ForegroundColor Green
```
