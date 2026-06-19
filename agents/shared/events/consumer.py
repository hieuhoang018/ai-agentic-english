import json
import logging
import asyncio
from aiokafka import AIOKafkaConsumer
from agents.shared.config import settings

logger = logging.getLogger(__name__)


async def consume(
    topics: list[str],
    group_id: str,
    handler,
) -> None:
    """
    Simple Kafka consumer loop.
    handler: async callable(topic: str, event: dict) -> None
    Runs forever until the task is cancelled.
    At-least-once delivery — handler must be idempotent.
    """
    consumer = AIOKafkaConsumer(
        *topics,
        bootstrap_servers=settings.KAFKA_BROKERS,
        group_id=group_id,
        value_deserializer=lambda v: json.loads(v.decode("utf-8")),
        auto_offset_reset="earliest",
        enable_auto_commit=True,
    )
    await consumer.start()
    logger.info("Consumer started group=%s topics=%s", group_id, topics)
    try:
        async for msg in consumer:
            try:
                await handler(msg.topic, msg.value)
            except Exception as exc:
                # Log and continue — do not crash the consumer on handler errors
                logger.error(
                    "Consumer handler error topic=%s offset=%s error=%s",
                    msg.topic, msg.offset, exc,
                )
    finally:
        await consumer.stop()
