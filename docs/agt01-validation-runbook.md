# AGT-01 Profiling Agent — Demo Runbook

> Validates AGT-01 from a fresh terminal to 100% confirmed working.
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

AGT-01's merge-on-read calls AGT-06 over HTTP to fetch session errors.
AGT-06 must be running or merge tests will silently return base profiles.

```powershell
docker compose -f infra/docker-compose.yml up -d --build `
    postgres-agents redis kafka agt06-memory agt01-profiling
```

**Expected (last lines):**
```
✔ Container ai-agentic-english-postgres-agents-1   Healthy
✔ Container ai-agentic-english-redis-1             Running
✔ Container ai-agentic-english-kafka-1             Running
✔ Container ai-agentic-english-agt06-memory-1      Started
✔ Container ai-agentic-english-agt01-profiling-1   Started
```

**If "no configuration file provided":**
```powershell
Get-Location  # must end with .worktrees\agt06-agt01-agt02-agt03-sprint
```

**If a port is already in use (e.g. 8101 or 8106):**
```powershell
netstat -ano | findstr ":8101"
# Note the PID in the right column, then:
taskkill /PID <pid> /F
# Re-run Step 2.
```

**If a container shows Exit in `docker compose ps`:**
```powershell
docker compose -f infra/docker-compose.yml logs agt01-profiling --tail=30
docker compose -f infra/docker-compose.yml logs agt06-memory    --tail=30
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
    @{port=8106; name="AGT-06  Memory"},
    @{port=8101; name="AGT-01  User Profiling"}
) | ForEach-Object {
    try {
        $r = Invoke-RestMethod "http://localhost:$($_.port)/health"
        Write-Host "  [OK  ] $($_.port)  $($_.name)" -ForegroundColor Green
    } catch {
        Write-Host "  [FAIL] $($_.port)  $($_.name)  — not responding" -ForegroundColor Red
        $allOk = $false
    }
}
if (-not $allOk) { Write-Host "`nSTOP: Fix the failing agents before continuing." -ForegroundColor Red }
else             { Write-Host "`nBoth agents healthy. Proceed." -ForegroundColor Green }
```

**If AGT-01 FAIL:**
```powershell
docker compose -f infra/docker-compose.yml logs agt01-profiling --tail=30
```

**If AGT-06 FAIL:**
```powershell
docker compose -f infra/docker-compose.yml logs agt06-memory --tail=30
```

---

## TEST A — Health check

```powershell
Invoke-RestMethod http://localhost:8101/health
```

**Expected:**
```
status agent  name
------ -----  ----
ok     AGT-01 User Profiling
```

---

## TEST B — Create a learner profile

```powershell
Invoke-RestMethod -Method POST -Uri "http://localhost:8101/profile/test-user-001" `
    -ContentType "application/json" `
    -Body '{"clerk_user_id": "test-user-001"}'
```

**Expected:** JSON with `cold_start_flag: True`, `clerk_user_id: test-user-001`, all `irt_theta` values `0.0`, `user_id` is a UUID.

**If 500 error:**
```powershell
# The learner_profiles table does not exist. Re-run Step 4 (migrations).
docker compose -f infra/docker-compose.yml logs agt01-profiling --tail=20
```

---

## TEST C — POST idempotency (calling twice must not crash)

```powershell
Invoke-RestMethod -Method POST -Uri "http://localhost:8101/profile/test-user-001" `
    -ContentType "application/json" `
    -Body '{"clerk_user_id": "test-user-001"}'
```

**Expected:** same `user_id` returned as Test B, `updated_at` refreshed, no error.

---

## TEST D — GET base profile

```powershell
Invoke-RestMethod http://localhost:8101/profile/test-user-001 | ConvertTo-Json -Depth 10
```

**Expected:** full JSON, `cold_start_flag: true`, all `irt_theta` values `0.0`.

---

## TEST E — PATCH partial update

```powershell
Invoke-RestMethod -Method PATCH -Uri "http://localhost:8101/profile/test-user-001" `
    -ContentType "application/json" `
    -Body '{"irt_theta": {"S": 0.75}}' | ConvertTo-Json -Depth 10
```

**Expected:**
- `irt_theta.S = 0.75`
- `irt_theta.L = 0.0`, `R = 0.0`, `W = 0.0` — untouched

---

## TEST F — PATCH with empty body must return 400

```powershell
try {
    Invoke-RestMethod -Method PATCH -Uri "http://localhost:8101/profile/test-user-001" `
        -ContentType "application/json" `
        -Body '{}'
} catch {
    $_.Exception.Response.StatusCode.value__
    $_.ErrorDetails.Message
}
```

**Expected:** `400` and `{"detail": "No fields to update"}`.

---

## TEST G — PATCH on nonexistent user must auto-create (not 404)

```powershell
Invoke-RestMethod -Method PATCH -Uri "http://localhost:8101/profile/brand-new-user-999" `
    -ContentType "application/json" `
    -Body '{"cold_start_flag": false}' | ConvertTo-Json -Depth 10
```

**Expected:** profile returned with `clerk_user_id: brand-new-user-999` and `cold_start_flag: false`. No 404.

---

## TEST H — Cold-start for unknown user (GET must not 404)

```powershell
Invoke-RestMethod "http://localhost:8101/profile/a-user-that-does-not-exist" | ConvertTo-Json -Depth 10
```

**Expected:** `cold_start_flag: true`, `irt_theta` all zeros, no 404.

---

## TEST I — Redis write-through cache

The cache key prefix is `agt01:profile:` — not `profile:`.

**I-1. Create and read profile to populate the cache:**
```powershell
Invoke-RestMethod -Method POST -Uri "http://localhost:8101/profile/cache-test-user" `
    -ContentType "application/json" `
    -Body '{"clerk_user_id": "cache-test-user"}' | Out-Null

Invoke-RestMethod http://localhost:8101/profile/cache-test-user | Out-Null
```

**I-2. Confirm the cache key exists:**
```powershell
docker exec ai-agentic-english-redis-1 redis-cli get "agt01:profile:cache-test-user"
```

**Expected:** a JSON string of the profile. Empty output means the cache write failed — check AGT-01 logs.

**I-3. PATCH, then confirm cache is updated:**
```powershell
Invoke-RestMethod -Method PATCH -Uri "http://localhost:8101/profile/cache-test-user" `
    -ContentType "application/json" `
    -Body '{"cold_start_flag": false}' | Out-Null

docker exec ai-agentic-english-redis-1 redis-cli get "agt01:profile:cache-test-user"
```

**Expected:** the cached JSON shows `cold_start_flag: false`.

**I-4. GET confirms the updated value is served:**
```powershell
Invoke-RestMethod http://localhost:8101/profile/cache-test-user | ConvertTo-Json -Depth 10
```

**Expected:** `cold_start_flag: false`.

---

## TEST J — Merge-on-read: single error domain

AGT-01 calls AGT-06 over HTTP (`GET /sessions/{id}/errors`) when `?session_id=` is provided.
We seed data via AGT-06's HTTP endpoint so it lands in Redis under the correct key.

Use a unique session ID for this test so accumulated state from prior runs does not interfere.

**J-1. Read current LTM value (the baseline):**
```powershell
$J_SID = "sess-merge-$([guid]::NewGuid().ToString().Substring(0,8))"
Write-Host "Test session ID: $J_SID"

$base = Invoke-RestMethod "http://localhost:8101/profile/test-user-001"
$J_LTM_BEFORE = [double]($base.grammar_error_map.SPEAKING.verb_tense ?? 0)
Write-Host "LTM verb_tense before: $J_LTM_BEFORE"
```

**J-2. Seed a STM error via AGT-06 (severity = 2):**
```powershell
Invoke-RestMethod -Method POST "http://localhost:8106/sessions/$J_SID/errors" `
    -ContentType "application/json" `
    -Body "{`"clerk_user_id`":`"test-user-001`",`"skill_domain`":`"SPEAKING`",`"error_type`":`"verb_tense`",`"severity`":2}"
```
**Expected:** HTTP 204 (no body).

Confirm it was stored:
```powershell
Invoke-RestMethod "http://localhost:8106/sessions/$J_SID/errors"
# Expected: one entry with skill_domain=SPEAKING, error_type=verb_tense, severity=2
```

**J-3. Merged GET with session_id:**
```powershell
$merged = Invoke-RestMethod "http://localhost:8101/profile/test-user-001?session_id=$J_SID"
$merged | ConvertTo-Json -Depth 10

$J_MERGED_VAL = [double]($merged.grammar_error_map.SPEAKING.verb_tense ?? 0)
$J_EXPECTED   = $J_LTM_BEFORE + 2

if ($merged._merged_session_id -eq $J_SID -and $J_MERGED_VAL -eq $J_EXPECTED) {
    Write-Host "PASS: merged verb_tense = $J_MERGED_VAL  ($J_LTM_BEFORE LTM + 2 STM)  _merged_session_id present." -ForegroundColor Green
} else {
    Write-Host "FAIL: expected $J_EXPECTED, got $J_MERGED_VAL  |  _merged_session_id=$($merged._merged_session_id)" -ForegroundColor Red
}
```

**Expected:** `_merged_session_id` equals `$J_SID`, and `verb_tense` equals exactly `$J_LTM_BEFORE + 2`.

**If `_merged_session_id` is missing (verb_tense unchanged from LTM):**
```powershell
# AGT-06 returned no errors. Verify the seed landed:
Invoke-RestMethod "http://localhost:8106/sessions/$J_SID/errors"
# If empty, re-run J-2.
# If AGT-06 is down: check logs:
docker compose -f infra/docker-compose.yml logs agt06-memory --tail=20
```

**J-4. Base GET without session_id (confirm merge was never persisted):**
```powershell
$after = Invoke-RestMethod "http://localhost:8101/profile/test-user-001"
$J_LTM_AFTER = [double]($after.grammar_error_map.SPEAKING.verb_tense ?? 0)

if ($J_LTM_AFTER -eq $J_LTM_BEFORE -and $null -eq $after._merged_session_id) {
    Write-Host "PASS: base LTM unchanged ($J_LTM_AFTER), no _merged_session_id." -ForegroundColor Green
} else {
    Write-Host "FAIL: LTM changed from $J_LTM_BEFORE to $J_LTM_AFTER, or _merged_session_id leaked." -ForegroundColor Red
}
```

---

## TEST K — Merge-on-read: multiple errors across two skill domains

**K-1. Read current LTM baselines:**
```powershell
$K_SID = "sess-multi-$([guid]::NewGuid().ToString().Substring(0,8))"
Write-Host "Test session ID: $K_SID"

$kBase = Invoke-RestMethod "http://localhost:8101/profile/test-user-001"
$K_SPK_BEFORE = [double]($kBase.grammar_error_map.SPEAKING.verb_tense ?? 0)
$K_WRT_BEFORE = [double]($kBase.grammar_error_map.WRITING.article_usage ?? 0)
Write-Host "LTM SPEAKING.verb_tense before : $K_SPK_BEFORE"
Write-Host "LTM WRITING.article_usage before: $K_WRT_BEFORE"
```

**K-2. Seed two errors in the new session via AGT-06:**
```powershell
Invoke-RestMethod -Method POST "http://localhost:8106/sessions/$K_SID/errors" `
    -ContentType "application/json" `
    -Body "{`"clerk_user_id`":`"test-user-001`",`"skill_domain`":`"SPEAKING`",`"error_type`":`"verb_tense`",`"severity`":2}"

Invoke-RestMethod -Method POST "http://localhost:8106/sessions/$K_SID/errors" `
    -ContentType "application/json" `
    -Body "{`"clerk_user_id`":`"test-user-001`",`"skill_domain`":`"WRITING`",`"error_type`":`"article_usage`",`"severity`":1}"
```
Both return HTTP 204.

**K-3. Merged GET:**
```powershell
$kMerged = Invoke-RestMethod "http://localhost:8101/profile/test-user-001?session_id=$K_SID"
$kMerged | ConvertTo-Json -Depth 10

$K_SPK_MERGED = [double]($kMerged.grammar_error_map.SPEAKING.verb_tense ?? 0)
$K_WRT_MERGED = [double]($kMerged.grammar_error_map.WRITING.article_usage ?? 0)

if ($kMerged._merged_session_id -eq $K_SID `
    -and $K_SPK_MERGED -eq ($K_SPK_BEFORE + 2) `
    -and $K_WRT_MERGED -eq ($K_WRT_BEFORE + 1)) {
    Write-Host "PASS: SPEAKING.verb_tense=$K_SPK_MERGED  WRITING.article_usage=$K_WRT_MERGED  _merged_session_id present." -ForegroundColor Green
} else {
    Write-Host "FAIL:" -ForegroundColor Red
    Write-Host "  SPEAKING: expected $($K_SPK_BEFORE+2), got $K_SPK_MERGED"
    Write-Host "  WRITING:  expected $($K_WRT_BEFORE+1), got $K_WRT_MERGED"
    Write-Host "  _merged_session_id: $($kMerged._merged_session_id)"
}
```

**Expected:** both values equal `LTM_before + delta`, `_merged_session_id` equals `$K_SID`.

---

## TEST L — Merge with empty session returns base profile

```powershell
$L_SID = [guid]::NewGuid().ToString()  # guaranteed no errors in Redis
$lResult = Invoke-RestMethod "http://localhost:8101/profile/test-user-001?session_id=$L_SID"
$lResult | ConvertTo-Json -Depth 10

if ($null -eq $lResult._merged_session_id) {
    Write-Host "PASS: no _merged_session_id when session has no errors." -ForegroundColor Green
} else {
    Write-Host "FAIL: _merged_session_id present for an empty session." -ForegroundColor Red
}
```

**Expected:** base profile returned, no `_merged_session_id` field.

---

## Final Checklist

All 12 must pass. AGT-01 is not validated until every row is green.

| # | Test | Pass condition |
|---|---|---|
| 1 | Health check | `status: ok, agent: AGT-01` |
| 2 | Create profile | `cold_start_flag: true`, UUID assigned |
| 3 | POST idempotency | Same `user_id`, no crash |
| 4 | GET base profile | Profile returned, `irt_theta` all zeros |
| 5 | PATCH partial update | `S=0.75`, L/R/W still `0.0` |
| 6 | PATCH empty body | HTTP 400, `"No fields to update"` |
| 7 | PATCH nonexistent user | Auto-created, no 404 |
| 8 | Cold-start unknown user | Profile returned, `cold_start_flag: true`, no 404 |
| 9 | Redis cache write | `agt01:profile:cache-test-user` key exists after GET |
| 10 | Redis cache invalidation | Key updated after PATCH shows `cold_start_flag: false` |
| 11 | Merge WITH session_id (single) | `verb_tense=3.0`, `_merged_session_id` present, base still `1.0` |
| 12 | Merge WITH session_id (multi) | SPEAKING and WRITING both merged correctly |

---

## Troubleshooting Quick Reference

| Symptom | Command |
|---|---|
| 500 on profile create | `docker compose -f infra/docker-compose.yml logs agt01-profiling --tail=30` — likely missing table; re-run Step 4 |
| merge returns base profile (no `_merged_session_id`) | AGT-06 is not running or returned an error; run `docker compose ... logs agt06-memory --tail=20` |
| Redis key missing after GET | Check AGT-01 logs for Redis connection error |
| Container not starting | `docker compose -f infra/docker-compose.yml logs <service> --tail=30` |
| Wrong container name | `docker ps --format "table {{.Names}}"` |

---

## Full Reset

```powershell
docker compose -f infra/docker-compose.yml down -v

# Wait for postgres-agents to be healthy after restart (Step 3), then re-run migrations:
docker compose -f infra/docker-compose.yml up -d --build postgres-agents redis kafka agt06-memory agt01-profiling

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
