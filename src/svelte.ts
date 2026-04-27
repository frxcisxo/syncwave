import { Store } from './store';
import { StateEvent } from './types';

export type Unsubscriber = () => void;
export type Subscriber<T> = (value: T) => void;

export interface Readable<T> {
  subscribe(run: Subscriber<T>): Unsubscriber;
}

export interface SyncwaveSvelteStore<T extends Record<string, any>>
  extends Readable<T> {
  get(): T;
  set(path: string, value: unknown): void;
  merge(value: Partial<T>): void;
  undo(): void;
  redo(): void;
}

export function createSvelteStore<T extends Record<string, any>>(
  store: Store<T>
): SyncwaveSvelteStore<T> {
  return {
    subscribe(run) {
      run(store.getState());
      return store.subscribe((state) => run(state));
    },
    get() {
      return store.getState();
    },
    set(path, value) {
      store.set(path, value);
    },
    merge(value) {
      store.merge(value);
    },
    undo() {
      store.undo();
    },
    redo() {
      store.redo();
    },
  };
}

export function selectStoreValue<T extends Record<string, any>, V = any>(
  store: Store<T>,
  path: string
): Readable<V> {
  return {
    subscribe(run) {
      run(store.getValue(path));
      return store.subscribe(() => run(store.getValue(path)));
    },
  };
}

export function createHistoryStore(store: Store<any>): Readable<StateEvent[]> {
  return {
    subscribe(run) {
      run(store.getHistory());
      return store.onEvent(() => run(store.getHistory()));
    },
  };
}
