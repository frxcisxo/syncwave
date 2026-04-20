import { describe, it, expect, beforeEach } from 'vitest';
import { createStore, EventLog, CRDTResolver } from '../src/index';

describe('Syncwave - Distributed State Management', () => {
  interface TestState {
    todos: { id: number; text: string }[];
    user: { name: string; email: string };
    count: number;
  }

  let store: ReturnType<typeof createStore<TestState>>;

  beforeEach(() => {
    store = createStore<TestState>({
      todos: [],
      user: { name: 'Alice', email: 'alice@example.com' },
      count: 0,
    });
  });

  describe('Basic State Management', () => {
    it('should initialize with correct state', () => {
      const state = store.getState();
      expect(state.user.name).toBe('Alice');
      expect(state.todos).toEqual([]);
      expect(state.count).toBe(0);
    });

    it('should update state with set', () => {
      store.set('count', 42);
      expect(store.getValue('count')).toBe(42);
    });

    it('should update nested values', () => {
      store.set('user.name', 'Bob');
      expect(store.getValue('user.name')).toBe('Bob');
    });

    it('should merge objects', () => {
      store.merge({
        user: { name: 'Charlie' },
      });
      const state = store.getState();
      expect(state.user.name).toBe('Charlie');
      expect(state.user.email).toBe('alice@example.com'); // Should preserve
    });

    it('should delete values', () => {
      store.set('count', 5);
      store.delete('count');
      const state = store.getState();
      expect('count' in state).toBe(false);
    });
  });

  describe('Subscriptions', () => {
    it('should notify subscribers on state change', () => {
      let callCount = 0;
      let newStateSnapshot: any;

      store.subscribe((newState) => {
        callCount++;
        newStateSnapshot = newState;
      });

      store.set('count', 10);
      expect(callCount).toBe(1);
      expect(newStateSnapshot.count).toBe(10);

      store.set('count', 20);
      expect(callCount).toBe(2);
    });

    it('should allow unsubscribe', () => {
      let callCount = 0;
      const unsubscribe = store.subscribe(() => {
        callCount++;
      });

      store.set('count', 1);
      expect(callCount).toBe(1);

      unsubscribe();
      store.set('count', 2);
      expect(callCount).toBe(1); // Should not increment
    });

    it('should notify event listeners', () => {
      let eventCount = 0;
      let lastEvent: any;

      store.onEvent((event) => {
        eventCount++;
        lastEvent = event;
      });

      store.set('count', 5);
      expect(eventCount).toBe(1);
      expect(lastEvent.type).toBe('set');
      expect(lastEvent.path).toBe('count');
      expect(lastEvent.value).toBe(5);
    });
  });

  describe('Undo/Redo', () => {
    it('should undo last operation', () => {
      store.set('count', 1);
      store.set('count', 2);
      expect(store.getValue('count')).toBe(2);

      store.undo();
      expect(store.getValue('count')).toBe(1);
    });

    it('should redo after undo', () => {
      store.set('count', 1);
      store.set('count', 2);

      store.undo();
      expect(store.getValue('count')).toBe(1);

      store.redo();
      expect(store.getValue('count')).toBe(2);
    });

    it('should clear redo stack on new change after undo', () => {
      store.set('count', 1);
      store.set('count', 2);
      store.undo();

      store.set('count', 3);
      // Redo should not work now
      const beforeRedo = store.getValue('count');
      store.redo();
      expect(store.getValue('count')).toBe(beforeRedo);
    });
  });

  describe('Event History', () => {
    it('should track all events', () => {
      store.set('count', 1);
      store.set('count', 2);
      store.set('user.name', 'Bob');

      const history = store.getHistory();
      expect(history.length).toBe(3);
      expect(history[0].type).toBe('set');
      expect(history[2].path).toBe('user.name');
    });

    it('should get path history', () => {
      store.set('count', 1);
      store.set('count', 2);
      store.set('count', 3);
      store.set('user.name', 'Bob');

      const countHistory = store.getPathHistory('count');
      expect(countHistory.length).toBe(3);
      expect(countHistory.every((e) => e.path === 'count')).toBe(true);
    });

    it('should maintain version numbers', () => {
      expect(store.getVersion()).toBe(0);

      store.set('count', 1);
      expect(store.getVersion()).toBe(1);

      store.set('count', 2);
      expect(store.getVersion()).toBe(2);
    });
  });

  describe('Snapshots', () => {
    it('should create valid snapshots', () => {
      store.set('count', 42);
      store.set('user.name', 'Alice2');

      const snapshot = store.getSnapshot();
      expect(snapshot.data.count).toBe(42);
      expect(snapshot.data.user.name).toBe('Alice2');
      expect(snapshot.version).toBe(2);
      expect(snapshot.clientId).toBeTruthy();
    });
  });

  describe('Event Log', () => {
    it('should replay events to reconstruct state', () => {
      const eventLog = new EventLog('client-1');

      eventLog.append('set', 'count', 5);
      eventLog.append('set', 'count', 10);

      const initialState = { count: 0 };
      const replayed = eventLog.replay(initialState, 0);
      expect(replayed.count).toBe(10);
    });

    it('should get events since version', () => {
      const eventLog = new EventLog('client-1');
      eventLog.append('set', 'a', 1);
      eventLog.append('set', 'b', 2);
      eventLog.append('set', 'c', 3);

      const since = eventLog.getSince(1);
      expect(since.length).toBe(2);
      expect(since[0].path).toBe('b');
    });
  });

  describe('CRDT Conflict Resolution', () => {
    it('should resolve conflicts with LWW strategy', () => {
      const localEvent: any = {
        metadata: {
          timestamp: 1000,
          clientId: 'client-1',
        },
      };

      const remoteEvent: any = {
        metadata: {
          timestamp: 2000,
          clientId: 'client-2',
        },
      };

      const resolution = CRDTResolver.resolve('local', 'remote', localEvent, remoteEvent);
      expect(resolution.merged).toBe('remote'); // Later timestamp
    });

    it('should use client ID as tiebreaker for same timestamp', () => {
      const timestamp = 1500;
      const localEvent: any = {
        metadata: { timestamp, clientId: 'a-client' },
      };

      const remoteEvent: any = {
        metadata: { timestamp, clientId: 'z-client' },
      };

      const resolution = CRDTResolver.resolve(
        'local',
        'remote',
        localEvent,
        remoteEvent
      );
      // 'z-client' > 'a-client', so remote wins
      expect(resolution.merged).toBe('remote');
    });
  });

  describe('Event Import/Export', () => {
    it('should import external events', () => {
      const store1 = createStore<TestState>({
        todos: [],
        user: { name: 'Alice', email: 'alice@example.com' },
        count: 0,
      });

      store1.set('count', 5);
      const events1 = store1.getHistory();

      // Second store imports events from first
      const store2 = createStore<TestState>({
        todos: [],
        user: { name: 'Alice', email: 'alice@example.com' },
        count: 0,
      });

      store2.importEvents(events1);
      expect(store2.getValue('count')).toBe(5);
      expect(store2.getVersion()).toBe(store1.getVersion());
    });
  });

  describe('Reset', () => {
    it('should reset to initial state', () => {
      store.set('count', 100);
      store.set('user.name', 'Bob');

      store.reset();

      const state = store.getState();
      expect(state.count).toBe(0);
      expect(state.user.name).toBe('Alice');
      expect(store.getVersion()).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should not trigger listeners if state unchanged', () => {
      let callCount = 0;
      store.subscribe(() => callCount++);

      store.set('count', 5);
      expect(callCount).toBe(1);

      // Setting to same value should not trigger
      store.set('count', 5);
      expect(callCount).toBe(1);
    });

    it('should handle deeply nested updates', () => {
      store.set('user.email', 'newemail@example.com');
      expect(store.getValue('user.email')).toBe('newemail@example.com');
      expect(store.getValue('user.name')).toBe('Alice'); // Other fields preserved
    });

    it('should handle array operations', () => {
      const todos = [{ id: 1, text: 'Task 1' }];
      store.set('todos', todos);
      expect(store.getValue<any>('todos').length).toBe(1);

      const todos2 = [...todos, { id: 2, text: 'Task 2' }];
      store.set('todos', todos2);
      expect(store.getValue<any>('todos').length).toBe(2);
    });
  });
});
