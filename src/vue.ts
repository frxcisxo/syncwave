import {
  computed,
  getCurrentScope,
  onScopeDispose,
  readonly,
  shallowRef,
  type ComputedRef,
  type ShallowRef,
} from 'vue';
import { createStore, Store } from './store';
import { SyncConfig, StateEvent } from './types';
import { getAtPath } from './utils';

function registerCleanup(cleanup: () => void): () => void {
  if (getCurrentScope()) {
    onScopeDispose(cleanup);
  }

  return cleanup;
}

export function useStore<T extends Record<string, any>>(
  initialState: T,
  config?: SyncConfig
): Store<T> {
  return createStore(initialState, config);
}

export function useStoreState<T extends Record<string, any>>(
  store: Store<T>
): Readonly<ShallowRef<T>> {
  const state = shallowRef(store.getState()) as ShallowRef<T>;
  registerCleanup(
    store.subscribe((nextState) => {
      state.value = nextState;
    })
  );
  return readonly(state) as Readonly<ShallowRef<T>>;
}

export function useStoreValue<T extends Record<string, any>, V = any>(
  store: Store<T>,
  path: string
): ComputedRef<V> {
  const state = useStoreState(store);
  return computed(() => getAtPath(state.value, path) as V);
}

export function useSubscribe<T extends Record<string, any>>(
  store: Store<T>,
  listener: (newState: T, oldState: T) => void
): () => void {
  return registerCleanup(store.subscribe(listener));
}

export function useHistory(
  store: Store<any>
): Readonly<ShallowRef<readonly StateEvent[]>> {
  const history = shallowRef(store.getHistory()) as ShallowRef<readonly StateEvent[]>;
  registerCleanup(
    store.onEvent(() => {
      history.value = store.getHistory();
    })
  );
  return readonly(history) as Readonly<ShallowRef<readonly StateEvent[]>>;
}
