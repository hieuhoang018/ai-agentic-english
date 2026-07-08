import json
import logging
import asyncio
from aiokafka import AIOKafkaConsumer
from agents.shared.config import settings

logger = logging.getLogger(__name__)

_RECONNECT_DELAY_SECONDS = 5


async def consume(
    topics: list[str],
    group_id: str,
    handler,
) -> None:
    """
    Kafka consumer loop with automatic reconnect.

    Callers schedule this via a fire-and-forget asyncio.create_task with
    nothing supervising it (see e.g. agents/agt10_habit/main.py's lifespan).
    Without a retry loop, a single failed connection attempt — most commonly
    Kafka not being ready yet at container boot, a real race observed in
    production — permanently and silently kills event consumption for the
    rest of the process's lifetime: the FastAPI app itself stays up and
    healthy, so nothing else notices. This loop retries (both the initial
    connect and a later mid-stream drop) after _RECONNECT_DELAY_SECONDS
    instead of ever letting the coroutine exit on its own.

    handler: async callable(topic: str, event: dict) -> None
    Runs forever until the task is cancelled.
    At-least-once delivery — handler must be idempotent.
    """
    while True:
        consumer = AIOKafkaConsumer(
            *topics,
            bootstrap_servers=settings.KAFKA_BROKERS,
            group_id=group_id,
            value_deserializer=lambda v: json.loads(v.decode("utf-8")),
            auto_offset_reset="earliest",
            enable_auto_commit=True,
        )
        try:
            await consumer.start()
        except Exception as exc:
            logger.error(
                "Consumer failed to start group=%s topics=%s error=%s — retrying in %ss",
                group_id, topics, exc, _RECONNECT_DELAY_SECONDS,
            )
            try:
                await consumer.stop()
            except Exception:
                pass  # best-effort cleanup of a consumer that never fully started
            await asyncio.sleep(_RECONNECT_DELAY_SECONDS)
            continue

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
        except Exception as exc:
            logger.error(
                "Consumer loop error group=%s topics=%s error=%s — reconnecting in %ss",
                group_id, topics, exc, _RECONNECT_DELAY_SECONDS,
            )
            await asyncio.sleep(_RECONNECT_DELAY_SECONDS)
        finally:
            await consumer.stop()
