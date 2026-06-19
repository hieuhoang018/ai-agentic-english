import { Kafka } from 'kafkajs';
import { DomainEvent } from './eventBus';

export interface KafkaConsumerOptions {
  brokers: string[];
  groupId: string;
  topics: string[];
  onMessage: (topic: string, event: DomainEvent) => Promise<void>;
  clientId?: string;
}

export interface KafkaConsumerHandle {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function createKafkaConsumer(options: KafkaConsumerOptions): KafkaConsumerHandle {
  const kafka = new Kafka({ clientId: options.clientId ?? options.groupId, brokers: options.brokers });
  const consumer = kafka.consumer({ groupId: options.groupId });

  return {
    async start(): Promise<void> {
      await consumer.connect();
      await Promise.all(options.topics.map((topic) => consumer.subscribe({ topic })));
      await consumer.run({
        eachMessage: async ({ topic, message }) => {
          if (!message.value) return;
          const event = JSON.parse(message.value.toString()) as DomainEvent;
          await options.onMessage(topic, event);
        },
      });
    },
    async stop(): Promise<void> {
      await consumer.disconnect();
    },
  };
}
