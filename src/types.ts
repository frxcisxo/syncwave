/**
 * Core types for Syncwave distributed state management
 */

export interface StorageAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

export interface SyncConfig {
  url?: string;
  offline?: boolean;
  undoRedo?: boolean;
  persistenceAdapter?: StorageAdapter;
  persistenceKey?: string;
  maxHistorySize?: number;
  debounceMs?: number;
}

export interface EventMetadata {
  id: string;
  timestamp: number;
  clientId: string;
  sessionId: string;
  version: number;
  parentVersion?: number;
}

export interface StateEvent<T = any> {
  metadata: EventMetadata;
  type: 'set' | 'update' | 'delete' | 'merge' | 'undo' | 'redo';
  path: string;
  value?: T;
  previousValue?: T;
  operationId?: string;
}

export interface StateSnapshot<T = any> {
  data: T;
  version: number;
  timestamp: number;
  clientId: string;
}

export interface SyncMessage {
  type: 'init' | 'sync' | 'ack' | 'conflict' | 'heartbeat';
  clientId: string;
  events: StateEvent[];
  version: number;
  snapshot?: StateSnapshot;
}

export interface ConflictResolution<T = any> {
  local: T;
  remote: T;
  merged: T;
  strategy: 'local' | 'remote' | 'crdt' | 'manual';
  path?: string;
  timestamp?: number;
  localEventId?: string;
  remoteEventId?: string;
}

export type StateListener<T = any> = (newState: T, oldState: T) => void;
export type EventListener = (event: StateEvent) => void;
export type ConflictListener = (conflict: ConflictResolution) => void;
