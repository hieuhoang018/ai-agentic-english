import json
import uuid
import logging
from datetime import datetime, timezone
from aiokafka import AIOKafkaProducer
from agents.shared.config import settings

logger = logging.getLogger(__name__)

_producer: AIOKafkaProducer | None = None


async def get_producer() -> AIOKafkaProducer:
    global _producer
    if _producer is None:
        _producer = AIOKafkaProducer(
            bootstrap_servers=settings.KAFKA_BROKERS,
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            key_serializer=lambda k: k.encode("utf-8") if k else None,
        )
        await _producer.start()
    return _producer


async def close_producer() -> None:
    global _producer
    if _producer:
        await _producer.stop()
        _producer = None


async def emit(topic: str, payload: dict, agent_id: str, key: str | None = None) -> None:
    """
    Emit an event with the BaseEvent envelope onto a Kafka topic.
    Non-blocking — caller does not wait for broker acknowledgement.
    On failure: logs the error but does NOT raise (Kafka failure is not session-fatal).
    """
    producer = await get_producer()
    event = {
        "eventId": str(uuid.uuid4()),
        "schemaVersion": 1,
        "occurredAt": datetime.now(timezone.utc).isoformat(),
        "agentId": agent_id,
        **payload,
    }
    try:
        await producer.send(topic, value=event, key=key)
    except Exception as exc:
        logger.error("Kafka emit failed topic=%s agent=%s error=%s", topic, agent_id, exc)
