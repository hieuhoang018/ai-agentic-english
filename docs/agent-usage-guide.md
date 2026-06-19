# Agent Usage & Testing Guide

> Covers AGT-06 (Memory), AGT-01 (Profiling), AGT-02 (Learning Path), AGT-03 (AI Tutor).
> All examples use PowerShell `Invoke-RestMethod`. Requires the docker-compose stack running.

---

## Stack Management

```powershell
# Start (rebuild images when code changes)
docker compose -f infra/docker-compose.yml up -d --build

# Stop
docker compose -f infra/docker-compose.yml down

# Tail all agent logs
docker compose -f infra/docker-compose.yml logs -f agt06-memory agt01-profiling agt02-learning-path agt03-tutor

# Live logs for one agent
docker compose -f infra/docker-compose.yml logs -f agt03-tutor
```

Ports:

| Agent | Port | Service Name |
|-------|------|--------------|
| AGT-06 Memory | 8106 | `agt06-memory` |
| AGT-01 Profiling | 8101 | `agt01-profiling` |
| AGT-02 Learning Path | 8102 | `agt02-learning-path` |
| AGT-03 AI Tutor | 8103 | `agt03-tutor` |

Health-check all four at once:

```powershell
8101,8102,8103,8106 | ForEach-Object {
    $r = Invoke-RestMethod "http://localhost:$_/health"
    Write-Host "[:$_] $($r.agent) — $($r.status)"
}
```

Expected output:
```
[:8101] AGT-01 — ok
[:8102] AGT-02 — ok
[:8103] AGT-03 — ok
[:8106] AGT-06 — ok
```

---

## AGT-06 — Memory & Knowledge Agent (`:8106`)

Owns all in-session state (STM via Redis) and long-term memory (LTM via Postgres).
Other agents talk to AGT-06 over HTTP — they never touch Redis or the `agent_ltm` DB directly.

### Session STM Endpoints

All STM keys are scoped to a `session_id` (UUID string). TTL is 7200 s (2 h).

```powershell
$SID = "test-session-$(Get-Random)"

# ── State ──────────────────────────────────────────────────────────────
# Write session state (skill_focus + phase)
Invoke-RestMethod -Method Post -Uri "http://localhost:8106/sessions/$SID/state" `
    -ContentType "application/json" `
    -Body '{"skill_focus":"SPEAKING","phase":"warm_up"}'
# → 204 No Content

# Read state
Invoke-RestMethod "http://localhost:8106/sessions/$SID/state"
# → {"skill_focus":"SPEAKING","phase":"warm_up"}

# ── Context (circular conversation buffer, max 20 turns) ────────────────
Invoke-RestMethod -Method Post -Uri "http://localhost:8106/sessions/$SID/context" `
    -ContentType "application/json" `
    -Body '{"role":"user","content":"Hello, let us practice speaking."}'

Invoke-RestMethod "http://localhost:8106/sessions/$SID/context"
# → [{"role":"user","content":"Hello, let us practice speaking."}]

# ── Errors (dual-write target from AGT-04) ──────────────────────────────
Invoke-RestMethod -Method Post -Uri "http://localhost:8106/sessions/$SID/errors" `
    -ContentType "application/json" `
    -Body '{"clerk_user_id":"user-test-1","error_type":"verb_tense","skill_domain":"SPEAKING","severity":2,"context_excerpt":"I go to work yesterday."}'
# → 204 No Content

Invoke-RestMethod "http://localhost:8106/sessions/$SID/errors"
# → [{"clerk_user_id":"user-test-1","error_type":"verb_tense",...}]

# ── Vocabulary ──────────────────────────────────────────────────────────
Invoke-RestMethod -Method Post -Uri "http://localhost:8106/sessions/$SID/vocab" `
    -ContentType "application/json" `
    -Body '{"word":"deadline","context_sentence":"Please meet the deadline."}'

Invoke-RestMethod "http://localhost:8106/sessions/$SID/vocab"
# → [{"word":"deadline","context_sentence":"Please meet the deadline."}]

# ── Difficulty / Lang / Writing (freeform JSON state) ────────────────────
Invoke-RestMethod -Method Post -Uri "http://localhost:8106/sessions/$SID/difficulty" `
    -ContentType "application/json" `
    -Body '{"level":"B1","irt_theta":0.3}'

Invoke-RestMethod "http://localhost:8106/sessions/$SID/difficulty"
# → {"level":"B1","irt_theta":0.3}

Invoke-RestMethod -Method Post -Uri "http://localhost:8106/sessions/$SID/lang" `
    -ContentType "application/json" `
    -Body '{"vi_fallback":true}'

Invoke-RestMethod -Method Post -Uri "http://localhost:8106/sessions/$SID/writing" `
    -ContentType "application/json" `
    -Body '{"draft":"Dear sir, I am writing to...","prompt":"Write a follow-up email."}'
```

### Consolidation (STM → LTM)

Consolidation is idempotent: first call returns `consolidated: true`, repeat calls return `consolidated: false`.
AGT-03 triggers this automatically at session end, but you can call it manually:

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:8106/sessions/$SID/consolidate" `
    -ContentType "application/json" `
    -Body '{"clerk_user_id":"user-test-1","skill_focus":"SPEAKING"}'
# → {"consolidated":true,"session_id":"..."}

# Repeat call — idempotent
Invoke-RestMethod -Method Post -Uri "http://localhost:8106/sessions/$SID/consolidate" `
    -ContentType "application/json" `
    -Body '{"clerk_user_id":"user-test-1","skill_focus":"SPEAKING"}'
# → {"consolidated":false,"session_id":"..."}
```

### LTM Read Endpoints

```powershell
$UID = "user-test-1"

# Vocabulary consolidated from all sessions
Invoke-RestMethod "http://localhost:8106/ltm/$UID/vocabulary"
# → [{word, encounter_count, context_sentences, ...}, ...]

# Grammar errors from all sessions (optional ?skill_domain=SPEAKING)
Invoke-RestMethod "http://localhost:8106/ltm/$UID/errors?skill_domain=SPEAKING"
# → [{error_type, skill_domain, severity, context_excerpt, ...}, ...]

# Session history
Invoke-RestMethod "http://localhost:8106/ltm/$UID/sessions"
# → [{session_id, skill_focus, start_time, end_time, ...}, ...]

# Conversation archive
Invoke-RestMethod "http://localhost:8106/ltm/$UID/conversations"
# → [{conv_id, session_id, turns: [...], ...}, ...]
```

### Review Center (aggregated LTM dump)

```powershell
Invoke-RestMethod "http://localhost:8106/review-center/$UID"
# → {errors:[...], vocabulary:[...], sessions:[...], conversations:[...], semantic_search_available:false}
```

---

## AGT-01 — User Profiling Agent (`:8101`)

Owns learner profiles in Postgres. Merges base LTM profile + live STM error deltas on read (merge-on-read, never written back). Runs Kafka consumers for `agent.session.end` and `agent.errors`.

### Create Profile

```powershell
$UID = "user-test-1"

Invoke-RestMethod -Method Post -Uri "http://localhost:8101/profile/$UID" `
    -ContentType "application/json" `
    -Body "{`"clerk_user_id`":`"$UID`"}"
# → 201 {clerk_user_id, irt_theta:{L:0.0,S:0.0,R:0.0,W:0.0}, cold_start_flag:true, ...}
```

### Read Profile (base, no session)

```powershell
Invoke-RestMethod "http://localhost:8101/profile/$UID"
# → {clerk_user_id, irt_theta, grammar_error_map:{}, cold_start_flag:true, ...}
```

### Read Profile (merged with active session STM errors)

```powershell
$SID = "some-active-session-id"
Invoke-RestMethod "http://localhost:8101/profile/$UID?session_id=$SID"
# → same shape, but grammar_error_map includes in-session errors from Redis
# _merged_session_id is added to indicate a live merge occurred
```

### Partial Profile Update

```powershell
Invoke-RestMethod -Method Patch -Uri "http://localhost:8101/profile/$UID" `
    -ContentType "application/json" `
    -Body '{"irt_theta":{"L":0.8,"S":-0.2,"R":0.5,"W":0.3}}'
# → updated profile

# Update goal profile
Invoke-RestMethod -Method Patch -Uri "http://localhost:8101/profile/$UID" `
    -ContentType "application/json" `
    -Body '{"goal_profile":{"target_cefr":"B2","primary_skill":"SPEAKING","daily_minutes":20}}'
```

### Test Merge-on-Read Manually

```powershell
# 1. Seed LTM grammar_error_map
Invoke-RestMethod -Method Patch -Uri "http://localhost:8101/profile/$UID" `
    -ContentType "application/json" `
    -Body '{"grammar_error_map":{"SPEAKING":{"verb_tense":1.0}}}'

# 2. Seed a STM error via AGT-06
$SID = "merge-test-$(Get-Random)"
Invoke-RestMethod -Method Post -Uri "http://localhost:8106/sessions/$SID/errors" `
    -ContentType "application/json" `
    -Body "{`"clerk_user_id`":`"$UID`",`"error_type`":`"verb_tense`",`"skill_domain`":`"SPEAKING`",`"severity`":2}"

# 3. Read merged profile
$merged = Invoke-RestMethod "http://localhost:8101/profile/$UID?session_id=$SID"
$merged.grammar_error_map.SPEAKING.verb_tense   # → 3.0 (1.0 LTM + 2.0 STM)

# 4. Read base — merge NOT persisted
$base = Invoke-RestMethod "http://localhost:8101/profile/$UID"
$base.grammar_error_map.SPEAKING.verb_tense     # → 1.0 (unchanged)
```

---

## AGT-02 — Learning Path Agent (`:8102`)

Generates versioned learning plans: fetches profile from AGT-01, runs weakness-weighted skill allocation, selects activities, persists to Postgres, emits `agent.plan.events`.

### Generate First Plan

```powershell
$UID = "user-test-1"

$plan = Invoke-RestMethod -Method Post -Uri "http://localhost:8102/plans/$UID/generate" `
    -ContentType "application/json" `
    -Body '{"daily_minutes":30,"goals":["improve business English","email writing"]}'

$plan | ConvertTo-Json -Depth 5
# → {plan_id, clerk_user_id, version:1, is_active:true,
#    skill_allocation:{L:0.25,S:0.25,R:0.25,W:0.25},
#    activities:[{activity_id, skill_domain, activity_type, title, estimated_minutes, ...}],
#    rationale:"[MOCK LLM AGT02] ..."}
```

### Get Active Plan

```powershell
Invoke-RestMethod "http://localhost:8102/plans/$UID/active"
# → same as generated plan, or 404 if none

# Get today's activity list only
Invoke-RestMethod "http://localhost:8102/plans/$UID/today"
# → {clerk_user_id, plan_id, activities:[...], daily_minutes:30}
```

### Replan (force regeneration)

Deactivates the current plan and creates a new version:

```powershell
$plan2 = Invoke-RestMethod -Method Post -Uri "http://localhost:8102/plans/$UID/replan" `
    -ContentType "application/json" `
    -Body '{"daily_minutes":20,"skill_estimates":{"S":-0.5},"goals":["focus on speaking"]}'

$plan2.version   # → 2
$plan2.skill_allocation.S   # → higher than others (S is weak)
```

### Test Skill Allocation Logic

Supply a profile with a strong weakness in one skill and verify the allocation reflects it:

```powershell
# Give user a very weak Speaking score
Invoke-RestMethod -Method Patch -Uri "http://localhost:8101/profile/$UID" `
    -ContentType "application/json" `
    -Body '{"irt_theta":{"L":1.5,"S":-1.0,"R":1.0,"W":0.8}}'

$plan3 = Invoke-RestMethod -Method Post -Uri "http://localhost:8102/plans/$UID/generate" `
    -ContentType "application/json" `
    -Body '{"daily_minutes":60}'

# Speaking should dominate the allocation
$plan3.skill_allocation   # → S much higher than L/R/W
$plan3.activities | Group-Object skill_domain | Select-Object Name, Count
```

---

## AGT-03 — AI Tutor / Conversation Agent (`:8103`)

Orchestrates a full session lifecycle: start (fetches profile + plan), turn-by-turn conversation (STM context via AGT-06), end (consolidation + Kafka event).

### Start Session

```powershell
$UID = "user-test-1"

$sess = Invoke-RestMethod -Method Post -Uri "http://localhost:8103/sessions/start" `
    -ContentType "application/json" `
    -Body "{`"clerk_user_id`":`"$UID`",`"skill_focus`":`"SPEAKING`"}"

$SID = $sess.session_id
$sess
# → {session_id, clerk_user_id:"user-test-1", skill_focus:"SPEAKING",
#    opening_message:"Hi! Let's practice speaking...",
#    profile_loaded:true,  # true if AGT-01 responded
#    plan_loaded:true}     # true if AGT-02 has an active plan

# Pass your own session_id (optional)
$sess2 = Invoke-RestMethod -Method Post -Uri "http://localhost:8103/sessions/start" `
    -ContentType "application/json" `
    -Body "{`"clerk_user_id`":`"$UID`",`"skill_focus`":`"WRITING`",`"session_id`":`"my-custom-session-id`"}"
```

### Send a Turn

```powershell
$turn = Invoke-RestMethod -Method Post -Uri "http://localhost:8103/sessions/turn" `
    -ContentType "application/json" `
    -Body "{`"session_id`":`"$SID`",`"user_message`":`"I work as a project manager and I handle daily standups.`"}"

$turn
# → {session_id, assistant_message:"[MOCK LLM AGT03] Got it - you said: I work as a project manager...",
#    transcript_text:"I work as a project manager...",
#    mock_feedback:"[MOCK] Good attempt! Keep practising.",
#    language:"en"}

# Multiple turns to build up context
1..3 | ForEach-Object {
    $t = Invoke-RestMethod -Method Post -Uri "http://localhost:8103/sessions/turn" `
        -ContentType "application/json" `
        -Body "{`"session_id`":`"$SID`",`"user_message`":`"Turn $_ — testing the context buffer.`"}"
    Write-Host "Turn $_ reply: $($t.assistant_message)"
}
```

### Inspect Session State (via AGT-06)

```powershell
# AGT-03 proxies state read to AGT-06
Invoke-RestMethod "http://localhost:8103/sessions/$SID/state"
# → {session_id, state:{skill_focus:"SPEAKING",phase:"warm_up"}}

# Inspect context buffer directly via AGT-06
Invoke-RestMethod "http://localhost:8106/sessions/$SID/context"
# → [{role:"assistant",content:"Hi! Let's practice..."}, {role:"user",content:"I work as..."}, ...]
```

### End Session

```powershell
$end = Invoke-RestMethod -Method Post -Uri "http://localhost:8103/sessions/end" `
    -ContentType "application/json" `
    -Body "{`"session_id`":`"$SID`",`"clerk_user_id`":`"$UID`",`"skill_focus`":`"SPEAKING`"}"

$end
# → {session_id, consolidated:true, duration_minutes:0.0042, turns_completed:4}

# Verify LTM was written
Invoke-RestMethod "http://localhost:8106/ltm/$UID/sessions"
# → [{session_id: $SID, skill_focus:"SPEAKING", end_time: non-null, ...}]
```

---

## Full End-to-End Walkthrough

This script simulates a complete learner lifecycle: profile creation → plan generation → tutor session → LTM review.

```powershell
# Setup
$UID = "demo-user-$(Get-Random)"
$BASE06 = "http://localhost:8106"
$BASE01 = "http://localhost:8101"
$BASE02 = "http://localhost:8102"
$BASE03 = "http://localhost:8103"

Write-Host "=== E2E walkthrough for $UID ==="

# 1. Create learner profile
$profile = Invoke-RestMethod -Method Post -Uri "$BASE01/profile/$UID" `
    -ContentType "application/json" `
    -Body "{`"clerk_user_id`":`"$UID`"}"
Write-Host "[1] Profile created, cold_start=$($profile.cold_start_flag)"

# 2. Set realistic IRT scores (simulates a previous assessment)
Invoke-RestMethod -Method Patch -Uri "$BASE01/profile/$UID" `
    -ContentType "application/json" `
    -Body '{"irt_theta":{"L":0.8,"S":-0.5,"R":0.6,"W":0.2}}' | Out-Null
Write-Host "[2] IRT theta updated (S weakest)"

# 3. Generate a learning plan
$plan = Invoke-RestMethod -Method Post -Uri "$BASE02/plans/$UID/generate" `
    -ContentType "application/json" `
    -Body '{"daily_minutes":30,"goals":["business communication"]}'
Write-Host "[3] Plan v$($plan.version) created, S allocation=$($plan.skill_allocation.S)"

# 4. Start a tutor session
$sess = Invoke-RestMethod -Method Post -Uri "$BASE03/sessions/start" `
    -ContentType "application/json" `
    -Body "{`"clerk_user_id`":`"$UID`",`"skill_focus`":`"SPEAKING`"}"
$SID = $sess.session_id
Write-Host "[4] Session started: $SID"
Write-Host "    Opening: $($sess.opening_message)"
Write-Host "    profile_loaded=$($sess.profile_loaded), plan_loaded=$($sess.plan_loaded)"

# 5. Three conversation turns
$messages = @(
    "I work as a sales manager and I handle weekly team meetings.",
    "My biggest challenge is presenting quarterly results to senior management.",
    "I sometimes struggle with technical vocabulary in English."
)
$i = 1
foreach ($msg in $messages) {
    $turn = Invoke-RestMethod -Method Post -Uri "$BASE03/sessions/turn" `
        -ContentType "application/json" `
        -Body (ConvertTo-Json @{session_id=$SID; user_message=$msg})
    Write-Host "[5.$i] User: $($msg.Substring(0, [Math]::Min(50,$msg.Length)))..."
    Write-Host "     Tutor: $($turn.assistant_message.Substring(0, [Math]::Min(80,$turn.assistant_message.Length)))..."
    $i++
}

# 6. End session
$end = Invoke-RestMethod -Method Post -Uri "$BASE03/sessions/end" `
    -ContentType "application/json" `
    -Body "{`"session_id`":`"$SID`",`"clerk_user_id`":`"$UID`",`"skill_focus`":`"SPEAKING`"}"
Write-Host "[6] Session ended: consolidated=$($end.consolidated), turns=$($end.turns_completed), duration=$($end.duration_minutes)min"

# 7. Verify LTM consolidation
Start-Sleep 1  # give async background tasks a moment
$ltmSessions = Invoke-RestMethod "$BASE06/ltm/$UID/sessions"
Write-Host "[7] LTM sessions: $($ltmSessions.Count) recorded"

# 8. Check behavioral profile update (AGT-01 Kafka consumer should have fired)
Start-Sleep 2  # wait for Kafka consumer to process agent.session.end
$updatedProfile = Invoke-RestMethod "$BASE01/profile/$UID"
Write-Host "[8] behavioral_profile.avg_session_length=$($updatedProfile.behavioral_profile.avg_session_length)"
Write-Host "    cold_start_flag=$($updatedProfile.cold_start_flag)"

# 9. Review center
$review = Invoke-RestMethod "$BASE06/review-center/$UID"
Write-Host "[9] Review center: $($review.sessions.Count) sessions, $($review.vocabulary.Count) vocab words, $($review.errors.Count) errors"

Write-Host "=== E2E complete ==="
```

---

## Running Unit Tests

Tests live in `agents/` (the worktree's agent directory). Run from that directory.

```powershell
cd .worktrees\agt06-agt01-agt02-agt03-sprint\agents

# All unit tests (no live infra needed)
python -m pytest agt06_memory/tests/test_stm.py `
           agt01_profiling/tests/test_consumers.py `
           agt02_learning_path/tests/test_optimizer.py `
           agt03_tutor/tests/test_service.py -v

# Integration tests (require docker-compose postgres-agents on :5438)
python -m pytest -m integration -v

# All tests
python -m pytest -v
```

Test counts:

| Suite | Count | Needs infra |
|-------|-------|-------------|
| AGT-06 STM (fakeredis) | 9 | No |
| AGT-01 consumer handlers | 9 (incl. idempotency) | No |
| AGT-02 optimizer | 7 | No |
| AGT-03 service | 10 | No |
| AGT-06 LTM | 6 | Postgres |
| AGT-06 consolidation | 2 | Postgres |
| AGT-01 service (merge-on-read) | 5 | Postgres |
| AGT-02 plan generation | 6 | Postgres |
| **Total** | **54** | |

---

## Checking Kafka Events

To verify events are flowing through Kafka:

```powershell
# List topics
docker exec kafka kafka-topics.sh --bootstrap-server localhost:9092 --list

# Consume agent.session.start
docker exec kafka kafka-console-consumer.sh `
    --bootstrap-server localhost:9092 `
    --topic agent.session.start `
    --from-beginning `
    --max-messages 10

# Consume agent.plan.events
docker exec kafka kafka-console-consumer.sh `
    --bootstrap-server localhost:9092 `
    --topic agent.plan.events `
    --from-beginning `
    --max-messages 10
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| 422 on POST /profile/{id} | Missing `clerk_user_id` in body | Body must include `{"clerk_user_id":"..."}` |
| `profile_loaded: false` on session start | AGT-01 not reachable or profile not created | Create profile first via AGT-01 |
| `plan_loaded: false` on session start | No active plan for user | Generate plan via AGT-02 first |
| `consolidated: false` immediately | Session was consolidated before (idempotent) | Use a new session_id |
| `behavioral_profile.avg_session_length` not updating | Kafka consumer lag | Wait 2-3s after end_session; check `docker logs agt01-profiling` |
| 404 on GET /sessions/{id}/state | Session key expired (2h TTL) or never set | Start a new session |
| Container using old code | Image not rebuilt | `docker compose up -d --build` |
