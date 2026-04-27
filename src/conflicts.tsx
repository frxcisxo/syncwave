import { useEffect, useState } from 'react';
import { Store } from './store';
import { ConflictResolution } from './types';
import { generateId } from './utils';

export interface ConflictRecord {
  id: string;
  createdAt: number;
  resolution: ConflictResolution;
}

export class ConflictMonitor<T extends Record<string, any>> {
  private conflicts: ConflictRecord[] = [];
  private listeners = new Set<(conflicts: ConflictRecord[]) => void>();
  private unsubscribe: () => void;

  constructor(store: Store<T>, private limit: number = 50) {
    this.unsubscribe = store.onConflict((resolution) => {
      const record: ConflictRecord = {
        id: generateId(),
        createdAt: Date.now(),
        resolution,
      };

      this.conflicts = [record, ...this.conflicts].slice(0, this.limit);
      this.emit();
    });
  }

  getConflicts(): ConflictRecord[] {
    return [...this.conflicts];
  }

  clear(): void {
    this.conflicts = [];
    this.emit();
  }

  subscribe(listener: (conflicts: ConflictRecord[]) => void): () => void {
    this.listeners.add(listener);
    listener(this.getConflicts());
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.unsubscribe();
    this.listeners.clear();
  }

  private emit(): void {
    const snapshot = this.getConflicts();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

export function useConflictFeed<T extends Record<string, any>>(
  store: Store<T>,
  limit: number = 50
): ConflictRecord[] {
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([]);

  useEffect(() => {
    const monitor = new ConflictMonitor(store, limit);
    const unsubscribe = monitor.subscribe(setConflicts);

    return () => {
      unsubscribe();
      monitor.dispose();
    };
  }, [store, limit]);

  return conflicts;
}

export interface ConflictListProps<T extends Record<string, any>> {
  store: Store<T>;
  limit?: number;
  emptyMessage?: string;
}

function renderValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function ConflictList<T extends Record<string, any>>({
  store,
  limit = 50,
  emptyMessage = 'No conflicts detected.',
}: ConflictListProps<T>) {
  const conflicts = useConflictFeed(store, limit);

  if (conflicts.length === 0) {
    return <p>{emptyMessage}</p>;
  }

  return (
    <section>
      <h2>Conflict Timeline</h2>
      {conflicts.map((conflict) => (
        <article key={conflict.id}>
          <strong>{conflict.resolution.path ?? 'root'}</strong>
          <p>
            {renderValue(conflict.resolution.local)} vs{' '}
            {renderValue(conflict.resolution.remote)} {'->'}{' '}
            {renderValue(conflict.resolution.merged)}
          </p>
        </article>
      ))}
    </section>
  );
}
