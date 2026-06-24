# AGT-07 Review Generation Agent — Demo Runbook

> Validates AGT-07 from a fresh terminal to 100% confirmed working.
> All Docker — no local Python venv required.
> All commands are PowerShell from the **repo root** (`ai-agentic-english`).

---

## Before You Start — Navigate to Repo Root

Every command in this file must run from the repo root.

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
| AGT-07 Review Generation | 8107 |
| AGT-06 Memory | 8106 |

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

AGT-07 depends on AGT-06 for all LTM reads. AGT-06 needs Postgres, Redis, and Kafka.

```powershell
docker compose -f infra/docker-compose.yml up -d --build `
    postgres-agents redis kafka `
    agt06-memory agt07-review
```

First-time build takes 3–8 minutes. Subsequent runs are under 30 seconds.

**If "no configuration file provided":**
```powershell
Get-Location  # must end with ai-agentic-english
```

**If a port is already in use:**
```powershell
# For port 8107
netstat -ano | findstr ":8107"
taskkill /PID <the-pid> /F
# For port 8106
netstat -ano | findstr ":8106"
taskkill /PID <the-pid> /F
# Re-run Step 2
```

**If a container shows Exit immediately after compose up:**
```powershell
docker compose -f infra/docker-compose.yml logs agt07-review --tail=50
docker compose -f infra/docker-compose.yml logs agt06-memory --tail=50
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

Do not continue to Step 4 until this loop exits.

---

## STEP 4 — Run Database Migrations

> Required on first run and after any `docker compose down -v`. Safe to re-run.

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

**If a migration fails with "already exists":**
```powershell
# Safe to ignore — migrations use IF NOT EXISTS. Re-run the loop.
```

**If migration fails with a real error:**
```powershell
docker compose -f infra/docker-compose.yml logs postgres-agents --tail=30
```

---

## STEP 5 — Wait for Both Agents to Be Healthy

```powershell
$agents = @(
    @{ Name = "agt06-memory";  Url = "http://localhost:8106/health" },
    @{ Name = "agt07-review";  Url = "http://localhost:8107/health" }
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

**If agt06-memory times out:**
```powershell
docker compose -f infra/docker-compose.yml logs agt06-memory --tail=50
# Common causes:
#   DB table not found → re-run Step 4
#   Port conflict → kill the process using that port
```

**If agt07-review times out:**
```powershell
docker compose -f infra/docker-compose.yml logs agt07-review --tail=50
```

---

## STEP 6 — Seed Demo Data

AGT-07 reads vocabulary and error data from AGT-06's LTM (Postgres). We seed three word types:
- **Due items** (R < 0.9): `ephemeral` (3 days old, S=1.0 → R≈0.05), `ubiquitous` (7 days old, S=0.5 → R≈0.0), `nuanced` (never seen, `last_encounter=NULL` → R≈0.0)
- **Not due** (R ≥ 0.9): `resilient` (1 day old, S=10.0 → R≈0.905)

```powershell
$sql = @"
-- Create a closed learning session (required FK for error_events)
INSERT INTO learning_sessions (session_id, clerk_user_id, skill_focus, end_time)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'user_agt07_demo',
    'SPEAKING',
    NOW() - INTERVAL '3 days'
)
ON CONFLICT (session_id) DO NOTHING;

-- Seed grammar error history
INSERT INTO error_events (session_id, clerk_user_id, error_type, skill_domain, severity, context_excerpt)
VALUES
    ('a0000000-0000-0000-0000-000000000001', 'user_agt07_demo', 'verb_tense', 'SPEAKING', 2, 'I go there yesterday and meet my manager.'),
    ('a0000000-0000-0000-0000-000000000001', 'user_agt07_demo', 'article',    'WRITING',  1, 'She is a honest and dedicated employee.')
ON CONFLICT DO NOTHING;

-- Seed vocabulary items: 3 due + 1 not due
INSERT INTO vocabulary_mastery (clerk_user_id, word, context_sentences, last_encounter, encounter_count, sm_stability, sm_retrievability)
VALUES
    ('user_agt07_demo', 'ephemeral',  ARRAY['The morning mist was ephemeral.'],        NOW() - INTERVAL '3 days', 2, 1.0,  0.05),
    ('user_agt07_demo', 'ubiquitous', ARRAY['Coffee is ubiquitous in offices.'],       NOW() - INTERVAL '7 days', 1, 0.5,  0.00),
    ('user_agt07_demo', 'resilient',  ARRAY['She is resilient under pressure.'],       NOW() - INTERVAL '1 day',  3, 10.0, 0.90),
    ('user_agt07_demo', 'nuanced',    ARRAY['His feedback was nuanced and clear.'],    NULL,                      0, 1.0,  0.00)
ON CONFLICT (clerk_user_id, word) DO UPDATE SET
    last_encounter    = EXCLUDED.last_encounter,
    encounter_count   = EXCLUDED.encounter_count,
    sm_stability      = EXCLUDED.sm_stability,
    sm_retrievability = EXCLUDED.sm_retrievability,
    context_sentences = EXCLUDED.context_sentences;

-- Confirm seeded rows
SELECT word, encounter_count, sm_stability,
       ROUND(EXTRACT(EPOCH FROM (NOW() - last_encounter))/86400, 1) AS days_since
FROM vocabulary_mastery
WHERE clerk_user_id = 'user_agt07_demo'
ORDER BY last_encounter ASC NULLS FIRST;
"@

$sql | docker exec -i ai-agentic-english-postgres-agents-1 psql -U postgres -d agent_ltm
```

**Expected output (last query):**
```
   word    | encounter_count | sm_stability | days_since
-----------+-----------------+--------------+------------
 nuanced   |               0 |          1.0 |
 ubiquitous|               1 |          0.5 |        7.0
 ephemeral |               2 |          1.0 |        3.0
 resilient |               3 |         10.0 |        1.0
(4 rows)
```

**If `ON CONFLICT DO NOTHING` silently skips the error_events insert:**

This happens if you seeded before. The data is already there — continue to Step 7.

**If psql returns "relation does not exist":**
```powershell
# Migrations were not applied. Re-run Step 4, then retry Step 6.
```

---

## PHASE 1 — Health Check

### Step 7 — Verify Both Agents Respond

```powershell
Invoke-RestMethod -Uri http://localhost:8107/health | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:8106/health | ConvertTo-Json
```

**Expected:**
```json
{ "status": "ok", "agent": "AGT-07", "name": "Review Generation" }
{ "status": "ok", "agent": "AGT-06", "name": "Memory & Knowledge" }
```

**If AGT-07 returns "connection refused":**
```powershell
docker compose -f infra/docker-compose.yml logs agt07-review --tail=20
# Then re-run Step 5 to wait for it.
```

---

## PHASE 2 — Due Items Schedule

### Step 8 — Retrieve Due Vocabulary Items

```powershell
$due = Invoke-RestMethod -Uri http://localhost:8107/schedule/user_agt07_demo/due
$due | ConvertTo-Json -Depth 5
```

**Expected — 3 items sorted by retrievability ascending (most urgent first):**

| Field | Value |
|---|---|
| Array length | 3 |
| `[0].word` | `"ubiquitous"` or `"nuanced"` (tied at R≈0.0000) |
| `[1].word` | `"nuanced"` or `"ubiquitous"` |
| `[2].word` | `"ephemeral"` |
| `[0].retrievability` | `0.0` |
| `[2].retrievability` | approx `0.05` (< 0.9) |
| Each item contains | `vocab_id`, `word`, `retrievability`, `days_since`, `sm_stability`, `context_sentences` |

`resilient` must NOT appear (R≈0.9048 ≥ 0.9 threshold).

```powershell
# Quick assertion
Write-Host "Due items: $($due.Count)  (expected: 3)"
if ($due.Count -eq 3) {
    Write-Host "PASS: Correct number of due items." -ForegroundColor Green
} else {
    Write-Host "FAIL: Expected 3, got $($due.Count)" -ForegroundColor Red
}

# Confirm resilient is absent
$words = $due | ForEach-Object { $_.word }
if ($words -notcontains "resilient") {
    Write-Host "PASS: resilient correctly excluded (R >= 0.9)." -ForegroundColor Green
} else {
    Write-Host "FAIL: resilient should not be due." -ForegroundColor Red
}

# Save the most urgent item's vocab_id for Step 9
$VOCAB_ID = $due[0].vocab_id
Write-Host "VOCAB_ID (most urgent) = $VOCAB_ID"
```

**If the list is empty:**
```powershell
# AGT-06 returned no data or vocab was seeded with wrong timestamps.
# Verify seed:
$verifyBody = '{"clerk_user_id":"user_agt07_demo"}'
Invoke-RestMethod -Uri http://localhost:8106/ltm/user_agt07_demo/vocabulary | ConvertTo-Json -Depth 3
# If empty: re-run Step 6.
# If populated but due returns empty: check if last_encounter timestamps are past
```

**If 4 items returned instead of 3:**
```powershell
# resilient is being included — check its actual retrievability:
$due | Where-Object { $_.word -eq "resilient" } | ConvertTo-Json
# R should be 0.9048 — this is >= 0.9 so should not be due.
# If included, the DB stability for resilient may differ from seeded value.
# Force-correct via:
$fixSql = "UPDATE vocabulary_mastery SET sm_stability = 10.0, last_encounter = NOW() - INTERVAL '1 day' WHERE clerk_user_id = 'user_agt07_demo' AND word = 'resilient';"
$fixSql | docker exec -i ai-agentic-english-postgres-agents-1 psql -U postgres -d agent_ltm
# Retry Step 8.
```

---

## PHASE 3 — Rate a Vocabulary Item

### Step 9 — Submit a Review Rating

Submit quality=4 (correct recall) for the most urgent item:

```powershell
$rateBody = @{
    item_id = $VOCAB_ID
    quality  = 4
} | ConvertTo-Json

$rateResult = Invoke-RestMethod -Uri "http://localhost:8107/schedule/user_agt07_demo/rate" `
    -Method POST -ContentType "application/json" -Body $rateBody
$rateResult | ConvertTo-Json
```

**Expected:**

| Field | Expected |
|---|---|
| `item_id` | same UUID as `$VOCAB_ID` |
| `quality` | `4` |
| `new_stability` | a float > 0 (updated SM-2 stability, written to DB) |
| `next_review` | ISO 8601 datetime approximately 7 days from now |

> `new_stability` is computed from the item's current `sm_stability` in the DB and written back.
> There is no `stub` field — `rate_item` performs real DB reads and writes.
> Migration 012 (`next_review_at` column) must be applied first — Step 4 handles this.

```powershell
# Assert shape
$shapeOk = ($rateResult.item_id -eq $VOCAB_ID) -and
           ($rateResult.quality -eq 4) -and
           ($null -ne $rateResult.new_stability) -and
           ($null -ne $rateResult.next_review)

if ($shapeOk) {
    Write-Host "PASS: rate endpoint returned correct shape." -ForegroundColor Green
    Write-Host "  new_stability = $($rateResult.new_stability)"
} else {
    Write-Host "FAIL: unexpected shape." -ForegroundColor Red
    $rateResult | ConvertTo-Json
}

# Assert next_review is parseable as a date and is in the future
$nextReview = [datetime]::Parse($rateResult.next_review)
if ($nextReview -gt (Get-Date)) {
    Write-Host "PASS: next_review is in the future ($($rateResult.next_review))." -ForegroundColor Green
} else {
    Write-Host "FAIL: next_review is in the past." -ForegroundColor Red
}
```

Test all quality levels (0 = forgotten, 5 = perfect):

```powershell
foreach ($q in @(0, 1, 2, 3, 4, 5)) {
    $body = @{ item_id = $VOCAB_ID; quality = $q } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "http://localhost:8107/schedule/user_agt07_demo/rate" `
        -Method POST -ContentType "application/json" -Body $body
    Write-Host "quality=$q → next_review=$($r.next_review)  new_stability=$($r.new_stability)"
}
```

**Expected for each quality:**
- q=0,1,2 → next_review ≈ 1 day from now; new_stability ≤ current (forgotten, decays — minimum 1.0)
- q=3 → next_review ≈ 3 days from now; new_stability unchanged
- q=4 → next_review ≈ 7 days from now; new_stability slightly higher
- q=5 → next_review ≈ 14 days from now; new_stability highest increase

---

## PHASE 4 — Daily Review Test

### Step 10 — Build a Personalised Daily Test

```powershell
$test = Invoke-RestMethod -Uri "http://localhost:8107/tests/user_agt07_demo/daily?size=4"
$test | ConvertTo-Json -Depth 3
```

**Expected — 4 items: 2 vocabulary + 2 grammar:**

```json
[
  { "type": "vocabulary", "word": "resilient", "context": "She is resilient under pressure." },
  { "type": "vocabulary", "word": "ephemeral",  "context": "The morning mist was ephemeral." },
  { "type": "grammar", "error_type": "verb_tense", "skill_domain": "SPEAKING", "context": "I go there yesterday and meet my manager." },
  { "type": "grammar", "error_type": "article",    "skill_domain": "WRITING",  "context": "She is a honest and dedicated employee." }
]
```

```powershell
# Assert total count
Write-Host "Test items: $($test.Count)  (expected: 4)"

# Verify vocab and grammar items both present
$vocabItems    = $test | Where-Object { $_.type -eq "vocabulary" }
$grammarItems  = $test | Where-Object { $_.type -eq "grammar" }
Write-Host "  vocab:   $($vocabItems.Count)  (expected: 2)"
Write-Host "  grammar: $($grammarItems.Count)  (expected: 2)"

if ($vocabItems.Count -eq 2 -and $grammarItems.Count -eq 2) {
    Write-Host "PASS: daily test composition correct." -ForegroundColor Green
} else {
    Write-Host "FAIL: unexpected item counts." -ForegroundColor Red
}

# Verify no duplicate grammar error types
$grammarTypes = $grammarItems | ForEach-Object { $_.error_type }
$uniqueTypes  = $grammarTypes | Select-Object -Unique
if ($grammarTypes.Count -eq $uniqueTypes.Count) {
    Write-Host "PASS: no duplicate grammar error types." -ForegroundColor Green
} else {
    Write-Host "FAIL: duplicate grammar error types detected." -ForegroundColor Red
}
```

**If the test returns empty (`[]`):**
```powershell
# AGT-06 failed to return vocab or errors. Check directly:
Invoke-RestMethod -Uri "http://localhost:8106/ltm/user_agt07_demo/vocabulary?limit=50" | ConvertTo-Json -Depth 3
Invoke-RestMethod -Uri "http://localhost:8106/ltm/user_agt07_demo/errors?limit=50" | ConvertTo-Json -Depth 3
# If empty: re-run Step 6 to seed data.
```

**If fewer than 4 items returned (e.g., 2 or 3):**
```powershell
# Grammar deduplication may have found fewer than needed unique error types.
# Check what error_types were seeded:
$errSql = "SELECT DISTINCT error_type FROM error_events WHERE clerk_user_id = 'user_agt07_demo';"
$errSql | docker exec -i ai-agentic-english-postgres-agents-1 psql -U postgres -d agent_ltm
# Should show: verb_tense, article
# If missing, re-run Step 6 seed.
```

---

## PHASE 5 — Reminder Context (Internal Endpoint)

### Step 11 — Verify Reminder Context Shape

This endpoint is called by the TypeScript notification-service. It requires the `x-internal-secret` header.

```powershell
# Without secret → must return 403
$r403 = try {
    Invoke-RestMethod -Uri "http://localhost:8107/internal/reminders/user_agt07_demo/context"
    "no-error"
} catch {
    $_.Exception.Response.StatusCode.value__
}

if ($r403 -eq 403) {
    Write-Host "PASS: missing secret correctly returns 403." -ForegroundColor Green
} else {
    Write-Host "FAIL: Expected 403, got: $r403" -ForegroundColor Red
}
```

```powershell
# Wrong secret → must return 403
$r403wrong = try {
    Invoke-RestMethod -Uri "http://localhost:8107/internal/reminders/user_agt07_demo/context" `
        -Headers @{ "x-internal-secret" = "wrong-secret" }
    "no-error"
} catch {
    $_.Exception.Response.StatusCode.value__
}

if ($r403wrong -eq 403) {
    Write-Host "PASS: wrong secret correctly returns 403." -ForegroundColor Green
} else {
    Write-Host "FAIL: Expected 403, got: $r403wrong" -ForegroundColor Red
}
```

```powershell
# Correct secret → must return reminder context
$reminder = Invoke-RestMethod -Uri "http://localhost:8107/internal/reminders/user_agt07_demo/context" `
    -Headers @{ "x-internal-secret" = "dev-internal-secret" }
$reminder | ConvertTo-Json -Depth 5
```

**Expected shape:**

| Field | Expected |
|---|---|
| `userId` | `"user_agt07_demo"` |
| `dueReviewCount` | `3` (ephemeral, ubiquitous, nuanced) |
| `vocabOfTheDay.vocabItemId` | a UUID string |
| `vocabOfTheDay.term` | `"nuanced"` (encounter_count=0, the least-familiar) |
| `vocabOfTheDay.meaning` | `""` (empty string — pending Phase 8+) |
| `vocabOfTheDay.exampleSentence` | `"His feedback was nuanced and clear."` |

```powershell
# Assert shape
if ($reminder.userId -eq "user_agt07_demo") {
    Write-Host "PASS: userId matches." -ForegroundColor Green
} else {
    Write-Host "FAIL: userId = $($reminder.userId)" -ForegroundColor Red
}

if ($reminder.dueReviewCount -eq 3) {
    Write-Host "PASS: dueReviewCount = 3." -ForegroundColor Green
} else {
    Write-Host "FAIL: dueReviewCount = $($reminder.dueReviewCount)  (expected: 3)" -ForegroundColor Red
}

if ($reminder.vocabOfTheDay.term -eq "nuanced") {
    Write-Host "PASS: vocabOfTheDay is 'nuanced' (least-familiar word)." -ForegroundColor Green
} else {
    Write-Host "NOTE: vocabOfTheDay = '$($reminder.vocabOfTheDay.term)' — may differ if encounter_counts are tied." -ForegroundColor Yellow
}

if ($null -ne $reminder.vocabOfTheDay.vocabItemId) {
    Write-Host "PASS: vocabItemId is present." -ForegroundColor Green
} else {
    Write-Host "FAIL: vocabItemId is null." -ForegroundColor Red
}
```

**If `dueReviewCount` is 0:**
```powershell
# AGT-06 returned no vocab or all items are above the retrievability threshold.
# Check vocab directly:
Invoke-RestMethod -Uri "http://localhost:8106/ltm/user_agt07_demo/vocabulary" | ConvertTo-Json
# If empty: re-run Step 6.
# If present but dueReviewCount=0: last_encounter timestamps may be wrong.
# Fix with:
$fixTs = @"
UPDATE vocabulary_mastery SET last_encounter = NOW() - INTERVAL '3 days'
WHERE clerk_user_id = 'user_agt07_demo' AND word = 'ephemeral';
UPDATE vocabulary_mastery SET last_encounter = NOW() - INTERVAL '7 days', sm_stability = 0.5
WHERE clerk_user_id = 'user_agt07_demo' AND word = 'ubiquitous';
UPDATE vocabulary_mastery SET last_encounter = NULL
WHERE clerk_user_id = 'user_agt07_demo' AND word = 'nuanced';
"@
$fixTs | docker exec -i ai-agentic-english-postgres-agents-1 psql -U postgres -d agent_ltm
# Retry Step 11.
```

**If `vocabOfTheDay` is null:**
```powershell
# vocab_mastery table is empty — re-run Step 6.
```

---

## PHASE 6 — AGT-06 Down (Graceful Degradation)

### Step 12 — Verify AGT-07 Degrades Gracefully When AGT-06 Is Unavailable

```powershell
# Stop AGT-06
docker compose -f infra/docker-compose.yml stop agt06-memory
Start-Sleep 4

# GET /due should return empty list, not 500
$downResult = Invoke-RestMethod -Uri http://localhost:8107/schedule/user_agt07_demo/due
Write-Host "Items when AGT-06 is down: $($downResult.Count)  (expected: 0 — graceful empty)"
if ($downResult.Count -eq 0) {
    Write-Host "PASS: returns [] when AGT-06 is down." -ForegroundColor Green
} else {
    Write-Host "FAIL: expected empty list." -ForegroundColor Red
}

# Reminder context should return dueReviewCount=0 and vocabOfTheDay=null
$reminderDown = Invoke-RestMethod -Uri "http://localhost:8107/internal/reminders/user_agt07_demo/context" `
    -Headers @{ "x-internal-secret" = "dev-internal-secret" }

if ($reminderDown.dueReviewCount -eq 0 -and $null -eq $reminderDown.vocabOfTheDay) {
    Write-Host "PASS: reminder context gracefully degrades when AGT-06 is down." -ForegroundColor Green
} else {
    Write-Host "FAIL: unexpected values — dueCount=$($reminderDown.dueReviewCount) vod=$($reminderDown.vocabOfTheDay)" -ForegroundColor Red
}

# Bring AGT-06 back
docker compose -f infra/docker-compose.yml start agt06-memory
Write-Host "Waiting 8s for AGT-06 to restart..."
Start-Sleep 8
Invoke-RestMethod -Uri http://localhost:8106/health | ConvertTo-Json
```

---

## Final Pass/Fail Checklist

| # | Test | Pass Criteria |
|---|---|---|
| 1 | Health — both agents | `status: ok` for AGT-07 and AGT-06 |
| 2 | GET /schedule/due | 3 items returned, `resilient` absent, sorted by retrievability ASC |
| 3 | Due items have correct R values | ephemeral≈0.05, ubiquitous≈0.0, nuanced≈0.0 |
| 4 | POST /schedule/rate quality=4 | `next_review` ≈ 7 days out, `new_stability` > 0 |
| 5 | Rate all quality levels (0–5) | interval matches STUB_INTERVALS: 1/1/1/3/7/14 days |
| 6 | GET /tests/daily?size=4 | 4 items: 2 vocab + 2 grammar, no duplicate grammar types |
| 7 | GET /internal/reminders — no secret | HTTP 403 |
| 8 | GET /internal/reminders — wrong secret | HTTP 403 |
| 9 | GET /internal/reminders — correct secret | `dueReviewCount=3`, `vocabOfTheDay.term="nuanced"` |
| 10 | AGT-06 down — GET /due | returns `[]` (not HTTP 5xx) |
| 11 | AGT-06 down — reminder context | `dueReviewCount=0`, `vocabOfTheDay=null` |

---

## Troubleshooting Quick Reference

| Symptom | Command |
|---|---|
| Container not starting | `docker compose -f infra/docker-compose.yml logs <service> --tail=50` |
| postgres-agents stuck unhealthy | `docker compose -f infra/docker-compose.yml restart postgres-agents` |
| Migration error | `docker compose -f infra/docker-compose.yml logs postgres-agents --tail=20` |
| GET /due returns empty | Verify seed: `"SELECT * FROM vocabulary_mastery WHERE clerk_user_id='user_agt07_demo';" \| docker exec -i ai-agentic-english-postgres-agents-1 psql -U postgres -d agent_ltm` |
| Wrong dueReviewCount | Check `last_encounter` timestamps — must be old enough relative to `sm_stability` |
| Port already in use | `netstat -ano \| findstr :<port>` then `taskkill /PID <pid> /F` |
| Wrong container name | `docker ps --format "table {{.Names}}"` |

---

## Clean Shutdown

```powershell
# Stop containers (keeps volumes/data for next run):
docker compose -f infra/docker-compose.yml stop `
    agt07-review agt06-memory kafka redis postgres-agents

# Stop and remove containers + networks (keeps volumes):
docker compose -f infra/docker-compose.yml down

# Full wipe including volumes (requires re-seeding next run):
docker compose -f infra/docker-compose.yml down -v
```

## Full Reset (Start Over from Scratch)

```powershell
docker compose -f infra/docker-compose.yml down -v

docker compose -f infra/docker-compose.yml up -d --build `
    postgres-agents redis kafka agt06-memory agt07-review

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
