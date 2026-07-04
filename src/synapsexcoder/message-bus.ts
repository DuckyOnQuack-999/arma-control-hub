/**
 * MessageBus - Inter-agent communication system
 * Enables loosely coupled messaging between agents in the SynapeXHelix system
 */

import { Message, MessageHandler } from './types';

export type { Message, MessageHandler };

export class MessageBus {
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private messageHistory: Message[] = [];
  private maxHistorySize: number;
  private subscriptions: Map<string, MessageHandler> = new Map();

  constructor(maxHistorySize: number = 1000) {
    this.maxHistorySize = maxHistorySize;
  }

  /**
   * Subscribe to messages of a specific type
   */
  subscribe(messageType: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(messageType)) {
      this.handlers.set(messageType, new Set());
    }
    this.handlers.get(messageType)!.add(handler);

    return () => {
      this.handlers.get(messageType)?.delete(handler);
    };
  }

  /**
   * Subscribe to all messages
   */
  subscribeAll(handler: MessageHandler): () => void {
    return this.subscribe('*', handler);
  }

  /**
   * Register a named subscription (can be unsubscribed by name)
   */
  register(subscriptionId: string, handler: MessageHandler): void {
    this.subscriptions.set(subscriptionId, handler);
  }

  /**
   * Unregister a named subscription
   */
  unregister(subscriptionId: string): boolean {
    return this.subscriptions.delete(subscriptionId);
  }

  /**
   * Publish a message to all subscribers
   */
  async publish(message: Message): Promise<void> {
    this.messageHistory.push(message);

    if (this.messageHistory.length > this.maxHistorySize) {
      this.messageHistory.shift();
    }

    const typeHandlers = this.handlers.get(message.type) || new Set();
    const wildcardHandlers = this.handlers.get('*') || new Set();
    const allHandlers = new Set([...typeHandlers, ...wildcardHandlers]);

    for (const handler of this.subscriptions.values()) {
      allHandlers.add(handler);
    }

    const promises: Promise<void>[] = [];

    for (const handler of allHandlers) {
      try {
        const result = handler(message);
        if (result instanceof Promise) {
          promises.push(result);
        }
      } catch (error) {
        console.error(`MessageBus handler error for ${message.type}:`, error);
      }
    }

    await Promise.all(promises);
  }

  /**
   * Create and publish a message in one call
   */
  async emit(
    type: Message['type'],
    payload: unknown,
    source: string,
    target?: string
  ): Promise<Message> {
    const message: Message = {
      id: this.generateId(),
      type,
      payload,
      timestamp: new Date(),
      source,
      target,
    };

    await this.publish(message);
    return message;
  }

  /**
   * Get message history
   */
  getHistory(filter?: {
    type?: string;
    source?: string;
    target?: string;
    since?: Date;
  }): Message[] {
    let history = [...this.messageHistory];

    if (filter) {
      if (filter.type) {
        history = history.filter((m) => m.type === filter.type);
      }
      if (filter.source) {
        history = history.filter((m) => m.source === filter.source);
      }
      if (filter.target) {
        history = history.filter((m) => m.target === filter.target);
      }
      if (filter.since) {
        history = history.filter((m) => m.timestamp >= filter.since);
      }
    }

    return history;
  }

  /**
   * Clear message history
   */
  clearHistory(): void {
    this.messageHistory = [];
  }

  /**
   * Get the number of active subscriptions
   */
  getSubscriptionCount(): number {
    let count = 0;
    this.handlers.forEach((handlers) => {
      count += handlers.size;
    });
    count += this.subscriptions.size;
    return count;
  }

  private generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

// Singleton instance for convenience
let defaultBus: MessageBus | null = null;

export function getMessageBus(): MessageBus {
  if (!defaultBus) {
    defaultBus = new MessageBus();
  }
  return defaultBus;
}

export function resetMessageBus(): void {
  defaultBus = null;
}
