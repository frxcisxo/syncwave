import { describe, expect, it, vi } from 'vitest';
import { EventLog } from './eventlog';
import { createStore } from './store';
import { deepMerge, deleteAtPath, setAtPath } from './utils';

describe('Performance regressions', () => {
  it('setAtPath returns the same reference for no-op writes', () => {
    const state = { user: { name: 'Alice' }, count: 1 };

    const nextState = setAtPath(state, 'user.name', 'Alice');

    expect(nextState).toBe(state);
  });

  it('setAtPath preserves untouched branches during nested writes', () => {
    const state = {
      user: { profile: { name: 'Alice' } },
      settings: { theme: 'light' },
    };

    const nextState = setAtPath(state, 'user.profile.name', 'Bob');

    expect(nextState).not.toBe(state);
    expect(nextState.settings).toBe(state.settings);
    expect(nextState.user).not.toBe(state.user);
    expect(nextState.user.profile.name).toBe('Bob');
  });

  it('deleteAtPath returns the same reference when the path is missing', () => {
    const state = { user: { name: 'Alice' } };

    const nextState = deleteAtPath(state, 'user.email');

    expect(nextState).toBe(state);
  });

  it('deepMerge returns the same reference when updates are equivalent', () => {
    const state = { user: { name: 'Alice' }, count: 1 };

    const nextState = deepMerge(state, { user: { name: 'Alice' } });

    expect(nextState).toBe(state);
  });

  it('event log replay at version 0 returns the initial state', () => {
    const log = new EventLog('client-1');
    log.append('set', 'count', 1);
    log.append('set', 'count', 2);

    expect(log.replay({ count: 0 }, -1, 0)).toEqual({ count: 0 });
  });

  it('event log replays merge events as full-state replacements', () => {
    const log = new EventLog('client-1');
    log.append('merge', 'root', { count: 2, user: { name: 'Bob' } });

    expect(log.replay({ count: 0, user: { name: 'Alice' } }, -1, 1)).toEqual({
      count: 2,
      user: { name: 'Bob' },
    });
  });

  it('duplicate imports do not notify subscribers again', () => {
    const source = createStore({ count: 0 });
    const target = createStore({ count: 0 });
    const listener = vi.fn();
    target.subscribe(listener);

    source.set('count', 1);
    const events = source.getHistory();

    target.importEvents(events);
    expect(listener).toHaveBeenCalledTimes(1);

    target.importEvents(events);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('handles duplicate-heavy imports without quadratic collapse', () => {
    const source = createStore({ count: 0 });

    for (let i = 0; i < 500; i++) {
      source.set('count', i);
    }

    const target = createStore({ count: 0 });
    const payload = [...source.getHistory(), ...source.getHistory()];
    const start = performance.now();

    target.importEvents(payload);

    expect(target.getValue('count')).toBe(499);
    expect(performance.now() - start).toBeLessThan(500);
  });
});
