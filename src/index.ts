/**
 * Syncwave - Distributed State Management with Real-time Sync
 * 
 * Features:
 * - Real-time multi-device state sync
 * - CRDT-based automatic conflict resolution
 * - Offline-first with automatic persistence
 * - Undo/Redo with time-travel debugging
 * - Full event sourcing & audit trails
 * 
 * @example
 * ```ts
 * import { createStore } from 'syncwave';
 * 
 * const store = createStore({
 *   todos: [],
 *   user: { name: 'Alice' }
 * }, {
 *   offline: true,
 *   undoRedo: true
 * });
 * 
 * // Subscribe to changes
 * store.subscribe((newState, oldState) => {
 *   console.log('State changed:', newState);
 * });
 * 
 * // Update state
 * store.set('user.name', 'Bob');
 * 
 * // Undo/Redo
 * store.undo();
 * store.redo();
 * 
 * // Get full history
 * const history = store.getHistory();
 * ```
 */

// Core
export { Store, createStore } from './store';
export { EventLog } from './eventlog';
export { CRDTResolver } from './crdt';
export { SyncManager } from './syncmanager';

// Server
export { SyncServer, createSyncServer } from './server';

// Storage adapters
export {
  IndexedDBAdapter,
  LocalStorageAdapter,
  AsyncStorageAdapter,
  MemoryAdapter,
} from './adapters';

// Types
export type {
  StorageAdapter,
  SyncConfig,
  EventMetadata,
  StateEvent,
  StateSnapshot,
  SyncMessage,
  ConflictResolution,
  StateListener,
  EventListener,
  ConflictListener,
} from './types';

// Utilities
export {
  generateId,
  deepClone,
  deepMerge,
  deepEqual,
  getAtPath,
  setAtPath,
  deleteAtPath,
  debounce,
  Observable,
  generateSessionId,
} from './utils';
