import { describe, it, expect, vi } from 'vitest';
import { effectScope, nextTick, watchEffect } from 'vue';
import { createStore } from './store';
import { createTimeTravelDebugger } from './debugger';
import { ConflictMonitor } from './conflicts';
import { createEncryptedSyncCodec } from './encryption';
import { createWebSocketSyncAdapter } from './sync';
import { useStoreValue as useVueStoreValue } from './vue';
import { createSvelteStore, selectStoreValue } from './svelte';
import type { StateEvent, SyncMessage } from './types';
import type { WebSocketLike } from './syncmanager';

class FakeSocket implements WebSocketLike {
  readyState = 1;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((error: Event | Error) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor() {
    queueMicrotask(() => {
      this.onopen?.();
    });
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }
}

describe('Roadmap features', () => {
  it('time-travel debugger inspects and applies versions', () => {
    const store = createStore({ count: 0 }, { undoRedo: true });

    store.set('count', 1);
    store.set('count', 2);
    store.set('count', 3);

    const debuggerApi = createTimeTravelDebugger(store);

    expect(debuggerApi.inspect(2).state.count).toBe(2);
    debuggerApi.apply(1);
    expect(store.getValue('count')).toBe(1);
    debuggerApi.reset();
    expect(store.getValue('count')).toBe(3);
  });

  it('conflict monitor records conflict metadata for visualization', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const local = createStore({ count: 0 });
    vi.advanceTimersByTime(1);
    const remote = createStore({ count: 0 });
    const monitor = new ConflictMonitor(local);

    local.set('count', 1);
    vi.advanceTimersByTime(5);
    remote.set('count', 10);
    local.importEvents(remote.getHistory());

    const [record] = monitor.getConflicts();
    expect(record.resolution.path).toBe('count');
    expect(record.resolution.merged).toBe(10);

    monitor.dispose();
    vi.useRealTimers();
  });

  it('encrypted codec round-trips sync payloads', async () => {
    const codec = createEncryptedSyncCodec('top-secret');
    const message: SyncMessage = {
      type: 'sync',
      clientId: 'client-1',
      version: 3,
      events: [
        {
          type: 'set',
          path: 'count',
          value: 3,
          metadata: {
            id: 'evt-1',
            timestamp: Date.now(),
            clientId: 'client-1',
            sessionId: 'session-1',
            version: 3,
            parentVersion: 2,
          },
        },
      ],
    };

    const encoded = await codec.encode(message);
    expect(encoded).not.toContain('"count"');
    await expect(codec.decode(encoded)).resolves.toEqual(message);
  });

  it('websocket sync adapter sends local events and imports remote ones', async () => {
    const socket = new FakeSocket();
    const store = createStore({ count: 0 });
    const adapter = createWebSocketSyncAdapter(store, 'ws://syncwave.test', {
      autoReconnect: false,
      createSocket: () => socket,
    });

    await adapter.connect();
    await Promise.resolve();

    store.set('count', 2);
    await Promise.resolve();

    const sentMessages = socket.sent.map((payload) => JSON.parse(payload) as SyncMessage);
    expect(sentMessages.some((message) => message.type === 'init')).toBe(true);
    expect(sentMessages.some((message) => message.type === 'sync')).toBe(true);
    expect(adapter.getStatus().connection).toBe('connected');

    const remoteEvent: StateEvent = {
      type: 'set',
      path: 'count',
      value: 5,
      metadata: {
        id: 'remote-1',
        timestamp: Date.now() + 1,
        clientId: 'remote-client',
        sessionId: 'remote-session',
        version: 1,
        parentVersion: 0,
      },
    };

    socket.onmessage?.({
      data: JSON.stringify({
        type: 'sync',
        clientId: 'remote-client',
        version: 1,
        events: [remoteEvent],
      } satisfies SyncMessage),
    });
    await Promise.resolve();

    expect(store.getValue('count')).toBe(5);
  });

  it('vue composables stay reactive to store updates', async () => {
    const store = createStore({ count: 0 });
    const scope = effectScope();
    let current = -1;

    scope.run(() => {
      const value = useVueStoreValue(store, 'count');
      watchEffect(() => {
        current = value.value;
      });
    });

    expect(current).toBe(0);
    store.set('count', 7);
    await nextTick();
    expect(current).toBe(7);

    scope.stop();
  });

  it('svelte adapters expose readable state and selectors', () => {
    const store = createStore({ count: 0, name: 'syncwave' });
    const svelteStore = createSvelteStore(store);
    const selected = selectStoreValue(store, 'count');

    let stateCount = -1;
    let selectedCount = -1;
    const unsubscribeState = svelteStore.subscribe((state) => {
      stateCount = state.count;
    });
    const unsubscribeSelected = selected.subscribe((value) => {
      selectedCount = value;
    });

    svelteStore.set('count', 4);

    expect(stateCount).toBe(4);
    expect(selectedCount).toBe(4);

    unsubscribeState();
    unsubscribeSelected();
  });
});
