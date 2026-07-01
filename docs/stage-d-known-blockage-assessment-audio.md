# Stage D Known Blockage: Assessment Audio ETL

Date observed: 2026-06-28

## Context

Stage D requires both database rows and MinIO audio objects to be present locally. The learning-materials database is seeded and healthy, and passage audio is present in MinIO. Assessment listening rows are also seeded, but the matching `assessment-audio` MinIO objects could not be populated.

## Verified Working

- Required services are healthy through `127.0.0.1`:
  - `http://127.0.0.1:4001/health`
  - `http://127.0.0.1:8000/api/health/user-service`
  - `http://127.0.0.1:4002/health`
  - `http://127.0.0.1:4005/health`
  - `http://127.0.0.1:8100/health`
- `npx prisma migrate deploy` reports no pending learning-materials migrations.
- Learning-materials seed scripts completed:
  - `seed`
  - `seed:vocab`
  - `seed:grammar`
  - `seed:generated`
  - `seed:passages`
  - `seed:assessment`
- Local learning-materials row counts after seeding:
  - Modules: 6
  - Lessons: 19
  - Exercises: 73
  - Vocabulary entries: 7798
  - Grammar points: 292
  - Passages: 26
  - Media assets: 26
  - Assessment questions: 45
- `passage-audio` MinIO bucket contains 26 objects, about 63 MB total.

## Blockage

`agents/tools/assessment_listening_etl.py` cannot currently populate the `assessment-audio` bucket from this environment.

Latest retry on 2026-06-28 produced the same failure before any upload:

```text
urllib.error.URLError: <urlopen error [Errno 11001] getaddrinfo failed>
```

The ETL can reach the mirror page, for example:

```text
https://www.manythings.org/voa/words/22.html
```

That page embeds an old VOA MP3 URL like:

```text
http://www.voanews.com/MediaAssets2/learningenglish/2008_05/audio/mp3/se-ws-medical-terms.mp3
```

Fetching the embedded MP3 fails before upload. Observed failures include DNS resolution failure for `www.voanews.com`, redirect to an unreachable host, TLS handshake failure, or HTTP timeout/reset when trying host-normalized variants.

Current MinIO verification:

```text
passage-audio: 26 objects
assessment-audio: 0 objects
```

## Impact

Stage D is not fully complete because assessment listening `audioKey` values exist in Postgres, but their corresponding MinIO objects are missing. Stage E can still fetch assessment questions, but listening audio playback will be unavailable until `assessment-audio` is populated.

## Suggested Next Action

Replace or augment the assessment listening audio source before rerunning the ETL. Viable options:

- Find stable current URLs for the same 12 VOA MP3 files and update `assessment_listening_etl.py`.
- Add an archive fallback if reliable archived MP3 snapshots are available.
- Store the 12 assessment MP3s in a shared/team object store and document that source as the bootstrap path.

After fixing the source, rerun:

```bash
python3 agents/tools/assessment_listening_etl.py
npm run seed:assessment -w services/learning-materials-service
```

Then verify that `assessment-audio` contains 12 objects.
