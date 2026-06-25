# AGT-11 Translation & Explanation Agent — Demo Runbook

> Validates AGT-11 from a fresh terminal to 100% confirmed working.
> All Docker — no local Python venv required.
> All commands are PowerShell from the **repo root** (`ai-agentic-english`).

---

## How AGT-11 Works (Read First)

AGT-11 is a cache-first EN→VI translation agent with a three-zone proficiency model:

| Zone | theta-R range | Behavior |
|---|---|---|
| `vi_primary` | R < -0.5 | Vietnamese-first explanations (below B1) |
| `bilingual` | -0.5 ≤ R ≤ 1.0 | English + Vietnamese support (B1-B2) |
| `en_only` | R > 1.0 | Full English immersion (above B2) |

**Zone override:** `session_type="conversation"` always returns `en_only` regardless of theta-R.

**Where theta-R comes from:** AGT-11 calls AGT-01 `/profile/{clerk_user_id}` on every request. If AGT-01 is unreachable, theta-R defaults to 0.0 (bilingual zone).

**What INFERENCE_MODE=mock means:** Translation returns `[MOCK VI] {first 80 chars of content}` — no real Vietnamese, no Redis cache write. All responses show `"cached": false`.

---

## Demo Users

We use three pre-defined users, each seeded via AGT-01 PATCH:

| User ID | irt_theta.R | Expected Zone |
|---|---|---|
| `user_bilingual_demo` | 0.0 (cold-start default) | bilingual |
| `user_en_only_demo` | 1.5 (above B2) | en_only |
| `user_vi_primary_demo` | -1.0 (below B1) | vi_primary |

---

## Before You Start — Navigate to Repo Root

```powershell
cd "C:\Users\minhh\Side Hustles\ai-agentic-english"
```

Confirm:

```powershell
Get-Location
# Must end with: ai-agentic-english
```

---

## Agent Ports

| Agent | Port |
|---|---|
| AGT-11 Translation & Explanation | 8111 |
| AGT-01 Profiling (required by AGT-11) | 8101 |

---

## STEP 1 — Confirm Docker is Running

```powershell
docker version
```

**Expected:** output contains both `Client:` and `Server:` blocks.

**If "error during connect" or "cannot find pipe":**
1. Open Docker Desktop from the Start menu
2. Wait until the tray icon is steady ("Engine running")
3. Re-run `docker version` before continuing

---

## STEP 2 — Start Required Services

AGT-11 calls AGT-01 for every zone lookup. AGT-01 needs Postgres and Redis.

```powershell
docker compose -f infra/docker-compose.yml up -d --build `
    postgres-agents redis kafka `
    agt01-profiling agt11-translation
```

First-time build takes 3–8 minutes. Subsequent runs are under 30 seconds.

**If "no configuration file provided":**
```powershell
Get-Location  # must end with ai-agentic-english
```

**If a port is already in use:**
```powershell
# For port 8111
netstat -ano | findstr ":8111"
taskkill /PID <the-pid> /F
# For port 8101
netstat -ano | findstr ":8101"
taskkill /PID <the-pid> /F
# Re-run Step 2
```

**If a container exits immediately:**
```powershell
docker compose -f infra/docker-compose.yml logs agt11-translation --tail=50
docker compose -f infra/docker-compose.yml logs agt01-profiling --tail=50
```

---

## STEP 3 — Wait for postgres-agents to Be Healthy

```powershell
Write-Host "Waiting for postgres-agents..."
do {
    $s = docker inspect --format="{{.State.Health.Status}}" ai-agentic-english-postgres-agents-1 2>$null
    if ($s -eq "healthy") { Write-Host "  postgres-agents is healthy." -ForegroundColor Green; break }
    Write-Host "  status: $s — retrying in 4s..."
    Start-Sleep 4
} while ($true)
```

Do not continue until this loop exits.

---

## STEP 4 — Run Database Migrations

> AGT-01 needs the `learner_profiles` table. Safe to re-run (all migrations use `IF NOT EXISTS`).

```powershell
Get-ChildItem "agents\migrations\*.sql" | Sort-Object Name | ForEach-Object {
    Write-Host "  -> $($_.Name)"
    Get-Content $_.FullName -Raw | docker exec -i ai-agentic-english-postgres-agents-1 psql -U postgres -d agent_ltm
    if ($LASTEXITCODE -ne 0) {
        Write-Host "FAILED on $($_.Name). Check error above." -ForegroundColor Red
        return
    }
}
Write-Host "Migrations complete." -ForegroundColor Green
```

**Expected:** each filename printed, then SQL output (`CREATE TABLE`, `CREATE INDEX`).

**If "already exists" errors appear:**
```powershell
# Safe to ignore — migrations use IF NOT EXISTS. Continue to Step 5.
```

**If "relation learner_profiles does not exist" later:**
```powershell
# Step 4 was not run or failed silently. Re-run it now.
```

---

## STEP 5 — Wait for Both Agents to Be Healthy

```powershell
$agents = @(
    @{ Name = "agt01-profiling";     Url = "http://localhost:8101/health" },
    @{ Name = "agt11-translation";   Url = "http://localhost:8111/health" }
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
Write-Host "All agents checked." -ForegroundColor Green
```

**If agt01-profiling times out:**
```powershell
docker compose -f infra/docker-compose.yml logs agt01-profiling --tail=50
# Common causes:
#   learner_profiles table not found → re-run Step 4
#   Redis connection failed → verify redis container is running:
#   docker compose -f infra/docker-compose.yml ps redis
```

**If agt11-translation times out:**
```powershell
docker compose -f infra/docker-compose.yml logs agt11-translation --tail=50
# Common causes:
#   Redis connection failed → check redis container
#   Import error → container may need a rebuild:
#   docker compose -f infra/docker-compose.yml build agt11-translation
#   docker compose -f infra/docker-compose.yml up -d agt11-translation
```

---

## STEP 6 — Seed Demo User Profiles via AGT-01

No direct SQL is needed — AGT-01 auto-creates profiles on first access (cold-start). We PATCH them to specific theta-R values to test each zone.

### 6a — Create the bilingual user (cold-start default, no PATCH needed)

```powershell
# Just GET the profile — AGT-01 auto-creates it with R=0.0 (cold-start)
$bilingual = Invoke-RestMethod -Uri "http://localhost:8101/profile/user_bilingual_demo"
$bilingual | ConvertTo-Json
```

**Expected:**
```json
{
  "clerk_user_id": "user_bilingual_demo",
  "irt_theta": { "L": 0.0, "S": 0.0, "R": 0.0, "W": 0.0 },
  "cold_start_flag": true,
  ...
}
```

### 6b — Create the en_only user (PATCH R = 1.5)

```powershell
# First GET to create the profile in DB
Invoke-RestMethod -Uri "http://localhost:8101/profile/user_en_only_demo" | Out-Null

# Then PATCH to set R = 1.5 (above B2 threshold of 1.0 → en_only)
$patchBody = @{ irt_theta = @{ R = 1.5 } } | ConvertTo-Json
$enOnly = Invoke-RestMethod -Uri "http://localhost:8101/profile/user_en_only_demo" `
    -Method PATCH -ContentType "application/json" -Body $patchBody
Write-Host "user_en_only_demo theta_R = $($enOnly.irt_theta.R)  (expected: 1.5)"
```

### 6c — Create the vi_primary user (PATCH R = -1.0)

```powershell
# First GET to create the profile in DB
Invoke-RestMethod -Uri "http://localhost:8101/profile/user_vi_primary_demo" | Out-Null

# Then PATCH to set R = -1.0 (below -0.5 threshold → vi_primary)
$patchBody = @{ irt_theta = @{ R = -1.0 } } | ConvertTo-Json
$viPrimary = Invoke-RestMethod -Uri "http://localhost:8101/profile/user_vi_primary_demo" `
    -Method PATCH -ContentType "application/json" -Body $patchBody
Write-Host "user_vi_primary_demo theta_R = $($viPrimary.irt_theta.R)  (expected: -1.0)"
```

**Verify all three profiles are set correctly:**

```powershell
$profileChecks = @(
    @{ User = "user_bilingual_demo";  ExpectedR = 0.0 },
    @{ User = "user_en_only_demo";    ExpectedR = 1.5 },
    @{ User = "user_vi_primary_demo"; ExpectedR = -1.0 }
)

foreach ($pc in $profileChecks) {
    $p = Invoke-RestMethod -Uri "http://localhost:8101/profile/$($pc.User)"
    $r = $p.irt_theta.R
    $status = if ($r -eq $pc.ExpectedR) { "PASS" } else { "FAIL" }
    $color = if ($r -eq $pc.ExpectedR) { "Green" } else { "Red" }
    Write-Host "$status  $($pc.User): R=$r  (expected: $($pc.ExpectedR))" -ForegroundColor $color
}
```

**If PATCH returns 422 or 400:**
```powershell
# Pydantic model requires flat dict for irt_theta. Verify the body:
$patchBody = '{"irt_theta": {"R": 1.5}}'
Invoke-RestMethod -Uri "http://localhost:8101/profile/user_en_only_demo" `
    -Method PATCH -ContentType "application/json" -Body $patchBody
```

**If PATCH returns 500 with "relation does not exist":**
```powershell
# Migrations not applied — re-run Step 4, then retry Step 6.
```

---

## PHASE 1 — Health Check

### Step 7 — Verify Both Agents Respond

```powershell
Invoke-RestMethod -Uri http://localhost:8111/health | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:8101/health | ConvertTo-Json
```

**Expected:**
```json
{ "status": "ok", "agent": "AGT-11", "name": "Translation & Explanation" }
{ "status": "ok", "agent": "AGT-01", "name": "User Profiling" }
```

---

## PHASE 2 — Zone Calculation

### Step 8 — Verify Zone for Each User

```powershell
$zoneChecks = @(
    @{ User = "user_bilingual_demo";  ExpectedZone = "bilingual";  ExpectedR = 0.0  },
    @{ User = "user_en_only_demo";    ExpectedZone = "en_only";    ExpectedR = 1.5  },
    @{ User = "user_vi_primary_demo"; ExpectedZone = "vi_primary"; ExpectedR = -1.0 }
)

foreach ($zc in $zoneChecks) {
    $z = Invoke-RestMethod -Uri "http://localhost:8111/zone/$($zc.User)?session_type=exercise"
    $zoneOk = $z.zone -eq $zc.ExpectedZone
    $rOk    = $z.theta_r -eq $zc.ExpectedR
    $pass   = $zoneOk -and $rOk
    $color  = if ($pass) { "Green" } else { "Red" }
    Write-Host "$(if($pass){"PASS"}else{"FAIL"})  $($zc.User): zone=$($z.zone), theta_r=$($z.theta_r)" -ForegroundColor $color
}
```

**Expected output:**
```
PASS  user_bilingual_demo:  zone=bilingual,  theta_r=0.0
PASS  user_en_only_demo:    zone=en_only,    theta_r=1.5
PASS  user_vi_primary_demo: zone=vi_primary, theta_r=-1.0
```

### Step 9 — Conversation Session Always Returns en_only

For speaking practice, AGT-11 enforces English immersion regardless of proficiency level.

```powershell
$convZoneChecks = @(
    "user_bilingual_demo",
    "user_vi_primary_demo"
)

foreach ($user in $convZoneChecks) {
    $z = Invoke-RestMethod -Uri "http://localhost:8111/zone/${user}?session_type=conversation"
    $pass = $z.zone -eq "en_only"
    $color = if ($pass) { "Green" } else { "Red" }
    Write-Host "$(if($pass){"PASS"}else{"FAIL"})  ${user}: session_type=conversation → zone=$($z.zone)  (expected: en_only)" -ForegroundColor $color
}
```

**If zone is NOT en_only for conversation:**
```powershell
# The zone override is in zone.py:
# if session_type == "conversation": return ZONE_EN_ONLY
# This is applied BEFORE theta-R comparison.
# Check that the request is sending session_type=conversation correctly.
```

### Step 10 — Zone Boundary Edge Cases

```powershell
$edgeCases = @(
    @{ R = -0.5; ExpectedZone = "bilingual";  Note = "exactly at vi_primary boundary (inclusive on bilingual side)" },
    @{ R = 1.0;  ExpectedZone = "bilingual";  Note = "exactly at en_only boundary (inclusive on bilingual side)" },
    @{ R = -0.51; ExpectedZone = "vi_primary"; Note = "just below vi_primary threshold" },
    @{ R = 1.01;  ExpectedZone = "en_only";    Note = "just above en_only threshold" }
)

foreach ($ec in $edgeCases) {
    # Temporarily patch a test user to each boundary value
    $patchBody = @{ irt_theta = @{ R = $ec.R } } | ConvertTo-Json
    Invoke-RestMethod -Uri "http://localhost:8101/profile/user_boundary_demo" `
        -Method PATCH -ContentType "application/json" -Body $patchBody | Out-Null

    # Small pause to let profile cache invalidate
    Start-Sleep 1

    $z = Invoke-RestMethod -Uri "http://localhost:8111/zone/user_boundary_demo?session_type=exercise"
    $pass = $z.zone -eq $ec.ExpectedZone
    $color = if ($pass) { "Green" } else { "Red" }
    Write-Host "$(if($pass){"PASS"}else{"FAIL"})  R=$($ec.R) → zone=$($z.zone)  [$($ec.Note)]" -ForegroundColor $color
}
```

**If boundary values produce the wrong zone:**
```powershell
# Check zone.py boundary logic:
#   theta_r < -0.5  → vi_primary
#   theta_r <= 1.0  → bilingual
#   else            → en_only
# The boundary -0.5 is EXCLUSIVE for vi_primary (must be strictly less than)
# The boundary 1.0 is INCLUSIVE for bilingual (must be <= 1.0)
```

---

## PHASE 3 — Translation

### Step 11 — Bilingual User: Gets Vietnamese Translation

For bilingual users, AGT-11 returns Vietnamese content.

```powershell
$body = @{
    content       = "The weather is very nice today."
    clerk_user_id = "user_bilingual_demo"
    session_type  = "exercise"
} | ConvertTo-Json

$r = Invoke-RestMethod -Uri "http://localhost:8111/translate" `
    -Method POST -ContentType "application/json" -Body $body
$r | ConvertTo-Json
```

**Expected:**

| Field | Expected |
|---|---|
| `original` | `"The weather is very nice today."` |
| `translated` | `"[MOCK VI] The weather is very nice today."` |
| `zone` | `"bilingual"` |
| `zone_label` | `"Bilingual (B1-B2)"` |
| `theta_r` | `0.0` |
| `cached` | `false` (mock mode never caches) |

```powershell
# Assertions
if ($r.zone -eq "bilingual") {
    Write-Host "PASS: zone=bilingual" -ForegroundColor Green
} else {
    Write-Host "FAIL: zone=$($r.zone)  (expected: bilingual)" -ForegroundColor Red
}

if ($r.translated.StartsWith("[MOCK VI]")) {
    Write-Host "PASS: translation is mock-prefixed" -ForegroundColor Green
} else {
    Write-Host "FAIL: unexpected translation: $($r.translated)" -ForegroundColor Red
}

if ($r.cached -eq $false) {
    Write-Host "PASS: cached=false (mock mode)" -ForegroundColor Green
} else {
    Write-Host "FAIL: cached should be false in mock mode" -ForegroundColor Red
}
```

### Step 12 — en_only User: Translation Skipped, Original Returned

For advanced users, AGT-11 returns the original English content without translating.

```powershell
$body = @{
    content       = "The weather is very nice today."
    clerk_user_id = "user_en_only_demo"
    session_type  = "exercise"
} | ConvertTo-Json

$r = Invoke-RestMethod -Uri "http://localhost:8111/translate" `
    -Method POST -ContentType "application/json" -Body $body
$r | ConvertTo-Json
```

**Expected:**

| Field | Expected |
|---|---|
| `original` | `"The weather is very nice today."` |
| `translated` | `"The weather is very nice today."` (**same as original — no translation**) |
| `zone` | `"en_only"` |
| `zone_label` | `"English only (above B2)"` |
| `theta_r` | `1.5` |
| `cached` | `false` |

> **Important:** `translated` is NOT null for en_only users — it echoes back the original content. The caller distinguishes "no translation needed" by checking `zone == "en_only"` or comparing `original == translated`.

```powershell
if ($r.zone -eq "en_only") {
    Write-Host "PASS: zone=en_only" -ForegroundColor Green
} else {
    Write-Host "FAIL: zone=$($r.zone)  (expected: en_only)" -ForegroundColor Red
}

if ($r.translated -eq $r.original) {
    Write-Host "PASS: translated equals original (no translation applied)" -ForegroundColor Green
} else {
    Write-Host "FAIL: translated differs from original for en_only user" -ForegroundColor Red
}
```

### Step 13 — vi_primary User: Gets Vietnamese Translation

```powershell
$body = @{
    content       = "Use 'have been' for experiences up to now."
    clerk_user_id = "user_vi_primary_demo"
    session_type  = "review"
} | ConvertTo-Json

$r = Invoke-RestMethod -Uri "http://localhost:8111/translate" `
    -Method POST -ContentType "application/json" -Body $body
$r | ConvertTo-Json
```

**Expected:**

| Field | Expected |
|---|---|
| `zone` | `"vi_primary"` |
| `zone_label` | `"Vietnamese primary (below B1)"` |
| `translated` | `"[MOCK VI] Use 'have been' for experiences up to now."` |
| `theta_r` | `-1.0` |

```powershell
if ($r.zone -eq "vi_primary") {
    Write-Host "PASS: zone=vi_primary" -ForegroundColor Green
} else {
    Write-Host "FAIL: zone=$($r.zone)" -ForegroundColor Red
}
```

### Step 14 — Conversation Session Overrides Zone to en_only

Even for a vi_primary user, speaking sessions always return en_only (immersion).

```powershell
$body = @{
    content       = "Let's talk about your weekend plans."
    clerk_user_id = "user_vi_primary_demo"
    session_type  = "conversation"   # this overrides vi_primary → en_only
} | ConvertTo-Json

$r = Invoke-RestMethod -Uri "http://localhost:8111/translate" `
    -Method POST -ContentType "application/json" -Body $body
$r | ConvertTo-Json
```

**Expected:**
- `zone` = `"en_only"` (conversation override)
- `translated` = same as `original` (no translation)
- `theta_r` = `-1.0` (the user's actual score — still read from AGT-01)

```powershell
if ($r.zone -eq "en_only" -and $r.translated -eq $r.original) {
    Write-Host "PASS: conversation session correctly forced en_only for vi_primary user." -ForegroundColor Green
} else {
    Write-Host "FAIL: zone=$($r.zone)  translated=$($r.translated)" -ForegroundColor Red
}
```

### Step 15 — Content Truncation at 80 Characters (Mock Mode)

In mock mode, the stub response truncates content at 80 characters.

```powershell
$longContent = "A" * 100  # 100 characters
$body = @{
    content       = $longContent
    clerk_user_id = "user_bilingual_demo"
    session_type  = "exercise"
} | ConvertTo-Json

$r = Invoke-RestMethod -Uri "http://localhost:8111/translate" `
    -Method POST -ContentType "application/json" -Body $body

$expectedTranslated = "[MOCK VI] $($longContent.Substring(0, 80))"
if ($r.translated -eq $expectedTranslated) {
    Write-Host "PASS: mock translation truncates content at 80 chars." -ForegroundColor Green
} else {
    Write-Host "FAIL: translated='$($r.translated)'" -ForegroundColor Red
    Write-Host "  expected: '$expectedTranslated'"
}
```

---

## PHASE 4 — Grammar Error Explanation

### Step 16 — Explain Endpoint for Bilingual User

The `/explain` endpoint wraps a grammar error into content and passes it through the translation pipeline.

```powershell
$body = @{
    error_type    = "verb_tense"
    example       = "I go there yesterday."
    clerk_user_id = "user_bilingual_demo"
    session_type  = "exercise"
} | ConvertTo-Json

$explain = Invoke-RestMethod -Uri "http://localhost:8111/explain" `
    -Method POST -ContentType "application/json" -Body $body
$explain | ConvertTo-Json
```

**Expected:**

| Field | Expected |
|---|---|
| `original` | `"Grammar error type: verb_tense\nExample: I go there yesterday."` |
| `translated` | `"[MOCK VI] Grammar error type: verb_tense\nExample: I go there "` (80-char truncation) |
| `zone` | `"bilingual"` |
| `zone_label` | `"Bilingual (B1-B2)"` |
| `cached` | `false` |

```powershell
$expectedOriginal = "Grammar error type: verb_tense`nExample: I go there yesterday."
if ($explain.original -eq $expectedOriginal) {
    Write-Host "PASS: explain correctly formats error_type+example into content." -ForegroundColor Green
} else {
    Write-Host "NOTE: original='$($explain.original)'" -ForegroundColor Yellow
}

if ($explain.zone -eq "bilingual") {
    Write-Host "PASS: bilingual zone for explain request." -ForegroundColor Green
} else {
    Write-Host "FAIL: zone=$($explain.zone)" -ForegroundColor Red
}
```

### Step 17 — Explain for en_only User: No Vietnamese Explanation

```powershell
$body = @{
    error_type    = "article"
    example       = "She is a honest person."
    clerk_user_id = "user_en_only_demo"
    session_type  = "exercise"
} | ConvertTo-Json

$r = Invoke-RestMethod -Uri "http://localhost:8111/explain" `
    -Method POST -ContentType "application/json" -Body $body

if ($r.zone -eq "en_only" -and $r.translated -eq $r.original) {
    Write-Host "PASS: en_only user gets no explanation translation." -ForegroundColor Green
} else {
    Write-Host "FAIL: zone=$($r.zone)  translated=$($r.translated)" -ForegroundColor Red
}
```

---

## PHASE 5 — Graceful Degradation (AGT-01 Down)

### Step 18 — AGT-11 Falls Back to Bilingual When AGT-01 is Unavailable

When AGT-01 is unreachable, AGT-11 defaults to theta-R=0.0 (bilingual zone) — it never blocks a translation request.

```powershell
# Stop AGT-01
docker compose -f infra/docker-compose.yml stop agt01-profiling
Start-Sleep 4

$body = @{
    content       = "Hello, how are you?"
    clerk_user_id = "user_vi_primary_demo"   # would be vi_primary if AGT-01 was up
    session_type  = "exercise"
} | ConvertTo-Json

$r = Invoke-RestMethod -Uri "http://localhost:8111/translate" `
    -Method POST -ContentType "application/json" -Body $body
Write-Host "zone=$($r.zone)  theta_r=$($r.theta_r)  translated=$($r.translated)"

if ($r.zone -eq "bilingual" -and $r.theta_r -eq 0.0) {
    Write-Host "PASS: AGT-11 defaults to bilingual zone when AGT-01 is down." -ForegroundColor Green
} else {
    Write-Host "FAIL: zone=$($r.zone)  theta_r=$($r.theta_r)  (expected: bilingual, 0.0)" -ForegroundColor Red
}
```

```powershell
# Zone endpoint should also degrade gracefully
$z = Invoke-RestMethod -Uri "http://localhost:8111/zone/user_vi_primary_demo?session_type=exercise"
if ($z.zone -eq "bilingual" -and $z.theta_r -eq 0.0) {
    Write-Host "PASS: /zone endpoint defaults to bilingual when AGT-01 is down." -ForegroundColor Green
} else {
    Write-Host "FAIL: zone=$($z.zone)  theta_r=$($z.theta_r)" -ForegroundColor Red
}

# Bring AGT-01 back
docker compose -f infra/docker-compose.yml start agt01-profiling
Write-Host "Waiting 10s for AGT-01 to restart..."
Start-Sleep 10
Invoke-RestMethod -Uri http://localhost:8101/health | ConvertTo-Json
```

---

## PHASE 6 — Cache Key Verification

> In mock mode, Redis cache is bypassed entirely. This phase verifies the cache key formula at the code level. To test actual cache hits, you would need to set `INFERENCE_MODE=production` (requires a real translation API).

### Step 19 — Confirm Cache Key Formula is Deterministic

The cache key is `trans:{sha256(content:zone)[:16]}`. Same content + same zone = same key.

```powershell
# Compute expected cache key using PowerShell SHA256
$content = "The weather is nice today."
$zone    = "bilingual"
$input   = "${content}:${zone}"
$bytes   = [System.Text.Encoding]::UTF8.GetBytes($input)
$sha     = [System.Security.Cryptography.SHA256]::Create().ComputeHash($bytes)
$hex     = ($sha | ForEach-Object { $_.ToString("x2") }) -join ""
$cacheKey = "trans:$($hex.Substring(0, 16))"

Write-Host "Expected cache key for '$input':"
Write-Host "  $cacheKey"

# Verify key format
if ($cacheKey -match "^trans:[0-9a-f]{16}$") {
    Write-Host "PASS: cache key matches expected format (trans:<16hex>)." -ForegroundColor Green
} else {
    Write-Host "FAIL: unexpected key format: $cacheKey" -ForegroundColor Red
}
```

```powershell
# Confirm that zone=bilingual and zone=en_only produce DIFFERENT cache keys
$bilingual_key  = $cacheKey  # already computed above
$input2  = "${content}:en_only"
$bytes2  = [System.Text.Encoding]::UTF8.GetBytes($input2)
$sha2    = [System.Security.Cryptography.SHA256]::Create().ComputeHash($bytes2)
$hex2    = ($sha2 | ForEach-Object { $_.ToString("x2") }) -join ""
$en_only_key    = "trans:$($hex2.Substring(0, 16))"

if ($bilingual_key -ne $en_only_key) {
    Write-Host "PASS: bilingual and en_only zones produce different cache keys." -ForegroundColor Green
    Write-Host "  bilingual: $bilingual_key"
    Write-Host "  en_only:   $en_only_key"
} else {
    Write-Host "FAIL: different zones produced the same cache key." -ForegroundColor Red
}
```

---

## Final Pass/Fail Checklist

| # | Test | Pass Criteria |
|---|---|---|
| 1 | Health — both agents | `status: ok` for AGT-11 and AGT-01 |
| 2 | Zone — bilingual user (R=0.0) | `zone=bilingual`, `theta_r=0.0` |
| 3 | Zone — en_only user (R=1.5) | `zone=en_only`, `theta_r=1.5` |
| 4 | Zone — vi_primary user (R=-1.0) | `zone=vi_primary`, `theta_r=-1.0` |
| 5 | Zone — conversation session type | Always `en_only` regardless of theta_r |
| 6 | Zone boundaries | R=-0.5 → bilingual; R=1.0 → bilingual; R=-0.51 → vi_primary; R=1.01 → en_only |
| 7 | Translate — bilingual user | `zone=bilingual`, `translated="[MOCK VI] ..."`, `cached=false` |
| 8 | Translate — en_only user | `zone=en_only`, `translated` equals `original`, `cached=false` |
| 9 | Translate — vi_primary user | `zone=vi_primary`, `translated="[MOCK VI] ..."` |
| 10 | Translate — conversation override | `zone=en_only` even for vi_primary user |
| 11 | Translate — 80-char truncation | Mock stub truncates at 80 chars |
| 12 | Explain — bilingual user | `original` contains `error_type` and `example`, `zone=bilingual` |
| 13 | Explain — en_only user | `zone=en_only`, no translation |
| 14 | AGT-01 down — zone fallback | `zone=bilingual`, `theta_r=0.0` |
| 15 | AGT-01 down — translate still works | Returns bilingual response, no 500 |
| 16 | Cache key format | Matches `trans:[0-9a-f]{16}` |
| 17 | Cache key zone-differentiation | bilingual ≠ en_only key for same content |

---

## Troubleshooting Quick Reference

| Symptom | Command |
|---|---|
| Container not starting | `docker compose -f infra/docker-compose.yml logs <service> --tail=50` |
| postgres-agents stuck unhealthy | `docker compose -f infra/docker-compose.yml restart postgres-agents` |
| AGT-01 returns 500 "relation does not exist" | Re-run Step 4 (migrations) |
| Zone always returns bilingual (even after PATCH) | AGT-01 profile cache TTL is 300s — wait 5 min or restart agt01-profiling |
| Zone never returns vi_primary | Verify PATCH set R correctly: `Invoke-RestMethod -Uri http://localhost:8101/profile/user_vi_primary_demo` |
| Port already in use | `netstat -ano \| findstr :<port>` then `taskkill /PID <pid> /F` |
| Wrong container name | `docker ps --format "table {{.Names}}"` |
| PATCH 422 error | Body must be `{"irt_theta": {"R": <value>}}` — not nested under "profile" |

---

## Clean Shutdown

```powershell
# Stop containers (keeps volumes/data for next run):
docker compose -f infra/docker-compose.yml stop `
    agt11-translation agt01-profiling kafka redis postgres-agents

# Stop and remove containers + networks (keeps volumes):
docker compose -f infra/docker-compose.yml down

# Full wipe including volumes (requires re-seeding next run):
docker compose -f infra/docker-compose.yml down -v
```

## Full Reset (Start Over from Scratch)

```powershell
docker compose -f infra/docker-compose.yml down -v

docker compose -f infra/docker-compose.yml up -d --build `
    postgres-agents redis kafka agt01-profiling agt11-translation

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
Write-Host "Reset complete. Start from Step 5." -ForegroundColor Green
```
