import { EventLog } from './eventlog';
import { CRDTResolver } from './crdt';
import {
  SyncConfig,
  StateListener,
  EventListener,
  ConflictListener,
  StateSnapshot,
  StorageAdapter,
  StateEvent,
} from './types';
import {
  generateId,
  deepClone,
  deepMerge,
  deepEqual,
  setAtPath,
  deleteAtPath,
  getAtPath,
  Observable,
} from './utils';

/** Sync options with defaults applied; persistence remains optional. */
type ResolvedSyncConfig = Required<Omit<SyncConfig, 'persistenceAdapter'>> & {
  persistenceAdapter?: StorageAdapter;
};

/**
 * Syncwave Store
 * 
 * Main API for distributed state management
 * 
 * Features:
 * - Real-time sync across devices
 * - Offline-first with automatic persistence
 * - CRDT-based conflict resolution
 * - Undo/Redo
 * - Event sourcing
 */
export class Store<T extends Record<string, any>> {
  private state: T;
  private initialState: T;
  /** Event log for replay / time travel (see README). */
  readonly eventLog: EventLog;
  private config: ResolvedSyncConfig;
  private clientId: string;
  private stateListeners = new Set<StateListener<T>>();
  private eventListeners = new Set<EventListener>();
  private conflictListeners = new Set<ConflictListener>();
  private stateObservable: Observable<T>;
  private undoStack: number[] = [];
  private redoStack: number[] = [];
  private persistenceAdapter?: StorageAdapter;
  private isSyncing = false;
  private version = 0;

  constructor(initialState: T, config?: SyncConfig) {
    this.initialState = deepClone(initialState);
    this.state = deepClone(initialState);
    this.clientId = `client-${generateId()}`;
    this.stateObservable = new Observable();

    // Merge config with defaults
    this.config = {
      url: config?.url || '',
      offline: config?.offline ?? true,
      undoRedo: config?.undoRedo ?? true,
      persistenceAdapter: config?.persistenceAdapter || undefined,
      maxHistorySize: config?.maxHistorySize || 10000,
      debounceMs: config?.debounceMs || 100,
    };

    this.eventLog = new EventLog(this.clientId, this.config.maxHistorySize);
    this.persistenceAdapter = this.config.persistenceAdapter;

    // Load from persistence if available
    if (this.persistenceAdapter) {
      this.loadFromPersistence();
    }
  }

  /**
   * Get current state
   */
  getState(): T {
    return deepClone(this.state);
  }

  /**
   * Get specific value from state at path
   */
  getValue<V = any>(path: string): V {
    return getAtPath(this.state, path);
  }

  /**
   * Set state with deep merge (README: alias of {@link merge})
   */
  setState(updates: Partial<T>): void {
    this.merge(updates);
  }

  /**
   * Update a specific value at path
   */
  set<V = any>(path: string, value: V): void {
    const previousValue = getAtPath(this.state, path);
    const newState = setAtPath(this.state, path, value);

    if (deepEqual(this.state, newState)) {
      return;
    }

    const previousState = this.state;
    this.state = newState;
    this.version++;

    const event = this.eventLog.append(
      'set',
      path,
      value,
      previousValue,
      this.version - 1
    );

    if (this.config.undoRedo) {
      this.undoStack.push(event.metadata.version);
      this.redoStack = [];
    }

    this.notifyStateListeners(newState, previousState);
    this.notifyEventListeners(event);
    this.persistState();
  }

  /**
   * Delete a value at path
   */
  delete(path: string): void {
    const previousValue = getAtPath(this.state, path);
    const newState = deleteAtPath(this.state, path);

    if (deepEqual(this.state, newState)) {
      return;
    }

    const previousState = this.state;
    this.state = newState;
    this.version++;

    const event = this.eventLog.append(
      'delete',
      path,
      undefined,
      previousValue,
      this.version - 1
    );

    if (this.config.undoRedo) {
      this.undoStack.push(event.metadata.version);
      this.redoStack = [];
    }

    this.notifyStateListeners(newState, previousState);
    this.notifyEventListeners(event);
    this.persistState();
  }

  /**
   * Merge updates into state
   */
  merge(updates: Partial<T>): void {
    const previousState = deepClone(this.state);
    const newState = deepMerge(this.state, updates);

    if (deepEqual(previousState, newState)) {
      return;
    }

    this.state = newState;
    this.version++;

    const event = this.eventLog.append(
      'merge',
      'root',
      newState,
      previousState,
      this.version - 1
    );

    this.notifyStateListeners(newState, previousState);
    this.notifyEventListeners(event);
    this.persistState();
  }

  /**
   * Undo last operation
   */
  undo(): void {
    if (!this.config.undoRedo || this.undoStack.length === 0) {
      return;
    }

    const lastEventVersion = this.undoStack.pop()!;
    const previousState = deepClone(this.state);

    // Replay from initial state up through the event before the one we undo
    this.state = this.eventLog.replay(
      this.initialState,
      -1,
      lastEventVersion - 1
    );
    this.version = lastEventVersion - 1;
    this.redoStack.push(lastEventVersion);

    this.notifyStateListeners(this.state, previousState);
    this.persistState();
  }

  /**
   * Redo last undone operation
   */
  redo(): void {
    if (!this.config.undoRedo || this.redoStack.length === 0) {
      return;
    }

    const versionToApply = this.redoStack.pop()!;
    const previousState = deepClone(this.state);

    this.state = this.eventLog.replay(
      this.initialState,
      -1,
      versionToApply
    );
    this.version = versionToApply;
    this.undoStack.push(versionToApply);

    this.notifyStateListeners(this.state, previousState);
    this.persistState();
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: StateListener<T>): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  /**
   * Subscribe to all events
   */
  onEvent(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /**
   * Subscribe to conflicts
   */
  onConflict(listener: ConflictListener): () => void {
    this.conflictListeners.add(listener);
    return () => this.conflictListeners.delete(listener);
  }

  /**
   * Get event history
   */
  getHistory(): StateEvent[] {
    return this.eventLog.getAll();
  }

  /**
   * Get history for a specific path
   */
  getPathHistory(path: string): StateEvent[] {
    return this.eventLog.getPathHistory(path);
  }

  /**
   * Get current version
   */
  getVersion(): number {
    return this.version;
  }

  /**
   * Get snapshot of current state
   */
  getSnapshot(): StateSnapshot<T> {
    return {
      data: deepClone(this.state),
      version: this.version,
      timestamp: Date.now(),
      clientId: this.clientId,
    };
  }

  /**
   * Reset to initial state
   */
  reset(): void {
    const previousState = deepClone(this.state);
    this.state = deepClone(this.initialState);
    this.version = 0;
    this.eventLog.clear();
    this.undoStack = [];
    this.redoStack = [];

    this.notifyStateListeners(this.state, previousState);
    this.persistState();
  }

  /**
   * Import external events (for sync)
   */
  importEvents(events: StateEvent[]): void {
    const previousState = deepClone(this.state);
    const localLogBeforeMerge = this.eventLog.getAll();

    for (const incoming of events) {
      if (incoming.type !== 'set') continue;
      if (incoming.metadata.clientId === this.clientId) continue;

      const localOnPath = [...localLogBeforeMerge]
        .reverse()
        .find((e) => e.path === incoming.path && e.type === 'set');
      if (!localOnPath) continue;
      if (deepEqual(localOnPath.value, incoming.value)) continue;

      this.notifyConflictListeners(
        CRDTResolver.resolve(
          localOnPath.value,
          incoming.value,
          localOnPath,
          incoming
        )
      );
    }

    this.eventLog.import(events);

    // Replay entire history; remote merge invalidates linear undo stacks
    this.undoStack = [];
    this.redoStack = [];
    this.state = this.eventLog.replay(this.initialState, -1);
    this.version = this.eventLog.getCurrentVersion();

    if (!deepEqual(previousState, this.state)) {
      this.notifyStateListeners(this.state, previousState);
      this.persistState();
    }
  }

  /**
   * Get client ID
   */
  getClientId(): string {
    return this.clientId;
  }

  /**
   * Get size of event log
   */
  getLogSize(): number {
    return this.eventLog.getEventCount();
  }

  // Private methods

  private notifyStateListeners(newState: T, oldState: T): void {
    this.stateListeners.forEach((listener) => {
      try {
        listener(newState, oldState);
      } catch (error) {
        console.error('Error in state listener:', error);
      }
    });
    this.stateObservable.emit(newState);
  }

  private notifyEventListeners(event: StateEvent): void {
    this.eventListeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in event listener:', error);
      }
    });
  }

  private notifyConflictListeners(conflict: any): void {
    this.conflictListeners.forEach((listener) => {
      try {
        listener(conflict);
      } catch (error) {
        console.error('Error in conflict listener:', error);
      }
    });
  }

  private async persistState(): Promise<void> {
    if (!this.persistenceAdapter) return;

    try {
      const snapshot = this.getSnapshot();
      const events = this.eventLog.export();
      const data = {
        snapshot,
        events,
        version: this.version,
      };

      await this.persistenceAdapter.set(
        `syncwave:${this.clientId}`,
        JSON.stringify(data)
      );
    } catch (error) {
      console.error('Error persisting state:', error);
    }
  }

  private async loadFromPersistence(): Promise<void> {
    if (!this.persistenceAdapter) return;

    try {
      const data = await this.persistenceAdapter.get(`syncwave:${this.clientId}`);
      if (!data) return;

      const { snapshot, events, version } = JSON.parse(data);
      this.state = snapshot.data;
      this.version = version;
      this.eventLog.import(events);
    } catch (error) {
      console.error('Error loading from persistence:', error);
    }
  }
}

// Factory function for easier creation
export function createStore<T extends Record<string, any>>(
  initialState: T,
  config?: SyncConfig
): Store<T> {
  return new Store(initialState, config);
}
