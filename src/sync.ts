import { Store } from './store';
import {
  SyncManager,
  SyncManagerOptions,
} from './syncmanager';

export interface WebSocketSyncStatus {
  connection: 'connected' | 'connecting' | 'disconnected';
  queueSize: number;
  lastSyncVersion: number;
}

export type WebSocketSyncAdapterOptions = SyncManagerOptions;

export class WebSocketSyncAdapter<T extends Record<string, any>> {
  private manager: SyncManager;

  constructor(
    private store: Store<T>,
    private url: string,
    options: WebSocketSyncAdapterOptions = {}
  ) {
    this.manager = new SyncManager(store, url, options);
  }

  connect(): Promise<void> {
    return this.manager.connect();
  }

  disconnect(): void {
    this.manager.disconnect();
  }

  getStatus(): WebSocketSyncStatus {
    return {
      connection: this.manager.getStatus(),
      queueSize: this.manager.getQueueSize(),
      lastSyncVersion: this.manager.getLastSyncVersion(),
    };
  }

  getStore(): Store<T> {
    return this.store;
  }

  getUrl(): string {
    return this.url;
  }

  on(event: string, callback: (data: any) => void): () => void {
    return this.manager.on(event, callback);
  }
}

export function createWebSocketSyncAdapter<T extends Record<string, any>>(
  store: Store<T>,
  url: string,
  options?: WebSocketSyncAdapterOptions
): WebSocketSyncAdapter<T> {
  return new WebSocketSyncAdapter(store, url, options);
}
