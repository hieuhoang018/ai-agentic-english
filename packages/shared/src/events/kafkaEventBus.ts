import { Kafka, Partitioners, Producer } from 'kafkajs';
import { DomainEvent, EventBus } from './eventBus';

export function createKafkaEventBus(brokers: string[], clientId = 'ai-agentic-english'): EventBus {
  const kafka = new Kafka({ clientId, brokers });
  const producer: Producer = kafka.producer({ createPartitioner: Partitioners.LegacyPartitioner });
  let connecting: Promise<void> | null = null;

  function ensureConnected(): Promise<void> {
    connecting ??= producer.connect();
    return connecting;
  }

  return {
    async publish(topic: string, event: DomainEvent, key?: string): Promise<void> {
      await ensureConnected();
      await producer.send({
        topic,
        messages: [{ key, value: JSON.stringify(event) }],
      });
    },
  };
}
