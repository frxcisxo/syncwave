# Syncwave

Distributed state management with real-time sync, offline persistence, event history, and deterministic conflict resolution.

[![npm version](https://img.shields.io/npm/v/%40frxncisxo%2Fsyncwave)](https://www.npmjs.com/package/@frxncisxo/syncwave)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

## Installation

```bash
npm install @frxncisxo/syncwave
```

Optional integrations:

```bash
npm install react
npm install vue
```

## What You Get

- Core store with nested path updates, history, undo/redo, snapshots, and event replay
- Offline persistence with pluggable storage adapters and explicit rehydration
- WebSocket sync adapter for multi-client replication
- React hooks, Vue composables, and Svelte store adapters
- Time-travel debugger helpers
- Conflict monitoring utilities and a small React conflict list component
- Encrypted sync codec for transport-level payload protection

## Package Surface

```ts
import { createStore } from '@frxncisxo/syncwave';
import { IndexedDBAdapter } from '@frxncisxo/syncwave/adapters';
import { createWebSocketSyncAdapter } from '@frxncisxo/syncwave/sync';
import { createTimeTravelDebugger } from '@frxncisxo/syncwave/debugger';
import { createEncryptedSyncCodec } from '@frxncisxo/syncwave/encryption';
```

Framework-specific entry points:

- `@frxncisxo/syncwave/react`
- `@frxncisxo/syncwave/vue`
- `@frxncisxo/syncwave/svelte`
- `@frxncisxo/syncwave/conflicts`

## Core Usage

```ts
import { createStore } from '@frxncisxo/syncwave';

const store = createStore({
  todos: [],
  user: { name: 'Alice', email: 'alice@example.com' },
  count: 0,
});

const unsubscribe = store.subscribe((nextState, previousState) => {
  console.log('count changed', previousState.count, '->', nextState.count);
});

store.set('user.name', 'Bob');
store.merge({ count: 42 });

console.log(store.getValue('user.name')); // Bob
console.log(store.getSnapshot().version); // 2

unsubscribe();
```

## Offline Persistence

Use a persistence adapter plus a stable `persistenceKey`. Await `whenReady()` before reading restored state.

```ts
import { createStore } from '@frxncisxo/syncwave';
import { IndexedDBAdapter } from '@frxncisxo/syncwave/adapters';

const store = createStore(
  { todos: [], count: 0 },
  {
    offline: true,
    undoRedo: true,
    persistenceAdapter: new IndexedDBAdapter('syncwave-demo', 'state'),
    persistenceKey: 'primary-tab',
  }
);

await store.whenReady();

store.set('todos', [{ id: 1, text: 'Ship Syncwave' }]);
```

## WebSocket Sync

The sync adapter wraps a store and streams events over a WebSocket transport.

```ts
import { createStore } from '@frxncisxo/syncwave';
import { createWebSocketSyncAdapter } from '@frxncisxo/syncwave/sync';

const store = createStore({ count: 0, user: { name: 'Alice' } });

const sync = createWebSocketSyncAdapter(store, 'ws://localhost:3000/sync');

sync.on('connected', () => {
  console.log('sync connected');
});

await sync.connect();

store.set('count', 1);

console.log(sync.getStatus());
// { connection: 'connected', queueSize: 0, lastSyncVersion: ... }
```

If you already have your own transport, you can keep the core store and forward events yourself with `store.onEvent()` and `store.importEvents()`.

## Encrypted Sync

Pass the encrypted codec into the WebSocket sync adapter to protect payloads in transit.

```ts
import { createStore } from '@frxncisxo/syncwave';
import { createWebSocketSyncAdapter } from '@frxncisxo/syncwave/sync';
import { createEncryptedSyncCodec } from '@frxncisxo/syncwave/encryption';

const store = createStore({ count: 0 });

const sync = createWebSocketSyncAdapter(store, 'wss://sync.example.com', {
  codec: createEncryptedSyncCodec('replace-with-a-shared-secret'),
});

await sync.connect();
```

## React

```tsx
import { useEffect } from 'react';
import {
  useStore,
  useStoreState,
  useStoreValue,
  useSubscribe,
} from '@frxncisxo/syncwave/react';

export function Counter() {
  const store = useStore({ count: 0, user: { name: 'Alice' } });
  const state = useStoreState(store);
  const count = useStoreValue(store, 'count');

  useSubscribe(store, (nextState, previousState) => {
    console.log(previousState.count, '->', nextState.count);
  });

  useEffect(() => {
    void store.whenReady();
  }, [store]);

  return (
    <button onClick={() => store.set('count', count + 1)}>
      {state.user.name}: {count}
    </button>
  );
}
```

Conflict UI helpers for React:

```tsx
import { ConflictList } from '@frxncisxo/syncwave/conflicts';

<ConflictList store={store} emptyMessage="No sync conflicts yet." />;
```

## Vue

```ts
import { useStore, useStoreValue, useSubscribe } from '@frxncisxo/syncwave/vue';

const store = useStore({ count: 0, user: { name: 'Alice' } });
const count = useStoreValue(store, 'count');

useSubscribe(store, (nextState) => {
  console.log('count is now', nextState.count);
});

store.set('count', count.value + 1);
```

## Svelte

```ts
import { createStore } from '@frxncisxo/syncwave';
import {
  createSvelteStore,
  selectStoreValue,
} from '@frxncisxo/syncwave/svelte';

const baseStore = createStore({ count: 0, user: { name: 'Alice' } });
export const store = createSvelteStore(baseStore);
export const count = selectStoreValue(baseStore, 'count');
```

## Time Travel Debugger

```ts
import { createStore } from '@frxncisxo/syncwave';
import { createTimeTravelDebugger } from '@frxncisxo/syncwave/debugger';

const store = createStore({ count: 0 }, { undoRedo: true });
store.set('count', 1);
store.set('count', 2);
store.set('count', 3);

const debuggerApi = createTimeTravelDebugger(store);

console.log(debuggerApi.inspect(2).state.count); // 2

debuggerApi.apply(1);
console.log(store.getValue('count')); // 1

debuggerApi.reset();
console.log(store.getValue('count')); // 3
```

## Conflict Monitoring

You can subscribe to raw conflict resolutions or use the monitor abstraction.

```ts
import { createStore } from '@frxncisxo/syncwave';
import { ConflictMonitor } from '@frxncisxo/syncwave/conflicts';

const store = createStore({ count: 0 });
const monitor = new ConflictMonitor(store);

store.onConflict((conflict) => {
  console.log(conflict.path, conflict.local, conflict.remote, conflict.merged);
});

console.log(monitor.getConflicts());
```

## Event History And Replay

```ts
const history = store.getHistory();
const countHistory = store.getPathHistory('count');
const stateAtVersion2 = store.eventLog.replay({ count: 0 }, -1, 2);

console.log(history.length);
console.log(countHistory.length);
console.log(stateAtVersion2.count);
```

## API Reference

### Store

- `getState()`: returns a deep copy of the current state
- `getValue(path)`: reads a nested value by path
- `set(path, value)`: writes a value at a nested path
- `merge(updates)`: deep-merges a partial update
- `setState(updates)`: alias of `merge`
- `delete(path)`: removes a value by path
- `subscribe(listener)`: listens to state changes
- `onEvent(listener)`: listens to emitted events
- `onConflict(listener)`: listens to conflict resolutions
- `undo()` / `redo()`: navigates local history
- `getHistory()`: returns all events
- `getPathHistory(path)`: returns history for a path prefix
- `getSnapshot()`: returns state plus metadata
- `getVersion()`: current visible version
- `getLatestVersion()`: highest available event-log version
- `getStateAtVersion(version)`: reconstructs state for a version
- `travelTo(version)`: updates the store to a historical version
- `whenReady()`: resolves when persistence rehydration is done
- `importEvents(events)`: merges remote events into the local store

### Adapters

- `IndexedDBAdapter`
- `LocalStorageAdapter`
- `AsyncStorageAdapter`
- `MemoryAdapter`

### Sync

- `createWebSocketSyncAdapter(store, url, options)`
- `sync.connect()`
- `sync.disconnect()`
- `sync.getStatus()`
- `sync.on(event, listener)`

### Debugging

- `createTimeTravelDebugger(store)`
- `debugger.inspect(version)`
- `debugger.list()`
- `debugger.apply(version)`
- `debugger.stepBackward()`
- `debugger.stepForward()`
- `debugger.reset()`

## Notes

- Path access is string-based, for example `user.profile.name`.
- Conflict resolution is deterministic and currently uses timestamp plus client ID ordering for concurrent writes.
- The base package has no required runtime dependencies. React and Vue are optional peers used only for their subpath integrations.

## Contributing

Contributions welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
