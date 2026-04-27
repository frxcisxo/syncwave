import { Store } from './store';
import { StateEvent, SyncMessage } from './types';
import { generateId } from './utils';

export interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onerror: ((error: Event | Error) => void) | null;
  onclose: (() => void) | null;
}

export interface SyncMessageCodec {
  encode(message: SyncMessage): string | Promise<string>;
  decode(payload: string): SyncMessage | Promise<SyncMessage>;
}

export interface SyncManagerOptions {
  createSocket?: (url: string) => WebSocketLike;
  codec?: SyncMessageCodec;
  autoReconnect?: boolean;
  heartbeatIntervalMs?: number;
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  maxReconnectAttempts?: number;
}

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
  private static readonly OPEN = 1;
  private store: Store<any>;
  private serverUrl: string;
  private socket: WebSocketLike | null = null;
  private clientId: string;
  private sessionId: string;
  private lastSyncVersion: number = 0;
  private messageQueue: StateEvent[] = [];
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number;
  private reconnectDelay: number;
  private maxReconnectDelay: number;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isConnecting: boolean = false;
  private listeners = new Map<string, Set<(data: any) => void>>();
  private createSocket: (url: string) => WebSocketLike;
  private codec: SyncMessageCodec;
  private autoReconnect: boolean;
  private heartbeatIntervalMs: number;

  constructor(store: Store<any>, serverUrl: string, options: SyncManagerOptions = {}) {
    this.store = store;
    this.serverUrl = serverUrl;
    this.clientId = store.getClientId();
    this.sessionId = generateId();
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 10;
    this.reconnectDelay = options.reconnectDelayMs ?? 1000;
    this.maxReconnectDelay = options.maxReconnectDelayMs ?? 30000;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 30000;
    this.autoReconnect = options.autoReconnect ?? true;
    this.createSocket =
      options.createSocket ??
      ((url) => new WebSocket(url) as unknown as WebSocketLike);
    this.codec = options.codec ?? {
      encode: (message) => JSON.stringify(message),
      decode: (payload) => JSON.parse(payload) as SyncMessage,
    };

    // Subscribe to local events
    this.store.onEvent((event) => {
      this.onLocalEvent(event);
    });
  }

  /**
   * Connect to sync server
   */
  async connect(): Promise<void> {
    if (this.isConnecting || this.socket?.readyState === SyncManager.OPEN) {
      return;
    }

    this.isConnecting = true;

    try {
      this.socket = this.createSocket(this.serverUrl);

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
      this.reconnectDelay = this.reconnectDelay || 1000;
      this.isConnecting = false;
    } catch (error) {
      this.isConnecting = false;
      console.error('Failed to connect:', error);
      if (this.autoReconnect) {
        this.scheduleReconnect();
      }
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

    void this.dispatch({
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
  private async dispatch(message: SyncMessage): Promise<void> {
    if (this.isConnected()) {
      try {
        const payload = await this.codec.encode(message);
        this.socket!.send(payload);
      } catch (error) {
        console.error('Failed to encode sync message:', error);
      }
    } else if (message.type === 'sync') {
      this.messageQueue.push(...message.events);
    }
  }

  /**
   * WebSocket event handlers
   */
  private onOpen(): void {
    console.log('✅ Connected to sync server');

    // Send init message
    void this.dispatch({
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
        void this.dispatch({
          type: 'heartbeat',
          clientId: this.clientId,
          events: [],
          version: this.store.getVersion(),
        });
      }
    }, this.heartbeatIntervalMs);

    // Flush queued messages
    this.flushQueue();

    this.emit('connected');
  }

  private async onMessage(event: { data: string }): Promise<void> {
    try {
      const message = await this.codec.decode(event.data);

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

  private onError(error: Event | Error): void {
    console.error('WebSocket error:', error);
    this.emit('error', error);
  }

  private onClose(): void {
    console.log('❌ Disconnected from sync server');
    this.heartbeatInterval && clearInterval(this.heartbeatInterval);
    this.emit('disconnected');
    if (this.autoReconnect) {
      this.scheduleReconnect();
    }
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
    void this.dispatch({
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
    return this.socket?.readyState === SyncManager.OPEN;
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

  getLastSyncVersion(): number {
    return this.lastSyncVersion;
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
