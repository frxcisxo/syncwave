import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createStore } from './index';

/**
 * Exercises the public API and flows described in README.md so they stay true in code.
 */
describe('README contract', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('basic usage: subscribe, set, getState, getValue', () => {
    const store = createStore({
      todos: [] as { id: number; text: string }[],
      user: { name: 'Alice', email: 'alice@example.com' },
      count: 0,
    });

    let last: { name: string } | null = null;
    const unsub = store.subscribe((newState) => {
      last = newState.user;
    });

    store.set('user.name', 'Bob');
    store.set('count', 42);

    expect(store.getState().user.name).toBe('Bob');
    expect(store.getValue('count')).toBe(42);
    expect(last?.name).toBe('Bob');
    unsub();
  });

  it('setState deep-merges (offline / partial update)', () => {
    const store = createStore(
      { todos: [] as { id: number; text: string }[], count: 0 },
      { offline: true, undoRedo: true }
    );

    store.setState({ todos: [{ id: 1, text: 'Learn Syncwave' }] });
    expect(store.getValue('todos')).toEqual([{ id: 1, text: 'Learn Syncwave' }]);
    expect(store.getValue('count')).toBe(0);
  });

  it('merge deep-merges nested objects (setState uses merge)', () => {
    const store = createStore({ a: 1, b: { c: 2 } });
    store.merge({ b: { d: 3 } });
    expect(store.getValue('a')).toBe(1);
    expect(store.getValue('b.c')).toBe(2);
    expect(store.getValue('b.d')).toBe(3);
  });

  it('undo / redo as in README', () => {
    const store = createStore({ count: 0 }, { undoRedo: true });

    store.set('count', 1);
    vi.advanceTimersByTime(1);
    store.set('count', 2);
    vi.advanceTimersByTime(1);
    store.set('count', 3);

    expect(store.getValue('count')).toBe(3);
    store.undo();
    expect(store.getValue('count')).toBe(2);
    store.undo();
    expect(store.getValue('count')).toBe(1);
    store.redo();
    expect(store.getValue('count')).toBe(2);
  });

  it('getHistory, getPathHistory, eventLog.replay (time travel)', () => {
    const initial = { count: 0 };
    const store = createStore(initial, { undoRedo: true });

    store.set('count', 1);
    vi.advanceTimersByTime(1);
    store.set('count', 2);
    vi.advanceTimersByTime(1);
    store.set('count', 3);

    const history = store.getHistory();
    expect(history.length).toBe(3);
    expect(history.every((e) => e.type === 'set')).toBe(true);

    const countOnly = store.getPathHistory('count');
    expect(countOnly.length).toBe(3);

    const at2 = store.eventLog.replay(initial, 0, 2);
    expect(at2.count).toBe(2);
  });

  it('multi-client: importEvents converges to LWW (README sync)', () => {
    const a = createStore({ data: 'initial' });
    vi.advanceTimersByTime(1);
    const b = createStore({ data: 'initial' });
    vi.advanceTimersByTime(1);

    a.set('data', 'client-a-change');
    vi.advanceTimersByTime(5);
    b.set('data', 'client-b-change');

    const evA = a.getHistory();
    const evB = b.getHistory();

    a.importEvents(evB);
    b.importEvents(evA);

    expect(a.getValue('data')).toBe('client-b-change');
    expect(b.getValue('data')).toBe(a.getValue('data'));
  });

  it('onConflict fires when merging concurrent sets from another client', () => {
    const local = createStore({ count: 0 });
    vi.advanceTimersByTime(1);
    const remote = createStore({ count: 0 });

    local.set('count', 5);
    vi.advanceTimersByTime(1);
    remote.set('count', 10);

    const fn = vi.fn();
    local.onConflict(fn);
    local.importEvents(remote.getHistory());

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0]).toMatchObject({
      strategy: 'crdt',
      merged: 10,
    });
    expect(local.getValue('count')).toBe(10);
  });
});
