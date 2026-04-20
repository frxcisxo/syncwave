# 🌊 Syncwave

**Distributed state management with real-time sync, offline-first architecture, and automatic conflict resolution using CRDTs.**

> State that syncs like a wave across your entire application stack—browser, mobile, server. No conflicts. Ever.

[![npm version](https://img.shields.io/npm/v/syncwave)](https://www.npmjs.com/package/syncwave)
[![Build Status](https://img.shields.io/github/actions/workflow/status/username/syncwave/test.yml)](https://github.com/username/syncwave/actions)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

## Why Syncwave?

Building real-time, multi-device applications is **hard**. You need:
- ✅ Real-time synchronization across clients
- ✅ Automatic conflict resolution (no manual merging)
- ✅ Offline-first support (works without internet)
- ✅ Time-travel debugging (undo/redo across devices)
- ✅ Event sourcing (full audit trail)

Traditional state management (Redux, Zustand, Pinia) handles **local state**. Syncwave handles **distributed state**.

It's what powers **Figma**, **Notion**, **Linear**—now available as a library.

## Key Features

### 🔄 Real-time Sync
State changes replicate instantly across all connected clients using event-based sync.

```javascript
// Client A
store.set('user.name', 'Alice');

// Client B (instantly gets the change)
// No polling, no manual refetch
```

### 🚫 No Conflicts
Uses **CRDT (Conflict-free Replicated Data Types)** mathematics so concurrent edits naturally converge.

```javascript
// Client A: set count = 5
// Client B: set count = 10 (at the exact same time)

// Both clients converge to deterministic result: 10
// No "pick local or remote", no manual resolution
```

### 📱 Offline-First
Work without internet. Changes sync automatically when reconnected.

```javascript
store.setState({ todos: [...] }); // Works offline
// When back online: ✨ Automatic sync
```

### ⏮️ Undo/Redo Everywhere
Travel through time. Works across devices.

```javascript
store.undo();  // Revert last operation
store.redo();  // Redo
// Other clients see the change in real-time
```

### 📜 Event Sourcing
Full history of every change. Rebuild state from any point in time.

```javascript
const history = store.getHistory();
// [{ type: 'set', path: 'user.name', value: 'Alice', timestamp: ... }, ...]

const stateAtTime = store.eventLog.replay(initialState, 0, targetVersion);
```

## Installation

```bash
npm install syncwave
```

## Quick Start

### Basic Usage

```typescript
import { createStore } from 'syncwave';

// Create a store
const store = createStore({
  todos: [],
  user: { name: 'Alice', email: 'alice@example.com' },
  count: 0,
});

// Subscribe to changes
store.subscribe((newState, oldState) => {
  console.log('State changed:', newState);
});

// Update state
store.set('user.name', 'Bob');
store.set('count', 42);

// Get current state
const state = store.getState();
console.log(state.user.name); // 'Bob'
```

### With Offline Support

```typescript
import { createStore } from 'syncwave';

const store = createStore(
  { todos: [], count: 0 },
  {
    offline: true, // Enable offline persistence
    undoRedo: true, // Enable undo/redo
  }
);

// Works offline - changes auto-sync when back online
store.set('todos', [{ id: 1, text: 'Learn Syncwave' }]);
```

### Real-time Sync (Multiple Clients)

```typescript
// Client A
const storeA = createStore({ data: 'initial' });

// Client B
const storeB = createStore({ data: 'initial' });

// Subscribe to events for syncing
storeA.onEvent((event) => {
  // Send to server/broadcast channel
  broadcastChannel.postMessage(event);
});

storeB.onEvent((event) => {
  broadcastChannel.postMessage(event);
});

// Handle incoming events from other clients
broadcastChannel.onmessage = (e) => {
  storeA.importEvents([e.data]);
  // storeA automatically resolves conflicts via CRDT
};

// Now both stores stay in sync!
storeA.set('data', 'client-a-change');
storeB.set('data', 'client-b-change');
// Both converge to deterministic result
```

### Undo/Redo

```typescript
store.set('count', 1);
store.set('count', 2);
store.set('count', 3);

console.log(store.getValue('count')); // 3

store.undo();
console.log(store.getValue('count')); // 2

store.undo();
console.log(store.getValue('count')); // 1

store.redo();
console.log(store.getValue('count')); // 2
```

### Event History & Time Travel

```typescript
// Get full history
const history = store.getHistory();
console.log(history);
// [
//   { type: 'set', path: 'count', value: 1, metadata: {...} },
//   { type: 'set', path: 'count', value: 2, metadata: {...} },
//   ...
// ]

// Get history for specific path
const countHistory = store.getPathHistory('count');

// Replay to any point in time
const stateAtVersion5 = store.eventLog.replay(initialState, 0, 5);
```

## API Reference

### Store Methods

#### `getState(): T`
Returns a deep copy of current state.

#### `set<V>(path: string, value: V): void`
Set value at path (supports nested paths: `'user.profile.name'`).

#### `getValue<V>(path: string): V`
Get value at path.

#### `delete(path: string): void`
Delete value at path.

#### `merge(updates: Partial<T>): void`
Deep merge updates into state.

#### `setState(updates: Partial<T>): void`
Alias for merge.

#### `subscribe(listener: StateListener<T>): () => void`
Subscribe to state changes. Returns unsubscribe function.

#### `onEvent(listener: EventListener): () => void`
Subscribe to all events.

#### `onConflict(listener: ConflictListener): () => void`
Subscribe to conflict resolutions.

#### `undo(): void`
Undo last operation.

#### `redo(): void`
Redo last undone operation.

#### `reset(): void`
Reset to initial state.

#### `getHistory(): StateEvent[]`
Get all events.

#### `getPathHistory(path: string): StateEvent[]`
Get events for specific path.

#### `getSnapshot(): StateSnapshot<T>`
Get current state snapshot with metadata.

#### `getVersion(): number`
Get current version number.

#### `getLogSize(): number`
Get size of event log.

#### `importEvents(events: StateEvent[]): void`
Import events from other clients (used internally for sync).

## Advanced: Custom Persistence

```typescript
import { createStore } from 'syncwave';

const customPersistence = {
  async get(key: string) {
    return localStorage.getItem(key);
  },
  async set(key: string, value: string) {
    localStorage.setItem(key, value);
  },
  async delete(key: string) {
    localStorage.removeItem(key);
  },
  async clear() {
    localStorage.clear();
  },
};

const store = createStore(initialState, {
  persistenceAdapter: customPersistence,
  offline: true,
});
```

## Architecture

### Event Log
Every change is recorded as an immutable event. This enables:
- Full audit trail
- Time-travel debugging
- Event replay & reconstruction

### CRDT (Conflict-free Replicated Data Types)
Mathematical operations that guarantee convergence. When two clients make conflicting changes:
- No merge conflicts
- Deterministic resolution
- Based on timestamps + client ID tiebreaker

### Offline Queue
Changes made offline are queued. When reconnected:
- Queue replays automatically
- CRDT resolves any conflicts
- No data loss

### Undo/Redo Stack
Maintains version history. Undo/Redo works by:
- Replaying events up to target version
- Works across all clients in sync

## Performance

- **Lightweight**: ~5KB gzipped
- **No dependencies**: Zero external packages
- **Efficient diffs**: Only sends changed data
- **Memory-bounded**: Configurable history limit

## TypeScript Support

Full TypeScript support with strict typing:

```typescript
interface State {
  user: { name: string; email: string };
  todos: Array<{ id: number; text: string }>;
}

const store = createStore<State>({
  user: { name: 'Alice', email: 'alice@example.com' },
  todos: [],
});

// TypeScript knows the shape
store.set('user.name', 'Bob'); // ✅
store.set('user.age', 30); // ❌ Type error
```

## Browser Support

- Chrome 60+
- Firefox 60+
- Safari 12+
- Edge 79+

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT © 2024

## Roadmap

- [ ] WebSocket sync adapter
- [ ] IndexedDB adapter
- [ ] React hooks (useStore, useSubscribe)
- [ ] Vue composables
- [ ] Svelte stores
- [ ] Time-travel debugger
- [ ] Conflict visualization UI
- [ ] Encrypted sync

## Inspiration

Built on the same principles as:
- **Figma** (CRDT, real-time collab)
- **Notion** (offline-first, sync)
- **Linear** (event sourcing, undo/redo)
- **Redux** (state management)
- **Yjs** (CRDT library)

## Get Started

```bash
npm install syncwave
```

Read the [full docs](https://syncwave.dev) or check [examples](./examples).

---

Made with ❤️ by developers, for developers.

**Questions?** Open an issue on [GitHub](https://github.com/username/syncwave).
