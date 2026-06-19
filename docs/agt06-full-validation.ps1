# =============================================================================
# AGT-06 COMPLETE VALIDATION SUITE
# Covers all 78 criteria across every endpoint, edge case, and constraint.
# Run from: .worktrees/agt06-agt01-agt02-agt03-sprint
# =============================================================================

$pass = 0; $fail = 0
function Check($label, $condition) {
    if ($condition) { Write-Host "  [PASS] $label" -ForegroundColor Green;  $script:pass++ }
    else            { Write-Host "  [FAIL] $label" -ForegroundColor Red;    $script:fail++ }
}
function Section($title) {
    Write-Host ""
    Write-Host "  ── $title" -ForegroundColor Cyan
}
function GetStatus($err) {
    try { return [int]$err.Exception.Response.StatusCode.value__ } catch {}
    try { return [int]$err.Exception.Response.StatusCode } catch {}
    return 0
}

# ── Session IDs (all real UUIDs — Postgres UUID column enforces this) ─────────
$SID       = [guid]::NewGuid().ToString()   # main session
$SID_BUF   = [guid]::NewGuid().ToString()   # circular buffer test only
$SID_LATE  = [guid]::NewGuid().ToString()   # second session for ordering test
$SID_EMPTY = [guid]::NewGuid().ToString()   # empty-STM consolidation
$SID_GHOST = [guid]::NewGuid().ToString()   # no-profile consolidation test
$SID_VX    = [guid]::NewGuid().ToString()   # vocab cross-session 1
$SID_VY    = [guid]::NewGuid().ToString()   # vocab cross-session 2

$UID       = "full-val-$([guid]::NewGuid().ToString().Substring(0,8))"
$UID2      = "full-val-$([guid]::NewGuid().ToString().Substring(0,8))"  # vocab repeat test
$GHOST_UID = "ghost-$([guid]::NewGuid().ToString().Substring(0,8))"     # intentionally no AGT-01 profile

Write-Host ""
Write-Host "  ═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "    AGT-06 COMPLETE VALIDATION SUITE — All 78 Criteria" -ForegroundColor Cyan
Write-Host "  ═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Main SID  : $SID"
Write-Host "  Main UID  : $UID"
Write-Host "  Ghost UID : $GHOST_UID  (no AGT-01 profile — FK test)"
Write-Host ""

# ── Pre-flight: get Redis container ID for TTL checks ─────────────────────────
$REDIS_CID = (docker compose -f infra/docker-compose.yml ps -q redis 2>$null | Select-Object -First 1).Trim()
if (-not $REDIS_CID) { Write-Host "  [WARN] Redis container not found — TTL checks will be skipped" -ForegroundColor Yellow }

# ── Pre-flight: create AGT-01 profiles (only for $UID and $UID2) ──────────────
# NOTE: $GHOST_UID intentionally NOT created — we test consolidation without a profile
Invoke-RestMethod -Method Post "http://localhost:8101/profile/$UID" `
    -ContentType "application/json" `
    -Body "{`"clerk_user_id`":`"$UID`"}" | Out-Null
Invoke-RestMethod -Method Post "http://localhost:8101/profile/$UID2" `
    -ContentType "application/json" `
    -Body "{`"clerk_user_id`":`"$UID2`"}" | Out-Null

# =============================================================================
Section "1. INFRASTRUCTURE"

$h = Invoke-RestMethod "http://localhost:8106/health"
Check "1.1  health status = ok"      ($h.status -eq "ok")
Check "1.2  health agent = AGT-06"   ($h.agent  -eq "AGT-06")
# 1.3 Redis live — proven implicitly when any STM write succeeds (see section 2)
# 1.4 Kafka live — checked via logs in section 9 after consolidation

# =============================================================================
Section "2. STM STATE  (session:{id}:state)"

# 2.1 POST returns 204
$r = Invoke-WebRequest -Method Post "http://localhost:8106/sessions/$SID/state" `
    -ContentType "application/json" -Body '{"skill_focus":"SPEAKING"}'
Check "2.1  POST state → 204 No Content"                  ($r.StatusCode -eq 204)
Check "1.3  Redis live (STM write succeeded)"              ($r.StatusCode -eq 204)  # proves 1.3

# 2.2 POST missing required field → 422
try {
    Invoke-RestMethod -Method Post "http://localhost:8106/sessions/$SID/state" `
        -ContentType "application/json" -Body '{"activity":"warmup"}' | Out-Null
    Check "2.2  Missing skill_focus → 422" $false
} catch {
    Check "2.2  Missing skill_focus → 422" (GetStatus($_) -eq 422)
}

# 2.3 GET returns exact object
$s = Invoke-RestMethod "http://localhost:8106/sessions/$SID/state"
Check "2.3  State value correct (skill_focus=SPEAKING)"    ($s.skill_focus -eq "SPEAKING")

# 2.4 GET missing session → 404
try {
    Invoke-RestMethod "http://localhost:8106/sessions/$([guid]::NewGuid())/state" | Out-Null
    Check "2.4  GET missing state → 404" $false
} catch {
    Check "2.4  GET missing state → 404"                   (GetStatus($_) -eq 404)
}

# 2.5 Second POST overwrites (not appends)
Invoke-RestMethod -Method Post "http://localhost:8106/sessions/$SID/state" `
    -ContentType "application/json" -Body '{"skill_focus":"WRITING"}' | Out-Null
$s2 = Invoke-RestMethod "http://localhost:8106/sessions/$SID/state"
Check "2.5  Second POST overwrites (SPEAKING → WRITING)"  ($s2.skill_focus -eq "WRITING")

# 2.6 TTL is set (not -1 = infinite, not -2 = missing)
if ($REDIS_CID) {
    $ttl = (docker exec $REDIS_CID redis-cli TTL "session:${SID}:state" 2>$null).Trim()
    Check "2.6  State TTL > 0 (expires, not infinite)"    ([int]$ttl -gt 0)
} else {
    Write-Host "  [SKIP] 2.6  Redis container not found" -ForegroundColor Yellow
}

# Reset to SPEAKING for consolidation later
Invoke-RestMethod -Method Post "http://localhost:8106/sessions/$SID/state" `
    -ContentType "application/json" -Body '{"skill_focus":"SPEAKING"}' | Out-Null

# =============================================================================
Section "3. STM ERRORS  (session:{id}:errors)"

# 3.1 POST returns 204
$r = Invoke-WebRequest -Method Post "http://localhost:8106/sessions/$SID/errors" `
    -ContentType "application/json" `
    -Body "{`"error_type`":`"verb_tense`",`"skill_domain`":`"SPEAKING`",`"severity`":2,`"clerk_user_id`":`"$UID`"}"
Check "3.1  POST error → 204"                              ($r.StatusCode -eq 204)

# 3.2 POST missing required field → 422
try {
    Invoke-RestMethod -Method Post "http://localhost:8106/sessions/$SID/errors" `
        -ContentType "application/json" -Body '{"error_type":"verb_tense"}' | Out-Null
    Check "3.2  Missing fields → 422" $false
} catch {
    Check "3.2  Missing required fields → 422"             (GetStatus($_) -eq 422)
}

# Add two more errors (different types and domains) for ordering and filter tests
Invoke-RestMethod -Method Post "http://localhost:8106/sessions/$SID/errors" `
    -ContentType "application/json" `
    -Body "{`"error_type`":`"article_usage`",`"skill_domain`":`"WRITING`",`"severity`":1,`"clerk_user_id`":`"$UID`"}" | Out-Null
Invoke-RestMethod -Method Post "http://localhost:8106/sessions/$SID/errors" `
    -ContentType "application/json" `
    -Body "{`"error_type`":`"preposition`",`"skill_domain`":`"SPEAKING`",`"severity`":1,`"clerk_user_id`":`"$UID`"}" | Out-Null

# 3.3 GET returns an array
$errs = Invoke-RestMethod "http://localhost:8106/sessions/$SID/errors"
Check "3.3  GET errors returns array"                      ($errs -is [array] -or $errs.Count -ge 1)

# 3.4 Insertion order preserved (verb_tense was first)
Check "3.4  Insertion order preserved (oldest first)"     ($errs[0].error_type -eq "verb_tense" -and $errs[1].error_type -eq "article_usage")

# 3.5 Unknown session → [] not 404
$emptyE = Invoke-RestMethod "http://localhost:8106/sessions/$([guid]::NewGuid())/errors"
Check "3.5  Unknown session errors → empty list (not 404)" ($null -ne $emptyE -and $emptyE.Count -eq 0)

# 3.6 TTL set
if ($REDIS_CID) {
    $ttl = (docker exec $REDIS_CID redis-cli TTL "session:${SID}:errors" 2>$null).Trim()
    Check "3.6  Errors TTL > 0"                            ([int]$ttl -gt 0)
} else { Write-Host "  [SKIP] 3.6" -ForegroundColor Yellow }

# =============================================================================
Section "4. STM CONTEXT BUFFER  (session:{id}:context, max 20)"

# 4.1 POST returns 204
$r = Invoke-WebRequest -Method Post "http://localhost:8106/sessions/$SID/context" `
    -ContentType "application/json" -Body '{"role":"user","content":"first turn"}'
Check "4.1  POST context → 204"                            ($r.StatusCode -eq 204)

# 4.2 POST missing required field → 422
try {
    Invoke-RestMethod -Method Post "http://localhost:8106/sessions/$SID/context" `
        -ContentType "application/json" -Body '{"role":"user"}' | Out-Null
    Check "4.2  Missing content → 422" $false
} catch {
    Check "4.2  Missing content → 422"                     (GetStatus($_) -eq 422)
}

# 4.3 Insertion order preserved
Invoke-RestMethod -Method Post "http://localhost:8106/sessions/$SID/context" `
    -ContentType "application/json" -Body '{"role":"assistant","content":"second turn"}' | Out-Null
$ctx = Invoke-RestMethod "http://localhost:8106/sessions/$SID/context"
Check "4.3  Insertion order correct (user first, assistant second)" `
    ($ctx[0].content -eq "first turn" -and $ctx[1].content -eq "second turn")

# 4.4/4.5 Circular buffer: push 25 to separate session, keep 20, oldest = turn 6
1..25 | ForEach-Object {
    Invoke-RestMethod -Method Post "http://localhost:8106/sessions/$SID_BUF/context" `
        -ContentType "application/json" `
        -Body "{`"role`":`"user`",`"content`":`"turn $_`"}" | Out-Null
}
$buf = Invoke-RestMethod "http://localhost:8106/sessions/$SID_BUF/context"
Check "4.4  Buffer caps at 20 (pushed 25)"                 ($buf.Count -eq 20)
Check "4.5  Oldest 5 dropped (first item = turn 6)"        ($buf[0].content -eq "turn 6")
Check "4.5b Last item = turn 25"                           ($buf[-1].content -eq "turn 25")

# 4.6 Unknown session → []
$emptyC = Invoke-RestMethod "http://localhost:8106/sessions/$([guid]::NewGuid())/context"
Check "4.6  Unknown session context → empty list"          ($null -ne $emptyC -and $emptyC.Count -eq 0)

# 4.7 TTL set
if ($REDIS_CID) {
    $ttl = (docker exec $REDIS_CID redis-cli TTL "session:${SID}:context" 2>$null).Trim()
    Check "4.7  Context TTL > 0"                           ([int]$ttl -gt 0)
} else { Write-Host "  [SKIP] 4.7" -ForegroundColor Yellow }

# =============================================================================
Section "5. STM VOCAB  (session:{id}:vocab)"

# 5.1 POST returns 204
$r = Invoke-WebRequest -Method Post "http://localhost:8106/sessions/$SID/vocab" `
    -ContentType "application/json" `
    -Body '{"word":"benchmark","context_sentence":"Set a benchmark.","skill_domain":"SPEAKING"}'
Check "5.1  POST vocab → 204"                              ($r.StatusCode -eq 204)

# 5.2 POST missing skill_domain → 422
try {
    Invoke-RestMethod -Method Post "http://localhost:8106/sessions/$SID/vocab" `
        -ContentType "application/json" `
        -Body '{"word":"pivot","context_sentence":"We need to pivot."}' | Out-Null
    Check "5.2  Missing skill_domain → 422" $false
} catch {
    Check "5.2  Missing skill_domain → 422"                (GetStatus($_) -eq 422)
}

# 5.3 GET returns list with 1 item
$voc = Invoke-RestMethod "http://localhost:8106/sessions/$SID/vocab"
Check "5.3  Vocab list has 1 item"                         ($voc.Count -eq 1 -and $voc[0].word -eq "benchmark")

# 5.4 Same word twice → 2 entries in STM (no STM-level dedup; dedup is at LTM)
Invoke-RestMethod -Method Post "http://localhost:8106/sessions/$SID/vocab" `
    -ContentType "application/json" `
    -Body '{"word":"benchmark","context_sentence":"A new benchmark.","skill_domain":"WRITING"}' | Out-Null
$voc2 = Invoke-RestMethod "http://localhost:8106/sessions/$SID/vocab"
Check "5.4  Same word twice → 2 entries in STM (dedup at LTM only)" ($voc2.Count -eq 2)

# 5.5 Unknown session → []
$emptyV = Invoke-RestMethod "http://localhost:8106/sessions/$([guid]::NewGuid())/vocab"
Check "5.5  Unknown session vocab → empty list"            ($null -ne $emptyV -and $emptyV.Count -eq 0)

# 5.6 TTL set
if ($REDIS_CID) {
    $ttl = (docker exec $REDIS_CID redis-cli TTL "session:${SID}:vocab" 2>$null).Trim()
    Check "5.6  Vocab TTL > 0"                             ([int]$ttl -gt 0)
} else { Write-Host "  [SKIP] 5.6" -ForegroundColor Yellow }

# =============================================================================
Section "6. STM DIFFICULTY  (session:{id}:difficulty)"

# 6.1 POST returns 204
$r = Invoke-WebRequest -Method Post "http://localhost:8106/sessions/$SID/difficulty" `
    -ContentType "application/json" -Body '{"level":"B1"}'
Check "6.1  POST difficulty → 204"                         ($r.StatusCode -eq 204)

# 6.2 GET returns exact object
$d = Invoke-RestMethod "http://localhost:8106/sessions/$SID/difficulty"
Check "6.2  Difficulty value correct (level=B1)"           ($d.level -eq "B1")

# 6.3 GET missing session → 404
try {
    Invoke-RestMethod "http://localhost:8106/sessions/$([guid]::NewGuid())/difficulty" | Out-Null
    Check "6.3  GET missing difficulty → 404" $false
} catch {
    Check "6.3  GET missing difficulty → 404"              (GetStatus($_) -eq 404)
}

# 6.4 Second POST overwrites (not appends)
Invoke-RestMethod -Method Post "http://localhost:8106/sessions/$SID/difficulty" `
    -ContentType "application/json" -Body '{"level":"B2"}' | Out-Null
$d2 = Invoke-RestMethod "http://localhost:8106/sessions/$SID/difficulty"
Check "6.4  Second POST overwrites (B1 → B2)"             ($d2.level -eq "B2")
# Reset to B1
Invoke-RestMethod -Method Post "http://localhost:8106/sessions/$SID/difficulty" `
    -ContentType "application/json" -Body '{"level":"B1"}' | Out-Null

# =============================================================================
Section "7. STM LANG  (session:{id}:lang)"

# 7.1 POST returns 204
$r = Invoke-WebRequest -Method Post "http://localhost:8106/sessions/$SID/lang" `
    -ContentType "application/json" -Body '{"vi_fallback":false}'
Check "7.1  POST lang → 204"                               ($r.StatusCode -eq 204)

# 7.2 GET returns exact object
$l = Invoke-RestMethod "http://localhost:8106/sessions/$SID/lang"
Check "7.2  Lang value correct (vi_fallback=false)"        ($l.vi_fallback -eq $false)

# 7.3 GET missing session → 404
try {
    Invoke-RestMethod "http://localhost:8106/sessions/$([guid]::NewGuid())/lang" | Out-Null
    Check "7.3  GET missing lang → 404" $false
} catch {
    Check "7.3  GET missing lang → 404"                    (GetStatus($_) -eq 404)
}

# 7.4 Second POST overwrites
Invoke-RestMethod -Method Post "http://localhost:8106/sessions/$SID/lang" `
    -ContentType "application/json" -Body '{"vi_fallback":true}' | Out-Null
$l2 = Invoke-RestMethod "http://localhost:8106/sessions/$SID/lang"
Check "7.4  Second POST overwrites (false → true)"         ($l2.vi_fallback -eq $true)

# =============================================================================
Section "8. STM WRITING  (session:{id}:writing)"

# 8.1 POST returns 204
$r = Invoke-WebRequest -Method Post "http://localhost:8106/sessions/$SID/writing" `
    -ContentType "application/json" -Body '{"draft":"Hello world"}'
Check "8.1  POST writing → 204"                            ($r.StatusCode -eq 204)

# 8.2 GET returns exact object
$w = Invoke-RestMethod "http://localhost:8106/sessions/$SID/writing"
Check "8.2  Writing value correct (draft=Hello world)"     ($w.draft -eq "Hello world")

# 8.3 GET missing session → 404
try {
    Invoke-RestMethod "http://localhost:8106/sessions/$([guid]::NewGuid())/writing" | Out-Null
    Check "8.3  GET missing writing → 404" $false
} catch {
    Check "8.3  GET missing writing → 404"                 (GetStatus($_) -eq 404)
}

# 8.4 Second POST overwrites
Invoke-RestMethod -Method Post "http://localhost:8106/sessions/$SID/writing" `
    -ContentType "application/json" -Body '{"draft":"Updated draft"}' | Out-Null
$w2 = Invoke-RestMethod "http://localhost:8106/sessions/$SID/writing"
Check "8.4  Second POST overwrites (draft updated)"        ($w2.draft -eq "Updated draft")

# =============================================================================
Section "9. CONSOLIDATION  (POST /sessions/{id}/consolidate)"
# STM state at this point for $SID:
#   errors : verb_tense(SPEAKING,sev=2), article_usage(WRITING,sev=1), preposition(SPEAKING,sev=1)
#   context: "first turn", "second turn"
#   vocab  : benchmark × 2 (different context sentences)
#   state  : skill_focus=SPEAKING
#   difficulty: B1
#   lang   : vi_fallback=true
#   writing: "Updated draft"

# 9.1 First call → consolidated=true
$c1 = Invoke-RestMethod -Method Post "http://localhost:8106/sessions/$SID/consolidate" `
    -ContentType "application/json" `
    -Body "{`"clerk_user_id`":`"$UID`",`"skill_focus`":`"SPEAKING`"}"
Check "9.1  First consolidation → consolidated=true"       ($c1.consolidated -eq $true)
Check "9.1b Response includes session_id"                  ($c1.session_id -eq $SID)

# 9.2 Second call → consolidated=false (idempotent)
$c2 = Invoke-RestMethod -Method Post "http://localhost:8106/sessions/$SID/consolidate" `
    -ContentType "application/json" `
    -Body "{`"clerk_user_id`":`"$UID`",`"skill_focus`":`"SPEAKING`"}"
Check "9.2  Second consolidation → consolidated=false"     ($c2.consolidated -eq $false)

# 9.3 learning_sessions row exists in Postgres
$allSess = Invoke-RestMethod "http://localhost:8106/ltm/$UID/sessions"
$mySess = $allSess | Where-Object { [string]$_.session_id -eq $SID }
Check "9.3  learning_sessions row created in Postgres"     ($null -ne $mySess)

# 9.4 end_time is set (session is closed)
Check "9.4  Session end_time is NOT null (closed)"         ($null -ne $mySess -and $null -ne $mySess.end_time)

# 9.5 STM errors written to error_events with correct data
$ltmErrs = Invoke-RestMethod "http://localhost:8106/ltm/$UID/errors"
$vtErr   = $ltmErrs | Where-Object { $_.error_type -eq "verb_tense" -and [string]$_.session_id -eq $SID }
Check "9.5a STM errors in error_events (3 rows)"           (($ltmErrs | Where-Object { [string]$_.session_id -eq $SID }).Count -eq 3)
Check "9.5b verb_tense row has severity=2"                 ($null -ne $vtErr -and $vtErr[0].severity -eq 2)
Check "9.5c verb_tense row has skill_domain=SPEAKING"      ($null -ne $vtErr -and $vtErr[0].skill_domain -eq "SPEAKING")

# 9.6 STM vocab upserted into vocabulary_mastery
$ltmVoc  = Invoke-RestMethod "http://localhost:8106/ltm/$UID/vocabulary"
$bmWord  = $ltmVoc | Where-Object { $_.word -eq "benchmark" }
Check "9.6  STM vocab in vocabulary_mastery"               ($null -ne $bmWord)

# 9.7 STM context in conversation_archive with correct transcript
$ltmConv = Invoke-RestMethod "http://localhost:8106/ltm/$UID/conversations"
$myConv  = $ltmConv | Where-Object { [string]$_.session_id -eq $SID }
Check "9.7a STM context in conversation_archive"           ($null -ne $myConv)
Check "9.7b clerk_user_id on conversation matches"         ($null -ne $myConv -and $myConv[0].clerk_user_id -eq $UID)

# 9.8 Kafka — no producer error in recent logs
$logs = docker compose -f infra/docker-compose.yml logs agt06-memory --tail=60 2>&1
Check "1.4  Kafka producer live (no KafkaException in logs)" ($logs -notmatch "KafkaException|NoBrokersAvailable|failed to emit")
Check "9.8  No consolidation Kafka error in logs"          ($logs -notmatch "KafkaException|NoBrokersAvailable")

# 9.9 Missing clerk_user_id in body → 422
try {
    Invoke-RestMethod -Method Post "http://localhost:8106/sessions/$SID/consolidate" `
        -ContentType "application/json" -Body '{"skill_focus":"SPEAKING"}' | Out-Null
    Check "9.9  Missing clerk_user_id → 422" $false
} catch {
    Check "9.9  Missing clerk_user_id → 422"               (GetStatus($_) -eq 422)
}

# 9.10 Non-UUID session_id → Postgres UUID column rejects it → 5xx
try {
    Invoke-RestMethod -Method Post "http://localhost:8106/sessions/not-a-real-uuid/consolidate" `
        -ContentType "application/json" `
        -Body "{`"clerk_user_id`":`"$UID`",`"skill_focus`":`"SPEAKING`"}" | Out-Null
    Check "9.10 Non-UUID session_id → error" $false
} catch {
    Check "9.10 Non-UUID session_id → 4xx or 5xx"         (GetStatus($_) -ge 400)
}

# 9.11 No AGT-01 profile — learning_sessions.clerk_user_id is TEXT (no FK)
#       Consolidation SUCCEEDS — this is the correct behavior per schema.
Invoke-RestMethod -Method Post "http://localhost:8106/sessions/$SID_GHOST/context" `
    -ContentType "application/json" -Body '{"role":"user","content":"ghost turn"}' | Out-Null
try {
    $ghostC = Invoke-RestMethod -Method Post "http://localhost:8106/sessions/$SID_GHOST/consolidate" `
        -ContentType "application/json" `
        -Body "{`"clerk_user_id`":`"$GHOST_UID`",`"skill_focus`":`"SPEAKING`"}"
    Check "9.11 No-profile consolidation succeeds (no FK constraint on clerk_user_id)" ($ghostC.consolidated -eq $true)
} catch {
    Check "9.11 No-profile consolidation succeeds" $false
}

# 9.12 Empty STM consolidation (no errors, no vocab, no context) → succeeds
try {
    $emptyC = Invoke-RestMethod -Method Post "http://localhost:8106/sessions/$SID_EMPTY/consolidate" `
        -ContentType "application/json" `
        -Body "{`"clerk_user_id`":`"$UID`",`"skill_focus`":`"SPEAKING`"}"
    Check "9.12 Empty-STM consolidation → consolidated=true" ($emptyC.consolidated -eq $true)
} catch {
    Check "9.12 Empty-STM consolidation succeeds" $false
}

# =============================================================================
Section "10. LTM SESSIONS  (GET /ltm/{uid}/sessions)"

# Consolidate a second session so we can test ordering
Invoke-RestMethod -Method Post "http://localhost:8106/sessions/$SID_LATE/context" `
    -ContentType "application/json" -Body '{"role":"user","content":"later session"}' | Out-Null
Invoke-RestMethod -Method Post "http://localhost:8106/sessions/$SID_LATE/consolidate" `
    -ContentType "application/json" `
    -Body "{`"clerk_user_id`":`"$UID`",`"skill_focus`":`"READING`"}" | Out-Null

$allSess = Invoke-RestMethod "http://localhost:8106/ltm/$UID/sessions"

# 10.1 Ordered by start_time DESC (most recent first)
$first = $allSess[0]
Check "10.1 Sessions ordered DESC (SID_LATE is most recent)" ([string]$first.session_id -eq $SID_LATE)

# 10.2 Both sessions in list
Check "10.2 Original $SID in list"                         (($allSess | Where-Object { [string]$_.session_id -eq $SID }).Count -ge 1)
Check "10.2b Later session in list"                        (($allSess | Where-Object { [string]$_.session_id -eq $SID_LATE }).Count -ge 1)

# 10.3 end_time set on first consolidated session
$mySess = $allSess | Where-Object { [string]$_.session_id -eq $SID }
Check "10.3 Consolidated session has end_time set"         ($null -ne $mySess -and $null -ne $mySess[0].end_time)

# 10.4 Unknown user → []
$unknownS = Invoke-RestMethod "http://localhost:8106/ltm/nobody-$([guid]::NewGuid().ToString().Substring(0,8))/sessions"
Check "10.4 Unknown user sessions → empty list"            ($unknownS.Count -eq 0)

# 10.5 limit=1 respected
$limS = Invoke-RestMethod "http://localhost:8106/ltm/${UID}/sessions?limit=1"
Check "10.5 Sessions limit=1 respected"                    ($limS.Count -eq 1)

# =============================================================================
Section "11. LTM ERRORS  (GET /ltm/{uid}/errors)"

$allErrsLtm = Invoke-RestMethod "http://localhost:8106/ltm/$UID/errors"

# 11.1 Returns list (ordered by created_at DESC)
Check "11.1 LTM errors returned (>=3)"                     ($allErrsLtm.Count -ge 3)

# 11.2 Data integrity — correct values written
$vtRow = $allErrsLtm | Where-Object { $_.error_type -eq "verb_tense" }
Check "11.2a verb_tense row exists with correct severity"  ($null -ne $vtRow -and $vtRow[0].severity -eq 2)
Check "11.2b verb_tense row has correct skill_domain"      ($null -ne $vtRow -and $vtRow[0].skill_domain -eq "SPEAKING")

# 11.3 skill_domain filter
$spkErrs = Invoke-RestMethod "http://localhost:8106/ltm/${UID}/errors?skill_domain=SPEAKING"
$wrtErrs = Invoke-RestMethod "http://localhost:8106/ltm/${UID}/errors?skill_domain=WRITING"
Check "11.3a SPEAKING filter returns only SPEAKING rows"   (($spkErrs | Where-Object { $_.skill_domain -ne "SPEAKING" }).Count -eq 0 -and $spkErrs.Count -ge 1)
Check "11.3b WRITING filter returns only WRITING rows"     (($wrtErrs | Where-Object { $_.skill_domain -ne "WRITING" }).Count -eq 0 -and $wrtErrs.Count -ge 1)

# 11.4 Unknown user → []
$unknownE = Invoke-RestMethod "http://localhost:8106/ltm/nobody-$([guid]::NewGuid().ToString().Substring(0,8))/errors"
Check "11.4 Unknown user errors → empty list"              ($unknownE.Count -eq 0)

# 11.5 limit=1 respected
$limE = Invoke-RestMethod "http://localhost:8106/ltm/${UID}/errors?limit=1"
Check "11.5 Errors limit=1 respected"                      ($limE.Count -eq 1)

# =============================================================================
Section "12. LTM VOCABULARY  (GET /ltm/{uid}/vocabulary)"

$allVocLtm = Invoke-RestMethod "http://localhost:8106/ltm/$UID/vocabulary"

# 12.1 Returns list
Check "12.1 Vocabulary returned (>=1 item)"                ($allVocLtm.Count -ge 1)

# 12.2 Benchmark word exists
$bmRow = $allVocLtm | Where-Object { $_.word -eq "benchmark" }
Check "12.2 benchmark word in vocabulary_mastery"          ($null -ne $bmRow)

# 12.3 Same word twice in one session → 1 row with encounter_count=2 (LTM dedup)
Check "12.3 benchmark encounter_count = 2 (not 2 rows)"   ($null -ne $bmRow -and $bmRow[0].encounter_count -eq 2)

# 12.4 context_sentences populated (both sentences stored, capped at 5)
Check "12.4 context_sentences has 2 entries"               ($null -ne $bmRow -and $bmRow[0].context_sentences.Count -ge 2)

# 12.5 Cross-session: same word across 2 sessions → encounter_count=2 for $UID2
Invoke-RestMethod -Method Post "http://localhost:8106/sessions/$SID_VX/vocab" `
    -ContentType "application/json" `
    -Body '{"word":"paradigm","context_sentence":"A new paradigm.","skill_domain":"WRITING"}' | Out-Null
Invoke-RestMethod -Method Post "http://localhost:8106/sessions/$SID_VX/context" `
    -ContentType "application/json" -Body '{"role":"user","content":"vx"}' | Out-Null
Invoke-RestMethod -Method Post "http://localhost:8106/sessions/$SID_VX/consolidate" `
    -ContentType "application/json" `
    -Body "{`"clerk_user_id`":`"$UID2`",`"skill_focus`":`"WRITING`"}" | Out-Null

Invoke-RestMethod -Method Post "http://localhost:8106/sessions/$SID_VY/vocab" `
    -ContentType "application/json" `
    -Body '{"word":"paradigm","context_sentence":"Shift the paradigm.","skill_domain":"SPEAKING"}' | Out-Null
Invoke-RestMethod -Method Post "http://localhost:8106/sessions/$SID_VY/context" `
    -ContentType "application/json" -Body '{"role":"user","content":"vy"}' | Out-Null
Invoke-RestMethod -Method Post "http://localhost:8106/sessions/$SID_VY/consolidate" `
    -ContentType "application/json" `
    -Body "{`"clerk_user_id`":`"$UID2`",`"skill_focus`":`"SPEAKING`"}" | Out-Null

$uid2Voc  = Invoke-RestMethod "http://localhost:8106/ltm/$UID2/vocabulary"
$paradigm = $uid2Voc | Where-Object { $_.word -eq "paradigm" }
Check "12.5a Cross-session: paradigm = 1 row (upsert, not 2 rows)" ($paradigm.Count -eq 1)
Check "12.5b Cross-session: encounter_count = 2"                    ($null -ne $paradigm -and $paradigm[0].encounter_count -eq 2)
Check "12.5c Cross-session: 2 context_sentences stored"             ($null -ne $paradigm -and $paradigm[0].context_sentences.Count -ge 2)

# 12.6 Unknown user → []
$unknownV = Invoke-RestMethod "http://localhost:8106/ltm/nobody-$([guid]::NewGuid().ToString().Substring(0,8))/vocabulary"
Check "12.6 Unknown user vocabulary → empty list"          ($unknownV.Count -eq 0)

# 12.7 limit respected
$limV = Invoke-RestMethod "http://localhost:8106/ltm/${UID}/vocabulary?limit=1"
Check "12.7 Vocabulary limit=1 respected"                  ($limV.Count -eq 1)

# =============================================================================
Section "13. LTM CONVERSATIONS  (GET /ltm/{uid}/conversations)"

$allConvLtm = Invoke-RestMethod "http://localhost:8106/ltm/$UID/conversations"

# 13.1 Returns list
Check "13.1 Conversations returned (>=1)"                  ($allConvLtm.Count -ge 1)

# 13.2 Transcript content correct (contains "first turn" from section 4)
$myConvRow = $allConvLtm | Where-Object { [string]$_.session_id -eq $SID }
$transcript = $myConvRow[0].transcript
Check "13.2 Transcript is non-null and non-empty"          ($null -ne $transcript -and $transcript.Count -gt 0)

# 13.3 All required fields present
$conv0 = $allConvLtm[0]
Check "13.3a conv_id field present"                        ($null -ne $conv0.conv_id)
Check "13.3b session_id field present"                     ($null -ne $conv0.session_id)
Check "13.3c clerk_user_id field present and correct"      ($conv0.clerk_user_id -eq $UID)
Check "13.3d transcript field present"                     ($null -ne $conv0.transcript)
Check "13.3e created_at field present"                     ($null -ne $conv0.created_at)

# 13.4 Unknown user → []
$unknownC = Invoke-RestMethod "http://localhost:8106/ltm/nobody-$([guid]::NewGuid().ToString().Substring(0,8))/conversations"
Check "13.4 Unknown user conversations → empty list"       ($unknownC.Count -eq 0)

# 13.5 limit respected
$limC = Invoke-RestMethod "http://localhost:8106/ltm/${UID}/conversations?limit=1"
Check "13.5 Conversations limit=1 respected"               ($limC.Count -eq 1)

# =============================================================================
Section "14. REVIEW CENTER  (GET /review-center/{uid})"

$rev = Invoke-RestMethod "http://localhost:8106/review-center/$UID"

# 14.1 Exactly 5 keys
$revKeys = ($rev | Get-Member -MemberType NoteProperty).Name
Check "14.1 Review center has 5 keys"                      ($revKeys.Count -eq 5)

# 14.2 semantic_search_available = false (pgvector Phase 8+)
Check "14.2 semantic_search_available = false"             ($rev.semantic_search_available -eq $false)

# 14.3 All 4 data arrays present and populated
Check "14.3a errors array present and non-empty"           ($null -ne $rev.errors -and $rev.errors.Count -ge 1)
Check "14.3b vocabulary array present and non-empty"       ($null -ne $rev.vocabulary -and $rev.vocabulary.Count -ge 1)
Check "14.3c sessions array present and non-empty"         ($null -ne $rev.sessions -and $rev.sessions.Count -ge 1)
Check "14.3d conversations array present and non-empty"    ($null -ne $rev.conversations -and $rev.conversations.Count -ge 1)

# 14.3e Unknown user → empty lists (not 404)
$revU = Invoke-RestMethod "http://localhost:8106/review-center/nobody-$([guid]::NewGuid().ToString().Substring(0,8))"
Check "14.3e Unknown user review center → empty lists"     (
    $null -ne $revU.errors         -and $revU.errors.Count        -eq 0 -and
    $null -ne $revU.vocabulary     -and $revU.vocabulary.Count    -eq 0 -and
    $null -ne $revU.sessions       -and $revU.sessions.Count      -eq 0 -and
    $null -ne $revU.conversations  -and $revU.conversations.Count -eq 0
)

# 14.4 limit param caps conversations
$revLim = Invoke-RestMethod "http://localhost:8106/review-center/${UID}?limit=1"
Check "14.4 Review center limit=1 → conversations capped"  ($revLim.conversations.Count -le 1)

# =============================================================================
# FINAL RESULT

Write-Host ""
Write-Host "  ═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  RESULT: $pass passed / $fail failed" -ForegroundColor Cyan
if ($fail -eq 0) {
    Write-Host "  AGT-06 FULLY VALIDATED — ALL CRITERIA PASS" -ForegroundColor Green
} else {
    Write-Host "  FIX THE $fail FAILURE(S) ABOVE BEFORE SHIPPING" -ForegroundColor Red
}
Write-Host "  ═══════════════════════════════════════════════════════" -ForegroundColor Cyan
