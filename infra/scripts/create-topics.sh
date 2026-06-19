#!/usr/bin/env bash
# Create all Kafka/Redpanda topics required by Node.js services AND agent layer.
# Safe to re-run — rpk topic create is idempotent.
# Prerequisites: docker compose up -d kafka (or redpanda)
set -e

BROKERS="${KAFKA_BROKERS:-localhost:9092}"
RETENTION="2592000000"  # 30 days in milliseconds
PARTITIONS=3
REPLICAS=1

echo "Creating topics on brokers: $BROKERS"

# Node.js service topics (Section 7 of handoff)
node_topics=(
  "attempt.recorded"
  "user.upserted"
  "learning-path.ready"
  "achievement.unlocked"
  "review.due"
  "speaking-session.analyzed"
)

# Agent layer topics (Section 17.6 of handoff)
# session.start / session.end: produced by AGT-03, consumed by AGT-01 and AGT-06.
# agent.session.start / agent.session.end: retained for forward-compatibility per spec.
agent_topics=(
  "session.start"
  "session.end"
  "agent.errors"
  "agent.session.start"
  "agent.session.end"
  "agent.profile.deltas"
  "agent.pattern.events"
  "agent.plan.events"
  "agent.review.schedule"
  "agent.milestone.events"
  "agent.consolidation.complete"
)

all_topics=("${node_topics[@]}" "${agent_topics[@]}")

for topic in "${all_topics[@]}"; do
  echo "  -> $topic"
  rpk topic create "$topic" \
    --brokers "$BROKERS" \
    --topic-config retention.ms="$RETENTION" \
    --partitions "$PARTITIONS" \
    --replicas "$REPLICAS" \
    2>/dev/null || echo "     (already exists or rpk unavailable — skipping)"
done

echo "All ${#all_topics[@]} topics processed."
