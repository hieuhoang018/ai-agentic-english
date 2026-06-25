# Agent Build Order — Final Roadmap
# The definitive sequence for implementing the agentic AI system.
# Every agent depends on the ones before it. Do not reorder.
# Last updated: June 23, 2026

---

## CURRENT PROJECT STATUS

**Sprint completed:** AGT-06, AGT-01, AGT-02, AGT-04, AGT-05 — DONE
**Sprint partial:** AGT-03 — text-only session flow implemented, mocking AGT-11 and AGT-07
**Not yet built:** AGT-11, AGT-07, AGT-08, AGT-09, AGT-10

### What "done" means for completed agents

| Agent | Status | Notes |
|---|---|---|
| AGT-06 Memory | DONE | STM, LTM, consolidation, embeddings, MinIO all verified |
| AGT-01 Profiling | DONE | Intra-session merge verified, Kafka consumers wired |
| AGT-04 Feedback | DONE | Dual-write verified, LanguageTool + LLM hybrid working |
| AGT-05 Assessment | DONE | CAT flow verified, assessment_history writes confirmed |
| AGT-02 Learning Path | DONE | Plan generation, supersession, daily activity selection verified |
| AGT-03 Tutor | PARTIAL | Text-only sessions work. Mocking AGT-11 (bilingual) and AGT-07 (reviews). Speaking pipeline (pipeline.py, websocket_handler.py) are stubs. NOT done until Sprint C below. |

### Remaining sprint sequence

| Sprint | Agent | Prerequisite | Key deliverable |
|---|---|---|---|
| **A (next)** | AGT-11 Translation | AGT-01 done | Real bilingual feedback; rewires AGT-04 to stop mocking it |
| **B** | AGT-07 Review | AGT-06, AGT-02 done + real session data in LTM | SM-2 scheduling; review items in sessions |
| **C** | AGT-03 complete | AGT-11 + AGT-07 done | Drop all mocks; full speaking pipeline with WebSocket and ASR |
| **D** | AGT-08 Analysis | AGT-03 live + ≥5 real sessions accumulated | Pattern detection; auto re-plan trigger |
| **E** | AGT-09 Recommendation | AGT-07 + AGT-08 done | Personalised recommendations; cache invalidation on pattern events |
| **F** | AGT-10 Habit | AGT-07 + AGT-08 + AGT-09 done | Four-tab library; Novu notifications; streak Kafka consumer |

### Environment facts (verified against actual repo)

**Repo:** `ai-agentic-english` — npm workspaces, TypeScript 5.7, Node 20
**Agent ports:** 8101–8111 (shifted from 8001–8011 to avoid Kong admin conflict on 8001)
**Kong admin:** host port 8001 (do not assign any agent to this port)
**LanguageTool:** host port 8082 → container port 8010 (avoids AGT-10 on 8110)
**postgres-agents:** host port 5438, DB name `agent_ltm`, password `postgres`
**PostgreSQL password:** `postgres` (not `password` — all scaffold files use `postgres`)
**Verification commands:** PowerShell syntax (Windows environment)

### PowerShell health check (run to confirm current state)
```powershell
foreach ($p in 8101,8102,8103,8104,8105,8106,8107,8108,8109,8110,8111) {
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:$p/health" -UseBasicParsing -TimeoutSec 3
        Write-Host "AGT port $p : $($r.Content)"
    } catch {
        Write-Host "AGT port $p : UNREACHABLE"
    }
}
```

---

## The Dependency Rule

**An agent cannot be wired until every agent it calls is already wired.**

```
AGT-06  ←  no agent dependencies       (pure infra: Redis STM + PostgreSQL LTM)
  ↓
AGT-01  ←  AGT-06 (reads STM for merge)
  ↓
AGT-11  ←  AGT-01 (reads theta-R for zone selection)
  ↓
AGT-04  ←  AGT-06 (dual-write STM) + AGT-11 (bilingual feedback)
  ↓
AGT-05  ←  AGT-01 (reads theta) + AGT-06 (writes LTM)
  ↓
AGT-02  ←  AGT-01 (profile) + AGT-05 (assessment results) + AGT-06 (LTM plans)
  ↓
AGT-07  ←  AGT-06 (LTM vocabulary/errors) + AGT-02 (plan time budget)
  ↓
AGT-03  ←  AGT-01 + AGT-02 + AGT-04 + AGT-06 + AGT-07 + AGT-11  (all of them)
  ↓
AGT-08  ←  AGT-06 (LTM history) + AGT-01 (profile) — needs ≥5 sessions of data
  ↓
AGT-09  ←  AGT-01 + AGT-07 + AGT-08 (pattern events)
  ↓
AGT-10  ←  AGT-07 (due counts) + AGT-08 (risk signals) + AGT-09 (recommendations)
```

---

## Agent 1 of 11 — AGT-06: Memory & Knowledge
**Status: DONE**

**Why first:** Every other agent either writes to or reads from AGT-06.
It has zero agent dependencies — only PostgreSQL and Redis.
Nothing works without it.

**Verification (all must pass — run in PowerShell):**

```powershell
# 1. STM write/read roundtrip
Invoke-WebRequest -Uri "http://localhost:8106/sessions/chk-s1/errors" `
  -Method POST -ContentType "application/json" `
  -Body '{"error_type":"grammar","skill_domain":"SPEAKING","severity":2,"clerk_user_id":"chk-u1"}'
(Invoke-WebRequest -Uri "http://localhost:8106/sessions/chk-s1/errors" -UseBasicParsing).Content
# PASS: JSON array, length 1, error_type="grammar"

# 2. State roundtrip
Invoke-WebRequest -Uri "http://localhost:8106/sessions/chk-s1/state" `
  -Method POST -ContentType "application/json" `
  -Body '{"skill_focus":"SPEAKING","activity":"test","phase":"warm_up","objective":"test","exercise_format":"role_play"}'
(Invoke-WebRequest -Uri "http://localhost:8106/sessions/chk-s1/state" -UseBasicParsing).Content
# PASS: skill_focus="SPEAKING"

# 3. Circular buffer — 21 turns in, exactly 20 out
for ($i = 1; $i -le 21; $i++) {
    Invoke-WebRequest -Uri "http://localhost:8106/sessions/chk-s1/context" `
      -Method POST -ContentType "application/json" `
      -Body "{`"role`":`"user`",`"content`":`"turn $i`"}" -UseBasicParsing | Out-Null
}
$ctx = (Invoke-WebRequest -Uri "http://localhost:8106/sessions/chk-s1/context" -UseBasicParsing).Content | ConvertFrom-Json
Write-Host "Context count: $($ctx.Count)"
# PASS: exactly 20

# 4. Consolidation — first call true, second call false
$body = '{"clerk_user_id":"chk-u1","skill_focus":"SPEAKING"}'
$r1 = (Invoke-WebRequest -Uri "http://localhost:8106/sessions/chk-s1/consolidate" `
  -Method POST -ContentType "application/json" -Body $body -UseBasicParsing).Content | ConvertFrom-Json
$r2 = (Invoke-WebRequest -Uri "http://localhost:8106/sessions/chk-s1/consolidate" `
  -Method POST -ContentType "application/json" -Body $body -UseBasicParsing).Content | ConvertFrom-Json
Write-Host "First: $($r1.consolidated)  Second: $($r2.consolidated)"
# PASS: true then false

# 5. LTM populated
(Invoke-WebRequest -Uri "http://localhost:8106/ltm/chk-u1/errors" -UseBasicParsing).Content
# PASS: non-empty array

# 6. Conversation archive row exists
docker exec infra-postgres-agents-1 psql -U postgres -d agent_ltm `
  -c "SELECT COUNT(*) FROM conversation_archive WHERE clerk_user_id='chk-u1';"
# PASS: count >= 1

# 7. pgvector works
docker exec infra-postgres-agents-1 psql -U postgres -d agent_ltm `
  -c "SELECT '[1,2,3]'::vector;"
# PASS: returns [1,2,3] without error
```

---

## Agent 2 of 11 — AGT-01: User Profiling
**Status: DONE**

**Why second:** Every planning and tutoring agent reads the learner profile.
The intra-session merge-on-read is the most critical correctness guarantee
in the system.

**Verification (all must pass — run in PowerShell):**

```powershell
# 1. Cold-start profile
Invoke-WebRequest -Uri "http://localhost:8101/profile/chk-u2" `
  -Method POST -ContentType "application/json" -Body '{}'
$p = (Invoke-WebRequest -Uri "http://localhost:8101/profile/chk-u2" -UseBasicParsing).Content | ConvertFrom-Json
Write-Host "cold_start_flag: $($p.cold_start_flag)  theta.S: $($p.irt_theta.S)"
# PASS: cold_start_flag=true, theta.S=null (not 0.0 — S is never set by CAT)

# 2. CRITICAL — intra-session merge
# Write 2 errors to AGT-06 STM
$err = '{"error_type":"tense","skill_domain":"SPEAKING","severity":2,"clerk_user_id":"chk-u2"}'
Invoke-WebRequest -Uri "http://localhost:8106/sessions/merge-sess/errors" `
  -Method POST -ContentType "application/json" -Body $err -UseBasicParsing | Out-Null
Invoke-WebRequest -Uri "http://localhost:8106/sessions/merge-sess/errors" `
  -Method POST -ContentType "application/json" -Body $err -UseBasicParsing | Out-Null

# Merged profile must show 4.0
$merged = (Invoke-WebRequest -Uri "http://localhost:8101/profile/chk-u2?session_id=merge-sess" `
  -UseBasicParsing).Content | ConvertFrom-Json
Write-Host "Merged tense score: $($merged.grammar_error_map.SPEAKING.tense)"
# PASS: exactly 4.0

# Base profile must still be empty
$base = (Invoke-WebRequest -Uri "http://localhost:8101/profile/chk-u2" -UseBasicParsing).Content | ConvertFrom-Json
Write-Host "Base grammar_error_map: $($base.grammar_error_map | ConvertTo-Json)"
# PASS: {}

# 3. Partial update
Invoke-WebRequest -Uri "http://localhost:8101/profile/chk-u2" `
  -Method PATCH -ContentType "application/json" -Body '{"irt_theta":{"S":0.5}}' -UseBasicParsing | Out-Null
$upd = (Invoke-WebRequest -Uri "http://localhost:8101/profile/chk-u2" -UseBasicParsing).Content | ConvertFrom-Json
Write-Host "S: $($upd.irt_theta.S)  L: $($upd.irt_theta.L)"
# PASS: S=0.5, L=0.0

# 4. Kafka consumer flips cold_start_flag once L, R, W all have data (S=null does not block)
# Run after completing an AGT-03 session for any non-speaking skill
# GET profile -> cold_start_flag=false, irt_theta.S still null
```

---

## Agent 3 of 11 — AGT-11: Translation & Explanation
**Status: NOT BUILT — Sprint A (next)**

**Why third:** AGT-04 currently mocks all bilingual output. AGT-03 currently
returns English-only. Both are unblocked the moment AGT-11 is live.
No other agent dependency beyond AGT-01.

**Verification (all must pass — run in PowerShell):**

```powershell
# 1. Health
(Invoke-WebRequest -Uri "http://localhost:8111/health" -UseBasicParsing).Content
# PASS: {"status":"ok","agent":"AGT-11"}

# 2. Zone selection
Invoke-WebRequest -Uri "http://localhost:8101/profile/agt11-test" `
  -Method POST -ContentType "application/json" -Body '{}' -UseBasicParsing | Out-Null
Invoke-WebRequest -Uri "http://localhost:8101/profile/agt11-test" `
  -Method PATCH -ContentType "application/json" -Body '{"irt_theta":{"R":-1.0}}' -UseBasicParsing | Out-Null
(Invoke-WebRequest -Uri "http://localhost:8111/zone/agt11-test" -UseBasicParsing).Content
# PASS: zone="vi_primary"

# 3. Conversation always en_only regardless of theta
$body = '{"content":"Present perfect tense","clerk_user_id":"agt11-test","session_type":"conversation"}'
$r = (Invoke-WebRequest -Uri "http://localhost:8111/translate" -Method POST `
  -ContentType "application/json" -Body $body -UseBasicParsing).Content | ConvertFrom-Json
Write-Host "Zone: $($r.zone)  Translated=original: $($r.translated -eq 'Present perfect tense')"
# PASS: zone="en_only", content unchanged

# 4. Cache hit on second call
$body = '{"content":"The present perfect tense is used for recent past...","clerk_user_id":"agt11-test","session_type":"exercise"}'
$r1 = (Invoke-WebRequest -Uri "http://localhost:8111/translate" -Method POST `
  -ContentType "application/json" -Body $body -UseBasicParsing).Content | ConvertFrom-Json
$r2 = (Invoke-WebRequest -Uri "http://localhost:8111/translate" -Method POST `
  -ContentType "application/json" -Body $body -UseBasicParsing).Content | ConvertFrom-Json
Write-Host "First cached: $($r1.cached)  Second cached: $($r2.cached)"
# PASS: false then true

# 5. AGT-04 rewired — bilingual feedback for vi_primary user
$feedback = '{"transcript":"She go to school yesterday.","session_id":"agt11-rewire-test","clerk_user_id":"agt11-test","duration_seconds":5.0,"skill_domain":"SPEAKING"}'
$r = (Invoke-WebRequest -Uri "http://localhost:8104/feedback/speaking" -Method POST `
  -ContentType "application/json" -Body $feedback -UseBasicParsing).Content | ConvertFrom-Json
Write-Host "Has Vietnamese explanation: $($r.grammar_errors[0].explanation -match '[^\x00-\x7F]')"
# PASS: explanation field contains Vietnamese characters
```

---

## Agent 4 of 11 — AGT-04: Feedback
**Status: DONE**

**Verification (all must pass — run in PowerShell):**

```powershell
# 1. LanguageTool healthy
(Invoke-WebRequest -Uri "http://localhost:8082/v2/languages" -UseBasicParsing).StatusCode
# PASS: 200

# 2. Grammar error detected
$body = '{"transcript":"She go to school yesterday.","session_id":"chk-fb-s1","clerk_user_id":"chk-u3","duration_seconds":5.0,"skill_domain":"SPEAKING"}'
$r = (Invoke-WebRequest -Uri "http://localhost:8104/feedback/speaking" -Method POST `
  -ContentType "application/json" -Body $body -UseBasicParsing).Content | ConvertFrom-Json
Write-Host "Error count: $($r.grammar_errors.Count)"
# PASS: >= 1

# 3. CRITICAL — dual-write: error in AGT-06 STM
(Invoke-WebRequest -Uri "http://localhost:8106/sessions/chk-fb-s1/errors" -UseBasicParsing).Content
# PASS: non-empty array

# 4. CRITICAL — dual-write: error in Kafka agent.errors
docker exec infra-kafka-1 kafka-console-consumer.sh `
  --bootstrap-server localhost:9092 --topic agent.errors `
  --from-beginning --max-messages 5 --timeout-ms 5000
# PASS: JSON event with sessionId="chk-fb-s1"

# 5. Throttling
$body5 = '{"transcript":"She go school yesterday he done it wrong badly wrong.","session_id":"chk-fb-s2","clerk_user_id":"chk-u3","duration_seconds":5.0,"skill_domain":"SPEAKING"}'
$r5 = (Invoke-WebRequest -Uri "http://localhost:8104/feedback/speaking" -Method POST `
  -ContentType "application/json" -Body $body5 -UseBasicParsing).Content | ConvertFrom-Json
Write-Host "Throttled: $($r5.throttled)  Surfaced: $($r5.surfaced_error_count)"
# PASS: throttled=true if > 3 error types detected, surfaced_error_count=1
```

---

## Agent 5 of 11 — AGT-05: Assessment
**Status: DONE**

**Verification (all must pass — run in PowerShell):**

```powershell
# 1a. SPEAKING is rejected
$rs = (Invoke-WebRequest -Uri "http://localhost:8105/assessments/start" -Method POST `
  -ContentType "application/json" `
  -Body '{"clerk_user_id":"chk-u4","skill_domain":"SPEAKING"}' -UseBasicParsing).Content | ConvertFrom-Json
Write-Host "SPEAKING http_status: $($rs.http_status)"
# PASS: http_status=422

# 1b. Start assessment returns first item
$r = (Invoke-WebRequest -Uri "http://localhost:8105/assessments/start" -Method POST `
  -ContentType "application/json" `
  -Body '{"clerk_user_id":"chk-u4","skill_domain":"READING"}' -UseBasicParsing).Content | ConvertFrom-Json
Write-Host "First item: $($r.current_item.item_id)  terminated: $($r.terminated)"
# PASS: current_item non-null, terminated=false

# 2. Theta increases on 5 correct responses
$assessId = $r.assessment_id
$priorTheta = $r.current_theta
for ($i = 1; $i -le 5; $i++) {
    $resp = (Invoke-WebRequest -Uri "http://localhost:8105/assessments/respond" -Method POST `
      -ContentType "application/json" `
      -Body "{`"assessment_id`":`"$assessId`",`"item_id`":`"item-$i`",`"correct`":true,`"prior_responses`":[],`"skill_domain`":`"READING`"}" `
      -UseBasicParsing).Content | ConvertFrom-Json
    Write-Host "After correct $i: theta=$($resp.current_theta)"
}
# PASS: theta monotonically increases

# 3. Termination at 30 items writes assessment_history
docker exec infra-postgres-agents-1 psql -U postgres -d agent_ltm `
  -c "SELECT cefr_band, skill_domain FROM assessment_history WHERE clerk_user_id='chk-u4' LIMIT 5;"
# PASS: at least 1 row with valid cefr_band (A1-C2)
```

---

## Agent 6 of 11 — AGT-02: Learning Path
**Status: DONE**

**Verification (all must pass — run in PowerShell):**

```powershell
# 1. Generate plan
$r = (Invoke-WebRequest -Uri "http://localhost:8102/plans/chk-u5/generate" -Method POST `
  -ContentType "application/json" `
  -Body '{"clerk_user_id":"chk-u5","daily_minutes":15}' -UseBasicParsing).Content | ConvertFrom-Json
$firstPlanId = $r.plan_id
$allocSum = $r.skill_allocation.L + $r.skill_allocation.S + $r.skill_allocation.R + $r.skill_allocation.W
Write-Host "Plan: $firstPlanId  Activities: $($r.activities.Count)  AllocSum: $([Math]::Round($allocSum,4))"
# PASS: UUID plan_id, activities >= 1, sum = 1.0

# 2. Today plan respects budget
$today = (Invoke-WebRequest -Uri "http://localhost:8102/plans/chk-u5/today" -UseBasicParsing).Content | ConvertFrom-Json
Write-Host "Today minutes: $($today.total_minutes)"
# PASS: total_minutes <= 15

# 3. CRITICAL — supersession: only one active plan per user
$r2 = (Invoke-WebRequest -Uri "http://localhost:8102/plans/chk-u5/generate" -Method POST `
  -ContentType "application/json" `
  -Body '{"clerk_user_id":"chk-u5","daily_minutes":15}' -UseBasicParsing).Content | ConvertFrom-Json
Write-Host "New plan differs: $($r2.plan_id -ne $firstPlanId)"
docker exec infra-postgres-agents-1 psql -U postgres -d agent_ltm `
  -c "SELECT plan_id, is_active FROM agent_learning_plans WHERE clerk_user_id='chk-u5' ORDER BY created_at;"
# PASS: 2 rows, first is_active=false, second is_active=true
# PASS: COUNT(*) WHERE is_active=true = 1 (never more than one)
```

---

## Agent 7 of 11 — AGT-07: Review Generation
**Status: NOT BUILT — Sprint B**

**Prerequisite:** Run at least one complete AGT-03 session to seed
vocabulary_mastery and error_events in LTM before verifying.

**Verification (all must pass — run in PowerShell):**

```powershell
# 1. Due items after a consolidated session
(Invoke-WebRequest -Uri "http://localhost:8107/schedule/chk-u6/due" -UseBasicParsing).Content
# PASS: non-empty array, all items have retrievability < 0.9

# 2. quality=1 → next review tomorrow
$dueItems = (Invoke-WebRequest -Uri "http://localhost:8107/schedule/chk-u6/due" -UseBasicParsing).Content | ConvertFrom-Json
$itemId = $dueItems[0].vocab_id
$r = (Invoke-WebRequest -Uri "http://localhost:8107/schedule/chk-u6/rate" -Method POST `
  -ContentType "application/json" -Body "{`"item_id`":`"$itemId`",`"quality`":1}" -UseBasicParsing).Content | ConvertFrom-Json
Write-Host "Next review: $($r.next_review)"
# PASS: within 24-48 hours from now

# 3. quality=5 → next review >= 14 days out
$itemId2 = $dueItems[1].vocab_id
$r2 = (Invoke-WebRequest -Uri "http://localhost:8107/schedule/chk-u6/rate" -Method POST `
  -ContentType "application/json" -Body "{`"item_id`":`"$itemId2`",`"quality`":5}" -UseBasicParsing).Content | ConvertFrom-Json
Write-Host "Next review quality=5: $($r2.next_review)"
# PASS: at least 14 days from now

# 4. Daily test from user's own data
$test = (Invoke-WebRequest -Uri "http://localhost:8107/tests/chk-u6/daily" -UseBasicParsing).Content | ConvertFrom-Json
Write-Host "Test items: $($test.Count)"
# PASS: 10 items (or fewer if < 10 in LTM), all belong to chk-u6
```

---

## Agent 8 of 11 — AGT-03: AI Tutor / Conversation
**Status: PARTIAL — completes in Sprint C (after AGT-11 and AGT-07 done)**

Current state: text-only sessions work, AGT-11 and AGT-07 mocked.
Speaking pipeline (pipeline.py, websocket_handler.py) are empty stubs.

**Verification — Sprint C completion (all 6 must pass):**

```powershell
# 1. Session start writes STM state
$start = (Invoke-WebRequest -Uri "http://localhost:8103/sessions/start" -Method POST `
  -ContentType "application/json" `
  -Body '{"clerk_user_id":"chk-u7","skill_focus":"SPEAKING"}' -UseBasicParsing).Content | ConvertFrom-Json
$sid = $start.session_id
(Invoke-WebRequest -Uri "http://localhost:8106/sessions/$sid/state" -UseBasicParsing).Content
# PASS: skill_focus="SPEAKING"

# 2. AGT-04 called on each turn (error appears in STM)
$tb = "{`"session_id`":`"$sid`",`"clerk_user_id`":`"chk-u7`",`"user_message`":`"She go to school yesterday.`"}"
Invoke-WebRequest -Uri "http://localhost:8103/sessions/turn" -Method POST `
  -ContentType "application/json" -Body $tb -UseBasicParsing | Out-Null
(Invoke-WebRequest -Uri "http://localhost:8106/sessions/$sid/errors" -UseBasicParsing).Content
# PASS: >= 1 error (proves AGT-04 was called and dual-wrote)

# 3. AGT-11 called for bilingual users (language zone in response)
# Use a user with theta-R = -1.0 (vi_primary zone)
# PASS: response language field = "vi_primary" or explanation contains Vietnamese

# 4. ASR — Groq Whisper transcribes real WebM audio in < 2 seconds
# POST a real audio file to transcription endpoint
# PASS: {text: "...", source: "groq"}, latency < 2s

# 5. Session end triggers consolidation
Invoke-WebRequest -Uri "http://localhost:8103/sessions/end" -Method POST `
  -ContentType "application/json" `
  -Body "{`"session_id`":`"$sid`",`"clerk_user_id`":`"chk-u7`"}" -UseBasicParsing | Out-Null
docker exec infra-postgres-agents-1 psql -U postgres -d agent_ltm `
  -c "SELECT COUNT(*) FROM learning_sessions WHERE clerk_user_id='chk-u7';"
# PASS: count >= 1, end_time is not null

# 6. Kafka agent.session.end emitted
docker exec infra-kafka-1 kafka-console-consumer.sh `
  --bootstrap-server localhost:9092 --topic agent.session.end `
  --from-beginning --max-messages 3 --timeout-ms 5000
# PASS: JSON event with clerkUserId="chk-u7"
```

---

## Agent 9 of 11 — AGT-08: Progress Analysis
**Status: NOT BUILT — Sprint D (after AGT-03 complete + ≥5 real sessions)**

**Verification (all 4 must pass):**

```powershell
# 1. Suppressed for < 5 sessions
(Invoke-WebRequest -Uri "http://localhost:8108/analysis/new-user/run" `
  -Method POST -UseBasicParsing).Content
# PASS: {"insufficient_data":true,"patterns":[]}

# 2. Pattern event emitted after 5+ sessions with repeated error
# Run 5 AGT-03 sessions with same grammar error, then:
(Invoke-WebRequest -Uri "http://localhost:8108/analysis/chk-u8/run" `
  -Method POST -UseBasicParsing).Content
docker exec infra-kafka-1 kafka-console-consumer.sh `
  --bootstrap-server localhost:9092 --topic agent.pattern.events `
  --from-beginning --max-messages 5 --timeout-ms 5000
# PASS: event with type="persistent_weakness" and clerkUserId="chk-u8"

# 3. Risk model fires at high absence
# Trigger with days_since_last_session=8
# PASS: risk_score > 0.7, behavioral_risk event emitted

# 4. AGT-02 re-plans after pattern event
# PASS: new plan has higher skill_allocation for the weak skill
```

---

## Agent 10 of 11 — AGT-09: Recommendation
**Status: NOT BUILT — Sprint E**

**Verification (all 5 must pass):**

```powershell
# 1. Cold-start fallback
(Invoke-WebRequest -Uri "http://localhost:8109/recommendations/brand-new-user" -UseBasicParsing).Content
# PASS: 3 items, each with cold_start=true

# 2. Personalised after real sessions
(Invoke-WebRequest -Uri "http://localhost:8109/recommendations/chk-u9" -UseBasicParsing).Content
# PASS: items differ from cold-start list after 3+ sessions

# 3. Cache hit within 1 hour
docker exec infra-redis-1 redis-cli EXISTS "reco:chk-u9"
# PASS: 1

# 4. Invalidation clears cache
Invoke-WebRequest -Uri "http://localhost:8109/recommendations/chk-u9/invalidate" `
  -Method POST -UseBasicParsing | Out-Null
docker exec infra-redis-1 redis-cli EXISTS "reco:chk-u9"
# PASS: 0

# 5. AGT-10 library recommended tab populated
$lib = (Invoke-WebRequest -Uri "http://localhost:8110/library/chk-u9" -UseBasicParsing).Content | ConvertFrom-Json
Write-Host "Recommended tab: $($lib.recommended.Count)"
# PASS: non-empty
```

---

## Agent 11 of 11 — AGT-10: Habit Building
**Status: NOT BUILT — Sprint F (final agent)**

**Verification (all 5 must pass):**

```powershell
# 1. Four-tab library — all tabs populated
$lib = (Invoke-WebRequest -Uri "http://localhost:8110/library/chk-u10" -UseBasicParsing).Content | ConvertFrom-Json
Write-Host "today:$($lib.todaysPlan.Count) review:$($lib.dueForReview.Count) reco:$($lib.recommended.Count) browse:$($lib.browse.Count)"
# PASS: all non-empty

# 1b. CRITICAL — partial failure resilience
# Stop AGT-07. GET library. PASS: dueForReview=[] but other 3 tabs still return 200

# 2. Streak increments
$r = (Invoke-WebRequest -Uri "http://localhost:8110/streak/chk-u10/record" -Method POST `
  -ContentType "application/json" `
  -Body '{"clerk_user_id":"chk-u10","current_streak":6,"session_duration_minutes":20}' `
  -UseBasicParsing).Content | ConvertFrom-Json
Write-Host "New streak: $($r.streak)"
# PASS: 7 (and Novu milestone-celebration triggered in logs)

# 3. Re-engagement escalation
@(
    @{days=1; expected="daily-reminder"},
    @{days=3; expected="re-engagement-nudge"},
    @{days=7; expected="weekly-progress-summary"}
) | ForEach-Object {
    $b = "{`"clerk_user_id`":`"chk-u10`",`"days_since_last_session`":$($_.days)}"
    $r = (Invoke-WebRequest -Uri "http://localhost:8110/re-engagement" -Method POST `
      -ContentType "application/json" -Body $b -UseBasicParsing).Content | ConvertFrom-Json
    Write-Host "Days $($_.days): $($r.template) (expected $($_.expected))"
}
# PASS: each template matches expected

# 4. Novu delivers notification (requires real NOVU_API_KEY)
# Check Novu dashboard Activity Feed within 30 seconds

# 5. CRITICAL — Kafka consumer auto-increments streak
# Complete an AGT-03 session for chk-u10. Wait 5 seconds.
$streak = (Invoke-WebRequest -Uri "http://localhost:8110/streak/chk-u10" -UseBasicParsing).Content | ConvertFrom-Json
Write-Host "Streak (auto): $($streak.streak)"
# PASS: incremented without manual POST

# AGT-10 done = full agent system live
```

---

## Summary table

| Order | Agent | Status | Depends on | Sprint |
|---|---|---|---|---|
| 1 | AGT-06 Memory | **DONE** | Nothing | — |
| 2 | AGT-01 Profiling | **DONE** | AGT-06 | — |
| 3 | AGT-11 Translation | NOT BUILT | AGT-01 | **Sprint A** |
| 4 | AGT-04 Feedback | **DONE** | AGT-06 + AGT-11 | — |
| 5 | AGT-05 Assessment | **DONE** | AGT-01 + AGT-06 | — |
| 6 | AGT-02 Learning Path | **DONE** | AGT-01 + AGT-05 + AGT-06 | — |
| 7 | AGT-07 Review | NOT BUILT | AGT-06 + AGT-02 | **Sprint B** |
| 8 | AGT-03 Tutor | **PARTIAL** | AGT-01+02+04+06+07+11 | **Sprint C** |
| 9 | AGT-08 Analysis | NOT BUILT | AGT-06 + AGT-01 + ≥5 sessions | **Sprint D** |
| 10 | AGT-09 Recommendation | NOT BUILT | AGT-01 + AGT-07 + AGT-08 | **Sprint E** |
| 11 | AGT-10 Habit | NOT BUILT | AGT-07 + AGT-08 + AGT-09 | **Sprint F** |

---

## One rule that overrides everything

**Do not move to the next agent until the current one's verification
checks all pass.** A broken agent earlier in the chain produces silent
wrong behaviour in every agent after it — not loud failures. The
intra-session merge in AGT-01, the dual-write in AGT-04, and the
idempotent consolidation in AGT-06 are the three protocols where a
silent bug will corrupt data for every subsequent agent and every
subsequent session.
