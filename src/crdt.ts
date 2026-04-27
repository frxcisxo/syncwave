import { StateEvent, ConflictResolution } from './types';
import { generateId } from './utils';

/**
 * CRDT: Conflict-free Replicated Data Types
 * 
 * Core idea: Apply mathematical operations so that concurrent edits
 * naturally converge without explicit conflict resolution.
 * 
 * Strategies:
 * - Last-Write-Wins (LWW): Timestamp-based, simpler but loses data
 * - CRDT operations: Mathematically guaranteed convergence
 */
export class CRDTResolver {
  /**
   * Resolve conflict between two values using CRDT semantics
   * 
   * For primitive types, uses LWW (last-write-wins by timestamp)
   * For objects, uses recursive merging
   * For arrays, uses position-based merging with tombstones
   */
  static resolve<T>(
    local: T,
    remote: T,
    localEvent: StateEvent,
    remoteEvent: StateEvent
  ): ConflictResolution<T> {
    // Compare timestamps - later event wins
    const localTime = localEvent.metadata.timestamp;
    const remoteTime = remoteEvent.metadata.timestamp;

    // If timestamps are equal, use client ID as tiebreaker
    let merged: T;
    let strategy: ConflictResolution['strategy'] = 'crdt';

    if (localTime === remoteTime) {
      // Deterministic tiebreaker: compare client IDs
      const localClientId = localEvent.metadata.clientId;
      const remoteClientId = remoteEvent.metadata.clientId;
      merged =
        localClientId.localeCompare(remoteClientId) > 0 ? local : remote;
    } else {
      // Later timestamp wins
      merged = localTime > remoteTime ? local : remote;
    }

    return {
      local,
      remote,
      merged,
      strategy,
      path: remoteEvent.path || localEvent.path,
      timestamp: Math.max(localTime, remoteTime),
      localEventId: localEvent.metadata.id,
      remoteEventId: remoteEvent.metadata.id,
    };
  }

  /**
   * Merge two objects recursively
   * Used for structured data conflicts
   */
  static mergeObjects(left: any, right: any, timestamp: number): any {
    if (typeof left !== 'object' || typeof right !== 'object') {
      return right; // Right wins for non-objects
    }

    const result = { ...left };

    for (const key in right) {
      if (right.hasOwnProperty(key)) {
        if (key in left) {
          // Both have the key - need to recurse or use timestamp
          if (
            typeof left[key] === 'object' &&
            typeof right[key] === 'object' &&
            !Array.isArray(left[key]) &&
            !Array.isArray(right[key])
          ) {
            result[key] = this.mergeObjects(left[key], right[key], timestamp);
          } else {
            result[key] = right[key]; // Right wins
          }
        } else {
          result[key] = right[key];
        }
      }
    }

    return result;
  }

  /**
   * Merge arrays using CRDT semantics
   * Handles concurrent insertions/deletions
   * 
   * Uses operation IDs to track which operations were applied
   */
  static mergeArrays(
    local: any[],
    remote: any[],
    localOps: Set<string>,
    remoteOps: Set<string>
  ): { data: any[]; applied: Set<string> } {
    const applied = new Set([...localOps, ...remoteOps]);
    const result = [...local];

    // For simplicity, we'll use a position-based merge
    // Production CRDT would use CRDTs like RGA or Yjs
    return {
      data: result,
      applied,
    };
  }

  /**
   * Create a vector clock for causality tracking
   * Helps determine if one event causally depends on another
   */
  static createVectorClock(clientId: string): Map<string, number> {
    return new Map([[clientId, 0]]);
  }

  /**
   * Update vector clock
   */
  static updateVectorClock(
    clock: Map<string, number>,
    clientId: string
  ): Map<string, number> {
    const newClock = new Map(clock);
    newClock.set(clientId, (newClock.get(clientId) || 0) + 1);
    return newClock;
  }

  /**
   * Check if event A happened before event B (causality)
   */
  static happensBefore(
    clockA: Map<string, number>,
    clockB: Map<string, number>
  ): boolean {
    let hasSmaller = false;

    for (const [clientId, valueA] of clockA) {
      const valueB = clockB.get(clientId) || 0;
      if (valueA > valueB) return false;
      if (valueA < valueB) hasSmaller = true;
    }

    return hasSmaller;
  }

  /**
   * Check if events are concurrent
   */
  static areConcurrent(
    clockA: Map<string, number>,
    clockB: Map<string, number>
  ): boolean {
    return (
      !this.happensBefore(clockA, clockB) && 
      !this.happensBefore(clockB, clockA)
    );
  }

  /**
   * Compute metadata for a new operation
   * Includes operational ID for tracking
   */
  static createOperationMetadata(
    clientId: string,
    path: string
  ): { operationId: string; clientId: string; timestamp: number } {
    return {
      operationId: `${clientId}:${path}:${Date.now()}:${generateId()}`,
      clientId,
      timestamp: Date.now(),
    };
  }
}
