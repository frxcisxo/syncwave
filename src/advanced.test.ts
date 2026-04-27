import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createStore, EventLog, CRDTResolver } from '../src/index';
import { MemoryAdapter } from '../src/adapters';

describe('Syncwave - Advanced Features', () => {
  describe('Persistence', () => {
    it('should persist state to adapter', async () => {
      const adapter = new MemoryAdapter();
      const store = createStore(
        { count: 0, name: 'test' },
        { persistenceAdapter: adapter }
      );

      store.set('count', 42);
      await new Promise((r) => setTimeout(r, 100));

      const stored = await adapter.get('syncwave:default');
      expect(stored).toBeTruthy();

      const data = JSON.parse(stored!);
      expect(data.snapshot.data.count).toBe(42);
    });

    it('should load state from adapter on init when using the same persistence key', async () => {
      const adapter = new MemoryAdapter();
      const store1 = createStore(
        { count: 0 },
        { persistenceAdapter: adapter }
      );

      store1.set('count', 100);
      await new Promise((r) => setTimeout(r, 100));

      const store2 = createStore(
        { count: 0 },
        { persistenceAdapter: adapter }
      );

      await store2.whenReady();

      expect(store2.getState().count).toBe(100);
    });
  });

  describe('Event Merging', () => {
    it('should merge events from multiple sources', () => {
      const store = createStore({ count: 0, data: '' });

      store.set('count', 1);
      store.set('data', 'hello');
      store.set('count', 2);

      const history = store.getHistory();
      expect(history.length).toBe(3);
      expect(store.getValue('count')).toBe(2);
      expect(store.getValue('data')).toBe('hello');
    });

    it('should maintain causality with vector clocks', () => {
      const eventLog = new EventLog('client-1');

      eventLog.append('set', 'a', 1);
      eventLog.append('set', 'b', 2);
      eventLog.append('set', 'c', 3);

      const events = eventLog.getAll();
      expect(events[0].metadata.version).toBe(1);
      expect(events[1].metadata.version).toBe(2);
      expect(events[2].metadata.version).toBe(3);
    });
  });

  describe('Snapshot Management', () => {
    it('should create valid snapshots', () => {
      const store = createStore({ todos: [], count: 0 });

      store.set('count', 10);
      store.set('todos', [{ id: 1, text: 'Task' }]);

      const snapshot = store.getSnapshot();

      expect(snapshot.data.count).toBe(10);
      expect(snapshot.data.todos.length).toBe(1);
      expect(snapshot.timestamp).toBeGreaterThan(0);
      expect(snapshot.clientId).toBeTruthy();
    });
  });

  describe('Conflict Resolution Scenarios', () => {
    it('should resolve last-write-wins conflicts', () => {
      const event1: any = {
        metadata: { timestamp: 1000, clientId: 'a' },
      };

      const event2: any = {
        metadata: { timestamp: 2000, clientId: 'b' },
      };

      const resolution = CRDTResolver.resolve('local', 'remote', event1, event2);
      expect(resolution.merged).toBe('remote'); // Later wins
    });

    it('should use client ID as tiebreaker', () => {
      const timestamp = 1500;

      const event1: any = {
        metadata: { timestamp, clientId: 'aaa' },
      };

      const event2: any = {
        metadata: { timestamp, clientId: 'zzz' },
      };

      const resolution = CRDTResolver.resolve('local', 'remote', event1, event2);
      expect(resolution.merged).toBe('remote'); // 'zzz' > 'aaa'
    });
  });

  describe('Multi-client Sync Scenarios', () => {
    it('should converge state with concurrent updates', () => {
      vi.useFakeTimers();
      vi.setSystemTime(1_000_000);

      const store1 = createStore({ count: 0 });
      vi.advanceTimersByTime(1);
      const store2 = createStore({ count: 0 });
      vi.advanceTimersByTime(1);

      store1.set('count', 5);
      vi.advanceTimersByTime(5);
      store2.set('count', 10);

      // Export and import
      const events1 = store1.getHistory();
      const events2 = store2.getHistory();

      store1.importEvents(events2);
      store2.importEvents(events1);

      // Same merged log order (LWW by timestamp + client id) → same final state
      expect(store1.getVersion()).toBe(store2.getVersion());
      expect(store1.getValue('count')).toBe(store2.getValue('count'));
      expect(store1.getValue('count')).toBe(10);

      vi.useRealTimers();
    });

    it('should handle delayed event delivery', () => {
      const store1 = createStore({ count: 0 });
      const store2 = createStore({ count: 0 });

      store1.set('count', 1);
      store1.set('count', 2);
      store1.set('count', 3);

      const events = store1.getHistory();

      // Import all at once (simulates delayed delivery)
      store2.importEvents(events);

      expect(store2.getValue('count')).toBe(3);
      expect(store2.getVersion()).toBe(3);
    });
  });

  describe('Large Data Sets', () => {
    it('should handle many events without crashing', () => {
      const store = createStore({ items: [] }, { maxHistorySize: 10000 });

      for (let i = 0; i < 1000; i++) {
        store.set('items', Array.from({ length: i + 1 }, (_, j) => ({ id: j })));
      }

      expect(store.getLogSize()).toBeGreaterThan(0);
      expect(store.getVersion()).toBe(1000);
    });

    it('should handle deep nesting', () => {
      const store = createStore({ level1: { level2: { level3: { level4: { value: 0 } } } } });

      store.set('level1.level2.level3.level4.value', 42);
      expect(store.getValue('level1.level2.level3.level4.value')).toBe(42);
    });
  });

  describe('Memory Management', () => {
    it('should respect maxHistorySize', () => {
      const store = createStore({ count: 0 }, { maxHistorySize: 5 });

      for (let i = 0; i < 10; i++) {
        store.set('count', i);
      }

      const history = store.getHistory();
      expect(history.length).toBeLessThanOrEqual(5);
    });

    it('should properly cleanup listeners', () => {
      const store = createStore({ count: 0 });
      const mockListener = vi.fn();

      const unsubscribe = store.subscribe(mockListener);
      store.set('count', 1);
      expect(mockListener).toHaveBeenCalledTimes(1);

      unsubscribe();
      store.set('count', 2);
      expect(mockListener).toHaveBeenCalledTimes(1); // Not called again
    });
  });

  describe('Error Handling', () => {
    it('should handle listener errors gracefully', () => {
      const store = createStore({ count: 0 });

      // Add a listener that throws
      store.subscribe(() => {
        throw new Error('Listener error');
      });

      // Add a valid listener
      let callCount = 0;
      store.subscribe(() => {
        callCount++;
      });

      // Should not crash, second listener should still be called
      store.set('count', 1);
      expect(callCount).toBe(1);
    });

    it('should handle malformed path gracefully', () => {
      const store = createStore({ user: { name: 'Alice' } });

      // Should not crash
      const value = store.getValue('nonexistent.path.here');
      expect(value).toBeUndefined();
    });
  });

  describe('Performance', () => {
    it('should quickly set values', () => {
      const store = createStore({ data: {} });
      const start = Date.now();

      for (let i = 0; i < 1000; i++) {
        store.set(`data.field${i}`, i);
      }

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000); // Should be fast
    });

    it('should quickly subscribe', () => {
      const store = createStore({ count: 0 });
      const start = Date.now();

      for (let i = 0; i < 1000; i++) {
        store.subscribe(() => {});
      }

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000); // Should be fast
    });
  });
});
