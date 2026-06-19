# AGT-03 AI Tutor — Demo Runbook

> Validates AGT-03 from a fresh terminal to 100% confirmed working.
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

## Agent Ports

| Agent | Port |
|---|---|
| AGT-03 AI Tutor | 8103 |
| AGT-06 Memory | 8106 |
| AGT-01 Profiling | 8101 |
| AGT-02 Learning Path | 8102 |

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

## STEP 2 — Start all required services

AGT-03 depends on all three other agents:
- **AGT-06** (critical path): session state must be written to STM or `start_session` hard-fails
- **AGT-01** (best-effort): profile fetch — falls back to `profile_loaded: false` on failure
- **AGT-02** (best-effort): plan fetch — falls back to `plan_loaded: false` on failure

```powershell
docker compose -f infra/docker-compose.yml up -d --build `
    postgres-agents redis kafka `
    agt06-memory agt01-profiling agt02-learning-path agt03-tutor
```

First-time build takes 3–8 minutes. Subsequent runs are under 30 seconds.

**If "no configuration file provided":**
```powershell
Get-Location  # must end with .worktrees\agt06-agt01-agt02-agt03-sprint
```

**If a port is already in use (e.g. 8103):**
```powershell
netstat -ano | findstr ":8103"
taskkill /PID <the-pid> /F
# Re-run Step 2.
```

**If a container shows Exit:**
```powershell
docker compose -f infra/docker-compose.yml logs <service> --tail=50
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
    if ($LASTEXITCODE -ne 0) {
        Write-Host "FAILED on $($_.Name). Check error above." -ForegroundColor Red
        return
    }
}
Write-Host "Migrations complete." -ForegroundColor Green
```

**Expected:** each filename printed, then SQL output (`CREATE TABLE`, `CREATE INDEX`).

**If a migration fails:**
```powershell
docker compose -f infra/docker-compose.yml logs postgres-agents --tail=30
```

---

## STEP 5 — Wait for all 4 agents to be healthy

```powershell
$agents = @(
    @{ Name = "agt06-memory";        Url = "http://localhost:8106/health" },
    @{ Name = "agt01-profiling";     Url = "http://localhost:8101/health" },
    @{ Name = "agt02-learning-path"; Url = "http://localhost:8102/health" },
    @{ Name = "agt03-tutor";         Url = "http://localhost:8103/health" }
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

**If an agent times out:**
```powershell
docker compose -f infra/docker-compose.yml logs <service> --tail=50
# Common causes:
#   DB table not found → re-run Step 4
#   Port conflict → kill the process using that port
#   Missing env var → check infra/docker-compose.yml
```

---

## PHASE 1 — Health Checks

### Step 6 — Verify all 4 agents respond

```powershell
Invoke-RestMethod -Uri http://localhost:8103/health | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:8106/health | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:8101/health | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:8102/health | ConvertTo-Json
```

**Expected for each:**
```json
{ "status": "ok", "agent": "AGT-03", "name": "AI Tutor" }
{ "status": "ok", "agent": "AGT-06", "name": "Memory & Knowledge" }
{ "status": "ok", "agent": "AGT-01", "name": "User Profiling" }
{ "status": "ok", "agent": "AGT-02", "name": "Learning Path" }
```

**If any returns "connection refused":** that service is not yet up — re-run Step 5.

---

## PHASE 2 — Full Session Lifecycle (Happy Path)

### Step 7 — Start a session

```powershell
$body = '{"clerk_user_id":"user_validate_001","skill_focus":"SPEAKING"}'
$startResult = Invoke-RestMethod -Uri http://localhost:8103/sessions/start `
    -Method POST -ContentType "application/json" -Body $body
$startResult | ConvertTo-Json
$SESSION_ID = $startResult.session_id
Write-Host "SESSION_ID = $SESSION_ID"
```

**Expected — verify all 6 fields:**

| Field | Expected | Meaning |
|---|---|---|
| `session_id` | a UUID string | auto-generated |
| `clerk_user_id` | `user_validate_001` | echoed back |
| `skill_focus` | `SPEAKING` | uppercased correctly |
| `opening_message` | starts with `"Hi! Let's practice speaking..."` | canned SPEAKING opener |
| `profile_loaded` | `false` | new user has no LTM profile yet — correct |
| `plan_loaded` | `false` | no learning plan exists — correct |

> `profile_loaded: false` and `plan_loaded: false` are correct for a brand new user. AGT-03 must return a valid response, not crash.

**If HTTP 500:**
```powershell
docker compose -f infra/docker-compose.yml logs agt03-tutor  --tail=30
docker compose -f infra/docker-compose.yml logs agt06-memory --tail=30
# AGT-06 is the critical path. If it's down, start_session hard-fails.
```

**If SESSION_ID is null or empty:**
```powershell
# start_session failed. Fix the error shown above, then re-run Step 7.
```

---

### Step 8 — Send two text turns

**Turn 1:**
```powershell
$t1Body = @{
    session_id    = $SESSION_ID
    clerk_user_id = "user_validate_001"
    user_message  = "I work as a finance manager and write emails to international clients."
} | ConvertTo-Json

$turn1 = Invoke-RestMethod -Uri http://localhost:8103/sessions/turn `
    -Method POST -ContentType "application/json" -Body $t1Body
$turn1 | ConvertTo-Json
```

**Expected:**

| Field | Expected |
|---|---|
| `assistant_message` | starts with `[MOCK LLM AGT03] Got it - you said: I work as a finance...` |
| `transcript_text` | `"I work as a finance manager and write emails to international clients."` |
| `mock_feedback` | `"[MOCK] Good attempt! Keep practising."` |
| `language` | `"en"` |

**Turn 2:**
```powershell
$t2Body = @{
    session_id    = $SESSION_ID
    clerk_user_id = "user_validate_001"
    user_message  = "My biggest challenge is sounding professional but not too formal."
} | ConvertTo-Json

$turn2 = Invoke-RestMethod -Uri http://localhost:8103/sessions/turn `
    -Method POST -ContentType "application/json" -Body $t2Body
$turn2 | ConvertTo-Json
```

Same shape expected. `assistant_message` echoes the second message.

---

### Step 9 — Check session state (during active session)

```powershell
$state = Invoke-RestMethod -Uri "http://localhost:8103/sessions/$SESSION_ID/state"
$state | ConvertTo-Json -Depth 5
```

**Expected:**
```json
{
  "session_id": "<your-uuid>",
  "state": {
    "skill_focus": "SPEAKING",
    "phase": "warm_up"
  }
}
```

> If `state` is `null`: AGT-03 failed to write to AGT-06 STM during `start_session`. Check AGT-06 logs.

**Bonus — verify the context buffer directly in AGT-06:**
```powershell
$ctx = Invoke-RestMethod -Uri "http://localhost:8106/sessions/$SESSION_ID/context"
$ctx | ConvertTo-Json -Depth 5
Write-Host "Context entry count: $($ctx.Count)  (expected: 5)"
```

**Expected — exactly 5 entries in order:**
```
[0] role: "assistant"  <- opening message
[1] role: "user"       <- turn 1 input
[2] role: "assistant"  <- turn 1 reply
[3] role: "user"       <- turn 2 input
[4] role: "assistant"  <- turn 2 reply
```

---

### Step 10 — End the session

```powershell
$endBody = @{
    session_id    = $SESSION_ID
    clerk_user_id = "user_validate_001"
    skill_focus   = "SPEAKING"
} | ConvertTo-Json

$endResult = Invoke-RestMethod -Uri http://localhost:8103/sessions/end `
    -Method POST -ContentType "application/json" -Body $endBody
$endResult | ConvertTo-Json
```

**Expected — verify all 4 fields:**

| Field | Expected |
|---|---|
| `session_id` | same UUID from Step 7 |
| `consolidated` | `true` — AGT-06 wrote STM to LTM |
| `duration_minutes` | a float > 0 |
| `turns_completed` | `2` |

**If `consolidated: false`:**
```powershell
docker compose -f infra/docker-compose.yml logs agt06-memory --tail=40
# Look for asyncpg errors. Most common cause: learning_sessions table missing — re-run Step 4.
```

---

### Step 11 — Verify session state persists after end

```powershell
$postEnd = Invoke-RestMethod -Uri "http://localhost:8103/sessions/$SESSION_ID/state"
$postEnd | ConvertTo-Json -Depth 5

if ($postEnd.state -ne $null) {
    Write-Host "PASS: Session state still in Redis after end_session." -ForegroundColor Green
} else {
    Write-Host "FAIL: State is gone. Redis key may have expired or was never written." -ForegroundColor Red
}
```

---

## PHASE 3 — Kafka Event Verification

### Step 12 — Verify `session.start` event

The topic is `session.start` — not `agent.session.start`.

```powershell
docker exec -it ai-agentic-english-kafka-1 /opt/kafka/bin/kafka-console-consumer.sh `
    --bootstrap-server localhost:9092 `
    --topic session.start `
    --from-beginning --max-messages 10 --timeout-ms 5000
```

**Expected — at least one line containing your session:**
```json
{"eventId": "...", "schemaVersion": 1, "occurredAt": "...", "agentId": "AGT03", "sessionId": "<your-uuid>", "clerkUserId": "user_validate_001", "skillFocus": "SPEAKING"}
```

The `"Error processing message, terminating consumer process"` line followed by `TimeoutException` is **normal** — it means the consumer hit the 5-second `--timeout-ms` limit and exited cleanly. `Processed a total of N messages` is the real result line.

**If the topic does not exist or returns no messages:**
```powershell
# List all topics
docker exec -it ai-agentic-english-kafka-1 /opt/kafka/bin/kafka-topics.sh `
    --bootstrap-server localhost:9092 --list
# If session.start is not listed, check AGT-03 logs for Kafka producer errors:
docker compose -f infra/docker-compose.yml logs agt03-tutor --tail=50
```

---

### Step 13 — Verify `session.end` event

The topic is `session.end` — not `agent.session.end`.

```powershell
docker exec -it ai-agentic-english-kafka-1 /opt/kafka/bin/kafka-console-consumer.sh `
    --bootstrap-server localhost:9092 `
    --topic session.end `
    --from-beginning --max-messages 10 --timeout-ms 5000
```

**Expected — at least one line with `durationMinutes > 0`:**
```json
{"eventId": "...", "schemaVersion": 1, "occurredAt": "...", "agentId": "AGT03", "sessionId": "<your-uuid>", "clerkUserId": "user_validate_001", "skillFocus": "SPEAKING", "durationMinutes": 0.0234}
```

`durationMinutes` must be > 0 and match what `end_session` returned in Step 10.

The `"Error processing message, terminating consumer process"` / `TimeoutException` at the end is **normal** — same as Step 12.

---

## PHASE 4 — AGT-01 Downstream Effect

### Step 14 — Confirm AGT-01 processed the session.end event

AGT-01's Kafka consumer listens to `session.end` and updates the learner profile. Give it a moment:

```powershell
Write-Host "Waiting 6s for AGT-01 consumer to process event..."
Start-Sleep 6

$profile = Invoke-RestMethod -Uri http://localhost:8101/profile/user_validate_001
$profile | ConvertTo-Json -Depth 5
```

**Expected — verify both fields:**

| Field | Expected |
|---|---|
| `cold_start_flag` | `false` — AGT-01 cleared it after the first completed session |
| `behavioral_profile` | has `avg_session_length` > 0 — EWMA was applied |

**If `cold_start_flag` is still `true`:**
```powershell
docker compose -f infra/docker-compose.yml logs agt01-profiling --tail=50
# Filter for relevant lines:
docker compose -f infra/docker-compose.yml logs agt01-profiling --tail=50 2>&1 | Select-String "session_end|user_validate_001"
# Possible cause: Kafka consumer hasn't caught up — wait 10s and retry.
```

---

## PHASE 5 — All 4 Skill Focus Values

### Step 15 — Test all opening messages

```powershell
$expectedOpeners = @{
    "LISTENING" = "practice listening"
    "SPEAKING"  = "practice speaking"
    "READING"   = "reading comprehension"
    "WRITING"   = "practice writing"
}

foreach ($skill in @("LISTENING", "SPEAKING", "READING", "WRITING")) {
    $body = @{ clerk_user_id = "user_validate_001"; skill_focus = $skill } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri http://localhost:8103/sessions/start `
        -Method POST -ContentType "application/json" -Body $body

    $keyword = $expectedOpeners[$skill]
    if ($r.opening_message -like "*$keyword*") {
        Write-Host "PASS [$skill]: $($r.opening_message.Substring(0, [Math]::Min(65,$r.opening_message.Length)))..."
    } else {
        Write-Host "FAIL [$skill]: Unexpected opening: $($r.opening_message)" -ForegroundColor Red
    }

    $endBody = @{
        session_id    = $r.session_id
        clerk_user_id = "user_validate_001"
        skill_focus   = $skill
    } | ConvertTo-Json
    Invoke-RestMethod -Uri http://localhost:8103/sessions/end `
        -Method POST -ContentType "application/json" -Body $endBody | Out-Null
}
```

**Expected:**
```
PASS [LISTENING]: Hi! Today we'll practice listening. I'll describe a short workpl...
PASS [SPEAKING]:  Hi! Let's practice speaking. Tell me about a typical task you han...
PASS [READING]:   Hi! Today we'll work on reading comprehension using a short workpl...
PASS [WRITING]:   Hi! Let's practice writing. I'll give you a short prompt and we c...
```

---

## PHASE 6 — Edge Cases

### Step 16 — AGT-06 down during start_session must hard-fail

AGT-06 is the critical path. If it is down, `start_session` must return HTTP 5xx, not silently succeed.

```powershell
# Stop AGT-06
docker compose -f infra/docker-compose.yml stop agt06-memory
Start-Sleep 4

# Attempt start_session — must fail
try {
    $body = '{"clerk_user_id":"user_gap1","skill_focus":"SPEAKING"}'
    Invoke-RestMethod -Uri http://localhost:8103/sessions/start `
        -Method POST -ContentType "application/json" -Body $body
    Write-Host "FAIL: start_session succeeded when AGT-06 was down." -ForegroundColor Red
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -ge 500) {
        Write-Host "PASS: start_session correctly returned HTTP $code when AGT-06 is down." -ForegroundColor Green
    } else {
        Write-Host "UNEXPECTED: got HTTP $code" -ForegroundColor Red
    }
}

# Bring AGT-06 back
docker compose -f infra/docker-compose.yml start agt06-memory
Write-Host "Waiting 8s for AGT-06 to restart..."
Start-Sleep 8
Invoke-RestMethod -Uri http://localhost:8106/health | ConvertTo-Json
```

---

### Step 17 — Audio turn end-to-end (ASR path)

In `INFERENCE_MODE=mock`, ASR ignores actual bytes and returns `"Mock transcription of user speech."`.

```powershell
# Start a session
$s = Invoke-RestMethod -Uri http://localhost:8103/sessions/start -Method POST `
    -ContentType "application/json" `
    -Body '{"clerk_user_id":"user_audio","skill_focus":"SPEAKING"}'
$SID_AUDIO = $s.session_id

# Encode fake audio as base64
$fakeAudioB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes("fake-audio-content"))

# Send turn with audio_base64 instead of user_message
$audioBody = @{
    session_id    = $SID_AUDIO
    clerk_user_id = "user_audio"
    audio_base64  = $fakeAudioB64
} | ConvertTo-Json

$audioTurn = Invoke-RestMethod -Uri http://localhost:8103/sessions/turn `
    -Method POST -ContentType "application/json" -Body $audioBody
$audioTurn | ConvertTo-Json

if ($audioTurn.transcript_text -eq "Mock transcription of user speech.") {
    Write-Host "PASS: ASR path used — mock transcript returned." -ForegroundColor Green
} else {
    Write-Host "FAIL: Expected mock transcript, got: $($audioTurn.transcript_text)" -ForegroundColor Red
}

# Clean up
$cleanBody = @{
    session_id    = $SID_AUDIO
    clerk_user_id = "user_audio"
    skill_focus   = "SPEAKING"
} | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:8103/sessions/end `
    -Method POST -ContentType "application/json" -Body $cleanBody | Out-Null
Write-Host "Audio test session ended."
```

---

### Step 18 — Unknown skill_focus falls back to SPEAKING

```powershell
$body = '{"clerk_user_id":"user_validate_001","skill_focus":"GRAMMAR"}'
$r = Invoke-RestMethod -Uri http://localhost:8103/sessions/start `
    -Method POST -ContentType "application/json" -Body $body
$r | ConvertTo-Json

if ($r.opening_message -like "*practice speaking*") {
    Write-Host "PASS: Unknown skill_focus GRAMMAR correctly fell back to SPEAKING opener." -ForegroundColor Green
} else {
    Write-Host "FAIL: Got unexpected opening: $($r.opening_message)" -ForegroundColor Red
}

$endBody = @{
    session_id    = $r.session_id
    clerk_user_id = "user_validate_001"
    skill_focus   = "GRAMMAR"
} | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:8103/sessions/end `
    -Method POST -ContentType "application/json" -Body $endBody | Out-Null
```

---

### Step 19 — Empty turn must return HTTP 422

Both `user_message` and `audio_base64` absent must return 422, not silently pass.

```powershell
$s2 = Invoke-RestMethod -Uri http://localhost:8103/sessions/start -Method POST `
    -ContentType "application/json" `
    -Body '{"clerk_user_id":"user_validate_001","skill_focus":"SPEAKING"}'

try {
    $emptyBody = @{ session_id = $s2.session_id; clerk_user_id = "user_validate_001" } | ConvertTo-Json
    Invoke-RestMethod -Uri http://localhost:8103/sessions/turn `
        -Method POST -ContentType "application/json" -Body $emptyBody
    Write-Host "FAIL: Empty turn was accepted." -ForegroundColor Red
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -eq 422) {
        Write-Host "PASS: Empty turn correctly rejected with HTTP 422." -ForegroundColor Green
    } else {
        Write-Host "UNEXPECTED: got HTTP $code" -ForegroundColor Red
    }
}

# Clean up
$cleanBody = @{
    session_id    = $s2.session_id
    clerk_user_id = "user_validate_001"
    skill_focus   = "SPEAKING"
} | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:8103/sessions/end `
    -Method POST -ContentType "application/json" -Body $cleanBody | Out-Null
```

---

## Final Pass/Fail Checklist

| # | Test | Pass Criteria |
|---|---|---|
| 1 | Health — all 4 agents | `status: ok` for each |
| 2 | Start session | `opening_message` non-empty, no crash |
| 3 | profile_loaded fallback | `false` for new user — no error |
| 4 | plan_loaded fallback | `false` for new user — no error |
| 5 | Text turn | `assistant_message` starts with `[MOCK LLM AGT03]` |
| 6 | Turn count | `turns_completed: 2` after 2 turns |
| 7 | Session state (during) | `skill_focus: SPEAKING, phase: warm_up` |
| 8 | AGT-06 context buffer | 5 entries in order |
| 9 | End session | `consolidated: true, duration_minutes > 0` |
| 10 | State persists after end | `state` not null |
| 11 | Kafka `session.start` topic | JSON with `sessionId + skillFocus` |
| 12 | Kafka `session.end` topic | JSON with `durationMinutes > 0` |
| 13 | AGT-01 downstream | `cold_start_flag: false` after 6s wait |
| 14 | LISTENING opener | Contains "practice listening" |
| 15 | SPEAKING opener | Contains "practice speaking" |
| 16 | READING opener | Contains "reading comprehension" |
| 17 | WRITING opener | Contains "practice writing" |
| 18 | AGT-06 down = HTTP 5xx | HTTP 500 when AGT-06 is stopped |
| 19 | Audio turn | `transcript_text: "Mock transcription of user speech."` |
| 20 | Unknown skill_focus | GRAMMAR falls back to SPEAKING opener |
| 21 | Empty turn = HTTP 422 | HTTP 422 with no message or audio |

---

## Troubleshooting Quick Reference

| Symptom | Command |
|---|---|
| Container not starting | `docker compose -f infra/docker-compose.yml logs <service> --tail=50` |
| postgres-agents stuck unhealthy | `docker compose -f infra/docker-compose.yml restart postgres-agents` |
| Migration error | `docker compose -f infra/docker-compose.yml logs postgres-agents --tail=20` |
| AGT-03 returns 500 | `docker compose -f infra/docker-compose.yml logs agt03-tutor --tail=50` |
| `consolidated: false` | `docker compose -f infra/docker-compose.yml logs agt06-memory --tail=50` |
| Kafka no messages on `session.start` | Topic is `session.start`, not `agent.session.start` — verify with `--list` |
| AGT-01 did not update profile | `docker compose -f infra/docker-compose.yml logs agt01-profiling --tail=50` |
| Port already in use | `netstat -ano \| findstr :<port>` then `taskkill /PID <pid> /F` |
| Wrong container name | `docker ps --format "table {{.Names}}"` |

---

## Clean Shutdown

```powershell
# Stop the 4 agent containers (keeps volumes/data):
docker compose -f infra/docker-compose.yml stop `
    agt03-tutor agt02-learning-path agt01-profiling agt06-memory kafka redis postgres-agents

# Or stop and remove containers + networks (keeps volumes):
docker compose -f infra/docker-compose.yml down

# Full wipe including volumes (requires re-running migrations next time):
docker compose -f infra/docker-compose.yml down -v
```

## Full Reset

```powershell
docker compose -f infra/docker-compose.yml down -v

docker compose -f infra/docker-compose.yml up -d --build `
    postgres-agents redis kafka `
    agt06-memory agt01-profiling agt02-learning-path agt03-tutor

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
