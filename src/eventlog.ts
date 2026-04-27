import { StateEvent, EventMetadata } from './types';
import { deleteAtPath, deepClone, generateId, setAtPath } from './utils';

/**
 * EventLog: Immutable event history
 * 
 * Core responsibility:
 * - Store all state changes as immutable events
 * - Enable time-travel debugging
 * - Support event replay and state reconstruction
 * - Provide diffs between versions
 */
export class EventLog {
  private events: StateEvent[] = [];
  private eventIds = new Set<string>();
  private version: number = 0;
  private maxSize: number;
  private clientId: string;
  private sessionId: string;

  constructor(clientId: string, maxSize: number = 10000) {
    this.clientId = clientId;
    this.sessionId = generateId();
    this.maxSize = maxSize;
  }

  /**
   * Append a new event to the log
   * Returns the version number of this event
   */
  append(
    type: StateEvent['type'],
    path: string,
    value?: any,
    previousValue?: any,
    parentVersion?: number
  ): StateEvent {
    this.version++;

    const event: StateEvent = {
      metadata: {
        id: generateId(),
        timestamp: Date.now(),
        clientId: this.clientId,
        sessionId: this.sessionId,
        version: this.version,
        parentVersion: parentVersion ?? this.version - 1,
      },
      type,
      path,
      value,
      previousValue,
    };

    this.events.push(event);
    this.eventIds.add(event.metadata.id);

    // Keep log size bounded
    if (this.events.length > this.maxSize) {
      const removed = this.events.shift();
      if (removed) {
        this.eventIds.delete(removed.metadata.id);
      }
    }

    return event;
  }

  /**
   * Get all events from a specific version onwards
   */
  getSince(version: number): StateEvent[] {
    return this.events.filter((e) => e.metadata.version > version);
  }

  /**
   * Get the last N events
   */
  getRecent(count: number): StateEvent[] {
    return this.events.slice(-count);
  }

  /**
   * Get all events
   */
  getAll(): StateEvent[] {
    return [...this.events];
  }

  /**
   * Get event at specific version
   */
  getAtVersion(version: number): StateEvent | undefined {
    return this.events.find((e) => e.metadata.version === version);
  }

  /**
   * Replay events to reconstruct state from a given version
   */
  replay<T>(
    initialState: T,
    fromVersion: number = 0,
    toVersion?: number
  ): T {
    let state = deepClone(initialState);

    const relevantEvents = this.events.filter((e) => {
      const v = e.metadata.version;
      return v > fromVersion && (toVersion === undefined || v <= toVersion);
    });

    for (const event of relevantEvents) {
      state = this.applyEvent(state, event);
    }

    return state;
  }

  /**
   * Get diff between two versions
   */
  getDiff(fromVersion: number, toVersion: number): StateEvent[] {
    return this.events.filter(
      (e) => e.metadata.version > fromVersion && e.metadata.version <= toVersion
    );
  }

  /**
   * Get current version
   */
  getCurrentVersion(): number {
    return this.version;
  }

  /**
   * Get total event count
   */
  getEventCount(): number {
    return this.events.length;
  }

  /**
   * Clear all events (careful!)
   */
  clear(): void {
    this.events = [];
    this.eventIds.clear();
    this.version = 0;
  }

  /**
   * Export events for sync/persistence
   */
  export(): StateEvent[] {
    return [...this.events];
  }

  /**
   * Import events (merge with existing)
   */
  import(events: StateEvent[]): boolean {
    let added = false;

    for (const event of events) {
      if (!this.eventIds.has(event.metadata.id)) {
        this.events.push(event);
        this.eventIds.add(event.metadata.id);
        this.version = Math.max(this.version, event.metadata.version);
        added = true;
      }
    }

    if (!added) {
      return false;
    }

    // Total order for replay: timestamp first, then per-replica version (causal order),
    // then client id across replicas, then id for full determinism.
    this.events.sort((a, b) => {
      const dt = a.metadata.timestamp - b.metadata.timestamp;
      if (dt !== 0) return dt;
      const dv = a.metadata.version - b.metadata.version;
      if (dv !== 0) return dv;
      const dc = a.metadata.clientId.localeCompare(b.metadata.clientId);
      if (dc !== 0) return dc;
      return a.metadata.id.localeCompare(b.metadata.id);
    });

    // Monotonic versions 1..n so replay(), undo, and getVersion() stay consistent
    this.events.forEach((e, i) => {
      e.metadata.version = i + 1;
    });

    if (this.events.length > this.maxSize) {
      this.events = this.events.slice(-this.maxSize);
      this.eventIds = new Set(this.events.map((event) => event.metadata.id));
      this.events.forEach((e, i) => {
        e.metadata.version = i + 1;
      });
    }

    this.version = this.events.length;
    return true;
  }

  /**
   * Get metadata for event at path
   */
  getPathHistory(path: string): StateEvent[] {
    return this.events.filter((e) => e.path === path || e.path.startsWith(path + '.'));
  }

  /**
   * Internal: Apply single event to state
   */
  private applyEvent<T>(state: T, event: StateEvent): T {
    switch (event.type) {
      case 'set':
      case 'update':
      case 'redo':
        return setAtPath(state, event.path, event.value);
      case 'merge':
        return event.path === 'root'
          ? deepClone(event.value as T)
          : setAtPath(state, event.path, event.value);
      case 'delete':
        return deleteAtPath(state, event.path);
      case 'undo':
        return setAtPath(state, event.path, event.previousValue);
    }
  }
}
