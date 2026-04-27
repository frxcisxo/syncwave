# 🌊 Syncwave

**Distributed state management with real-time sync, offline-first architecture, and automatic conflict resolution using CRDTs.**

> State that syncs like a wave across your entire application stack—browser, mobile, server. No conflicts. Ever.

[![npm version](https://img.shields.io/npm/v/syncwave)](https://www.npmjs.com/package/syncwave)
[![Build Status](https://img.shields.io/github/actions/workflow/status/username/syncwave/test.yml)](https://github.com/username/syncwave/actions)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Syncwave gives you a single store API with:

- 🔄 Real-time event sync
- 📱 Offline persistence
- ⏮️ Undo / redo
- 🧭 Time-travel debugging
- ⚔️ Deterministic conflict resolution
- ⚛️ React, Vue, and Svelte integrations
- 🔐 Optional encrypted transport codecs

It is designed for apps where state moves across tabs, devices, workers, or servers and still needs to stay understandable.

[![npm version](https://img.shields.io/npm/v/%40frxncisxo%2Fsyncwave)](https://www.npmjs.com/package/@frxncisxo/syncwave)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

## ✨ Why Syncwave?

Most state libraries stop at local state.

Syncwave keeps the ergonomics of a local store, then adds the pieces distributed apps usually bolt on later:

- live event replication
- persistence and rehydration
- event history
- replayable state
- conflict visibility
- framework adapters

The result is a store you can start small with and grow into multi-client sync without replacing the mental model.

## 📦 Installation

```bash
npm install @frxncisxo/syncwave
```

Optional framework peers:

```bash
npm install react
npm install vue
```

## 🚀 Quick Start

```ts
import { createStore } from '@frxncisxo/syncwave';

const store = createStore({
  todos: [],
  user: { name: 'Alice', email: 'alice@example.com' },
  count: 0,
});

const unsubscribe = store.subscribe((nextState, previousState) => {
  console.log('count', previousState.count, '->', nextState.count);
});

store.set('user.name', 'Bob');
store.merge({ count: 42 });

console.log(store.getValue('user.name')); // Bob
console.log(store.getSnapshot().version); // 2

unsubscribe();
```

## 🧩 Package Surface

```ts
import { createStore } from '@frxncisxo/syncwave';
import { IndexedDBAdapter } from '@frxncisxo/syncwave/adapters';
import { createWebSocketSyncAdapter } from '@frxncisxo/syncwave/sync';
import { createTimeTravelDebugger } from '@frxncisxo/syncwave/debugger';
import { createEncryptedSyncCodec } from '@frxncisxo/syncwave/encryption';
```

Framework subpaths:

- `@frxncisxo/syncwave/react`
- `@frxncisxo/syncwave/vue`
- `@frxncisxo/syncwave/svelte`
- `@frxncisxo/syncwave/conflicts`

## 🔄 Real-Time Sync

Syncwave stores emit events locally and can import events from somewhere else.

If you already have your own transport, that may be enough:

```ts
const storeA = createStore({ count: 0 });
const storeB = createStore({ count: 0 });

storeA.set('count', 1);
storeB.importEvents(storeA.getHistory());

console.log(storeB.getValue('count')); // 1
```

For WebSocket-based replication, use the sync adapter:

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

## 📱 Offline-First Persistence

Use a persistence adapter plus a stable `persistenceKey`. Await `whenReady()` before assuming restored state is available.

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

Available storage adapters:

- `IndexedDBAdapter`
- `LocalStorageAdapter`
- `AsyncStorageAdapter`
- `MemoryAdapter`

## ⚔️ Conflicts Without Guesswork

Syncwave resolves concurrent writes deterministically and lets you observe what happened.

```ts
const local = createStore({ count: 0 });
const remote = createStore({ count: 0 });

local.onConflict((conflict) => {
  console.log(conflict.path, conflict.local, conflict.remote, conflict.merged);
});

local.set('count', 5);
remote.set('count', 10);

local.importEvents(remote.getHistory());

console.log(local.getValue('count')); // deterministic merged result
```

If you want a higher-level conflict feed:

```ts
import { ConflictMonitor } from '@frxncisxo/syncwave/conflicts';

const monitor = new ConflictMonitor(local);
console.log(monitor.getConflicts());
```

React conflict UI helper:

```tsx
import { ConflictList } from '@frxncisxo/syncwave/conflicts';

<ConflictList store={store} emptyMessage="No sync conflicts yet." />;
```

## ⏮️ Undo, History, and Replay

The store keeps an event log, so local state changes are inspectable and replayable.

```ts
const store = createStore({ count: 0 }, { undoRedo: true });

store.set('count', 1);
store.set('count', 2);
store.set('count', 3);

store.undo();
console.log(store.getValue('count')); // 2

store.redo();
console.log(store.getValue('count')); // 3

const history = store.getHistory();
const countHistory = store.getPathHistory('count');
const stateAtVersion2 = store.eventLog.replay({ count: 0 }, -1, 2);

console.log(history.length);
console.log(countHistory.length);
console.log(stateAtVersion2.count);
```

## 🧭 Time-Travel Debugger

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

## 🔐 Encrypted Sync

If your transport should not carry plain JSON payloads, pass an encrypted codec into the sync adapter.

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

## ⚛️ React

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

## 💚 Vue

```ts
import { useStore, useStoreValue, useSubscribe } from '@frxncisxo/syncwave/vue';

const store = useStore({ count: 0, user: { name: 'Alice' } });
const count = useStoreValue(store, 'count');

useSubscribe(store, (nextState) => {
  console.log('count is now', nextState.count);
});

store.set('count', count.value + 1);
```

## 🧡 Svelte

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

## 🛠️ API Reference

### Store

- `getState()`
- `getValue(path)`
- `set(path, value)`
- `merge(updates)`
- `setState(updates)`
- `delete(path)`
- `subscribe(listener)`
- `onEvent(listener)`
- `onConflict(listener)`
- `undo()`
- `redo()`
- `getHistory()`
- `getPathHistory(path)`
- `getSnapshot()`
- `getVersion()`
- `getLatestVersion()`
- `getStateAtVersion(version)`
- `travelTo(version)`
- `whenReady()`
- `importEvents(events)`

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

## 📝 Notes

- Paths are string-based, for example `user.profile.name`.
- Conflict resolution is deterministic and currently orders concurrent writes by timestamp and client ID.
- The base package has no required runtime dependencies. React and Vue are optional peers used only in their subpath integrations.

## 🤝 Contributing

Contributions welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## 📄 License

MIT
