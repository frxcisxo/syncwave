import { Store } from './store';
import { StateEvent, SyncMessage } from './types';
import { debounce, generateId } from './utils';

/**
 * SyncManager: Real-time WebSocket sync
 * 
 * Handles:
 * - WebSocket connection management
 * - Event broadcasting to server
 * - Remote event ingestion
 * - Delta compression (only send diffs)
 * - Reconnection with backoff
 * - Message queuing during offline
 */
export class SyncManager {
  private store: Store<any>;
  private serverUrl: string;
  private socket: WebSocket | null = null;
  private clientId: string;
  private sessionId: string;
  private lastSyncVersion: number = 0;
  private messageQueue: StateEvent[] = [];
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectDelay: number = 1000; // Start at 1s
  private maxReconnectDelay: number = 30000; // Max 30s
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isConnecting: boolean = false;
  private listeners = new Map<string, Set<(data: any) => void>>();

  constructor(store: Store<any>, serverUrl: string) {
    this.store = store;
    this.serverUrl = serverUrl;
    this.clientId = store.getClientId();
    this.sessionId = generateId();

    // Subscribe to local events
    this.store.onEvent((event) => {
      this.onLocalEvent(event);
    });
  }

  /**
   * Connect to sync server
   */
  async connect(): Promise<void> {
    if (this.isConnecting || this.socket?.readyState === WebSocket.OPEN) {
      return;
    }

    this.isConnecting = true;

    try {
      this.socket = new WebSocket(this.serverUrl);

      this.socket.onopen = () => this.onOpen();
      this.socket.onmessage = (event) => this.onMessage(event);
      this.socket.onerror = (error) => this.onError(error);
      this.socket.onclose = () => this.onClose();

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 5000);

        const checkConnection = () => {
          if (this.socket?.readyState === WebSocket.OPEN) {
            clearTimeout(timeout);
            resolve(undefined);
          } else {
            setTimeout(checkConnection, 100);
          }
        };

        checkConnection();
      });

      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000;
      this.isConnecting = false;
    } catch (error) {
      this.isConnecting = false;
      console.error('Failed to connect:', error);
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  /**
   * Send event to server (with delta compression)
   */
  private onLocalEvent(event: StateEvent): void {
    if (!this.isConnected()) {
      this.messageQueue.push(event);
      return;
    }

    this.send({
      type: 'sync',
      clientId: this.clientId,
      events: [event],
      version: this.store.getVersion(),
    });
  }

  /**
   * Handle incoming events from other clients
   */
  private onRemoteEvents(events: StateEvent[]): void {
    this.store.importEvents(events);
    this.lastSyncVersion = Math.max(
      this.lastSyncVersion,
      ...events.map((e) => e.metadata.version)
    );
  }

  /**
   * Send message to server
   */
  private send(message: SyncMessage): void {
    if (this.isConnected()) {
      this.socket!.send(JSON.stringify(message));
    } else {
      this.messageQueue.push(...message.events);
    }
  }

  /**
   * WebSocket event handlers
   */
  private onOpen(): void {
    console.log('✅ Connected to sync server');

    // Send init message
    this.send({
      type: 'init',
      clientId: this.clientId,
      events: this.store.getHistory().slice(this.lastSyncVersion),
      version: this.store.getVersion(),
      snapshot: this.store.getSnapshot(),
    });

    // Setup heartbeat
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected()) {
        this.send({
          type: 'heartbeat',
          clientId: this.clientId,
          events: [],
          version: this.store.getVersion(),
        });
      }
    }, 30000);

    // Flush queued messages
    this.flushQueue();

    this.emit('connected');
  }

  private onMessage(event: MessageEvent<any>): void {
    try {
      const message: SyncMessage = JSON.parse(event.data);

      switch (message.type) {
        case 'sync':
          this.onRemoteEvents(message.events);
          this.emit('sync', message.events);
          break;

        case 'init':
          if (message.snapshot) {
            // Server sent full state (might be newer)
            if (message.snapshot.version > this.store.getVersion()) {
              this.store.importEvents(message.events);
            }
          }
          break;

        case 'ack':
          this.emit('ack', message);
          break;

        case 'conflict':
          this.emit('conflict', message);
          break;
      }
    } catch (error) {
      console.error('Failed to parse message:', error);
    }
  }

  private onError(error: Event): void {
    console.error('WebSocket error:', error);
    this.emit('error', error);
  }

  private onClose(): void {
    console.log('❌ Disconnected from sync server');
    this.heartbeatInterval && clearInterval(this.heartbeatInterval);
    this.emit('disconnected');
    this.scheduleReconnect();
  }

  /**
   * Reconnect with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnect attempts reached');
      this.emit('maxReconnectAttemptsReached');
      return;
    }

    const delay = Math.min(
      this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts),
      this.maxReconnectDelay
    );

    console.log(`Reconnecting in ${Math.round(delay)}ms...`);
    setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  /**
   * Flush queued messages when reconnected
   */
  private flushQueue(): void {
    if (this.messageQueue.length === 0) return;

    console.log(`📤 Flushing ${this.messageQueue.length} queued events`);

    const batch = this.messageQueue.splice(0, 100); // Send in batches
    this.send({
      type: 'sync',
      clientId: this.clientId,
      events: batch,
      version: this.store.getVersion(),
    });

    if (this.messageQueue.length > 0) {
      setTimeout(() => this.flushQueue(), 100);
    }
  }

  /**
   * Check connection status
   */
  private isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  /**
   * Get connection status
   */
  getStatus(): 'connected' | 'connecting' | 'disconnected' {
    if (this.isConnecting) return 'connecting';
    if (this.isConnected()) return 'connected';
    return 'disconnected';
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.messageQueue.length;
  }

  /**
   * Event emitter pattern
   */
  on(event: string, callback: (data: any) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    return () => {
      this.listeners.get(event)!.delete(callback);
    };
  }

  private emit(event: string, data?: any): void {
    this.listeners.get(event)?.forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in ${event} listener:`, error);
      }
    });
  }
}
