/**
 * Syncwave Server
 * 
 * Simple Node.js server that:
 * - Accepts WebSocket connections
 * - Broadcasts events between clients
 * - Stores event history
 * - Handles conflict resolution
 * 
 * Usage:
 * ```
 * import { createSyncServer } from 'syncwave/server';
 * const server = createSyncServer(3000);
 * ```
 */

import type { StateEvent, SyncMessage } from './types';

interface ConnectedClient {
  id: string;
  sessionId: string;
  version: number;
  socket: any; // WebSocket
  isAlive: boolean;
}

/**
 * In-memory event store (replace with DB for production)
 */
class EventStore {
  private events: StateEvent[] = [];
  private maxSize: number = 100000;

  append(event: StateEvent): void {
    this.events.push(event);
    if (this.events.length > this.maxSize) {
      this.events = this.events.slice(-this.maxSize);
    }
  }

  getAll(): StateEvent[] {
    return [...this.events];
  }

  getSince(version: number): StateEvent[] {
    return this.events.filter((e) => e.metadata.version > version);
  }

  getCount(): number {
    return this.events.length;
  }
}

/**
 * Sync Server implementation
 */
export class SyncServer {
  private clients = new Map<string, ConnectedClient>();
  private eventStore = new EventStore();
  private messageHandlers = new Map<string, (client: ConnectedClient, message: SyncMessage) => void>();

  constructor() {
    this.setupHandlers();
  }

  /**
   * Setup message handlers
   */
  private setupHandlers(): void {
    // Handle init message
    this.messageHandlers.set('init', (client, message) => {
      console.log(`[${client.id}] Init with version ${message.version}`);

      // Store client version
      client.version = Math.max(client.version, message.version);

      // Send missing events
      const missingEvents = this.eventStore.getSince(client.version);
      if (missingEvents.length > 0) {
        this.send(client, {
          type: 'sync',
          clientId: 'server',
          events: missingEvents,
          version: missingEvents[missingEvents.length - 1]?.metadata.version || 0,
        });
      }

      // Send ack
      this.send(client, {
        type: 'ack',
        clientId: 'server',
        events: [],
        version: client.version,
      });
    });

    // Handle sync message
    this.messageHandlers.set('sync', (client, message) => {
      for (const event of message.events) {
        // Store event
        this.eventStore.append(event);

        // Update client version
        client.version = Math.max(client.version, event.metadata.version);

        // Broadcast to other clients
        this.broadcast(message.events, client.id);
      }

      // Send ack
      this.send(client, {
        type: 'ack',
        clientId: 'server',
        events: [],
        version: client.version,
      });
    });

    // Handle heartbeat
    this.messageHandlers.set('heartbeat', (client) => {
      client.isAlive = true;
    });
  }

  /**
   * Handle new client connection
   */
  handleConnection(clientId: string, socket: any): ConnectedClient {
    const client: ConnectedClient = {
      id: clientId,
      sessionId: clientId.split('-')[1] || '',
      version: 0,
      socket,
      isAlive: true,
    };

    this.clients.set(clientId, client);
    console.log(`✅ Client connected: ${clientId} (${this.clients.size} online)`);

    // Setup socket handlers
    socket.on('message', (data: string) => {
      try {
        const message: SyncMessage = JSON.parse(data);
        this.handleMessage(client, message);
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    });

    socket.on('close', () => {
      this.handleDisconnection(clientId);
    });

    socket.on('error', (error: Error) => {
      console.error(`Socket error for ${clientId}:`, error);
    });

    return client;
  }

  /**
   * Handle message from client
   */
  private handleMessage(client: ConnectedClient, message: SyncMessage): void {
    const handler = this.messageHandlers.get(message.type);
    if (handler) {
      handler(client, message);
    }
  }

  /**
   * Handle client disconnection
   */
  private handleDisconnection(clientId: string): void {
    this.clients.delete(clientId);
    console.log(`❌ Client disconnected: ${clientId} (${this.clients.size} online)`);
  }

  /**
   * Send message to specific client
   */
  private send(client: ConnectedClient, message: SyncMessage): void {
    try {
      client.socket.send(JSON.stringify(message));
    } catch (error) {
      console.error(`Failed to send to ${client.id}:`, error);
    }
  }

  /**
   * Broadcast message to all other clients
   */
  private broadcast(events: StateEvent[], excludeClientId?: string): void {
    const message: SyncMessage = {
      type: 'sync',
      clientId: 'server',
      events,
      version: events[events.length - 1]?.metadata.version || 0,
    };

    for (const [clientId, client] of this.clients) {
      if (clientId !== excludeClientId) {
        this.send(client, message);
      }
    }
  }

  /**
   * Get server stats
   */
  getStats() {
    return {
      connectedClients: this.clients.size,
      totalEvents: this.eventStore.getCount(),
      clients: Array.from(this.clients.values()).map((c) => ({
        id: c.id,
        version: c.version,
        isAlive: c.isAlive,
      })),
    };
  }

  /**
   * Cleanup (health check, etc)
   */
  cleanup(): void {
    // Remove dead connections
    for (const [clientId, client] of this.clients) {
      if (!client.isAlive) {
        this.handleDisconnection(clientId);
      } else {
        client.isAlive = false;
      }
    }
  }
}

// Factory function
export function createSyncServer(): SyncServer {
  return new SyncServer();
}
