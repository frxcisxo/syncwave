/**
 * React Hooks for Syncwave
 *
 * Provides seamless integration with React components
 *
 * Usage:
 * ```tsx
 * import { useStore } from 'syncwave/react';
 *
 * function TodoApp() {
 *   const store = useStore(initialState);
 *   const state = useStoreState(store);
 *
 *   return (
 *     <div>
 *       <h1>{state.user.name}</h1>
 *     </div>
 *   );
 * }
 * ```
 */

import {
  useEffect,
  useState,
  useCallback,
  useRef,
  ReactNode,
  createContext,
  useContext,
} from 'react';
import type { Store, SyncConfig } from './index';
import { createStore } from './store';

/**
 * Hook: Get current state and auto-update on changes
 *
 * ```tsx
 * const store = useStore({ count: 0 });
 * const state = useStoreState(store);
 *
 * return <div>{state.count}</div>;
 * ```
 */
export function useStoreState<T extends Record<string, any>>(store: Store<T>): T {
  const [state, setState] = useState(() => store.getState());

  useEffect(() => {
    const unsubscribe = store.subscribe((newState) => {
      setState(newState);
    });

    return unsubscribe;
  }, [store]);

  return state;
}

/**
 * Hook: Create and manage a store
 *
 * ```tsx
 * const store = useStore({ todos: [], count: 0 }, {
 *   offline: true,
 *   undoRedo: true
 * });
 * ```
 */
export function useStore<T extends Record<string, any>>(
  initialState: T,
  config?: SyncConfig
): Store<T> {
  const storeRef = useRef<Store<T> | null>(null);

  if (!storeRef.current) {
    storeRef.current = createStore(initialState, config);
  }

  return storeRef.current;
}

/**
 * Hook: Set a value in the store
 *
 * ```tsx
 * const setValue = useSetValue(store);
 *
 * <button onClick={() => setValue('count', 42)}>
 *   Set count to 42
 * </button>
 * ```
 */
export function useSetValue<T extends Record<string, any>>(store: Store<T>) {
  return useCallback(
    <V = any>(path: string, value: V) => {
      store.set(path, value);
    },
    [store]
  );
}

/**
 * Hook: Get a specific value from store
 *
 * ```tsx
 * const count = useStoreValue(store, 'count');
 * const userName = useStoreValue(store, 'user.name');
 * ```
 */
export function useStoreValue<T extends Record<string, any>, V = any>(
  store: Store<T>,
  path: string
): V {
  const state = useStoreState(store);
  const getAtPath = (obj: any, pathStr: string) => {
    const parts = pathStr.split('.');
    let current = obj;
    for (const part of parts) {
      if (current == null) return undefined;
      current = current[part];
    }
    return current;
  };

  return getAtPath(state, path);
}

/**
 * Hook: Undo/Redo support
 *
 * ```tsx
 * const { undo, redo, canUndo, canRedo } = useUndoRedo(store);
 * ```
 */
export function useUndoRedo(store: Store<any>) {
  const history = useRef(store.getHistory());
  const [version, setVersion] = useState(store.getVersion());

  useEffect(() => {
    const unsubscribe = store.onEvent((event) => {
      history.current.push(event);
      setVersion(store.getVersion());
    });

    return unsubscribe;
  }, [store]);

  return {
    undo: () => {
      store.undo();
      setVersion(store.getVersion());
    },
    redo: () => {
      store.redo();
      setVersion(store.getVersion());
    },
    canUndo: version > 0,
    canRedo: history.current.length > version,
  };
}

/**
 * Hook: Subscribe to sync status
 *
 * ```tsx
 * const { isConnected, isSyncing } = useSyncStatus(store);
 * ```
 */
export function useSyncStatus(store: Store<any>) {
  const [status, setStatus] = useState({
    isConnected: false,
    isSyncing: false,
    queueSize: 0,
  });

  useEffect(() => {
    let updateInterval: NodeJS.Timeout;

    // Simulate sync status polling
    // In real implementation, this would come from SyncManager
    updateInterval = setInterval(() => {
      setStatus((prev) => ({
        ...prev,
        queueSize: 0, // Would come from SyncManager
      }));
    }, 1000);

    return () => clearInterval(updateInterval);
  }, [store]);

  return status;
}

/**
 * Hook: Subscribe to history changes
 *
 * ```tsx
 * const history = useHistory(store);
 * ```
 */
export function useHistory(store: Store<any>) {
  const [history, setHistory] = useState(() => store.getHistory());

  useEffect(() => {
    const unsubscribe = store.onEvent(() => {
      setHistory(store.getHistory());
    });

    return unsubscribe;
  }, [store]);

  return history;
}

/**
 * Hook: Watch specific path for changes
 *
 * ```tsx
 * useWatch(store, 'user.name', (newValue, oldValue) => {
 *   console.log('Name changed from', oldValue, 'to', newValue);
 * });
 * ```
 */
export function useWatch<T extends Record<string, any>, V = any>(
  store: Store<T>,
  path: string,
  callback: (newValue: V, oldValue: V | undefined) => void
): void {
  const prevValueRef = useRef<V | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = store.subscribe((newState, oldState) => {
      const getAtPath = (obj: any, pathStr: string) => {
        const parts = pathStr.split('.');
        let current = obj;
        for (const part of parts) {
          current = current?.[part];
        }
        return current;
      };

      const newValue = getAtPath(newState, path) as V;

      if (newValue !== prevValueRef.current) {
        callback(newValue, prevValueRef.current);
        prevValueRef.current = newValue;
      }
    });

    return unsubscribe;
  }, [store, path, callback]);
}

/**
 * Context + Provider for easier use
 */
const StoreContext = createContext<Store<any> | null>(null);

export interface StoreProviderProps {
  store: Store<any>;
  children: ReactNode;
}

/**
 * Provider component
 *
 * ```tsx
 * <StoreProvider store={store}>
 *   <YourApp />
 * </StoreProvider>
 * ```
 */
export function StoreProvider({ store, children }: StoreProviderProps) {
  return (
    <StoreContext.Provider value={store}>
      {children}
    </StoreContext.Provider>
  );
}

/**
 * Hook: Use store from context
 *
 * ```tsx
 * const store = useContextStore();
 * ```
 */
export function useContextStore(): Store<any> {
  const store = useContext(StoreContext);
  if (!store) {
    throw new Error('useContextStore must be used within StoreProvider');
  }
  return store;
}

/**
 * Hook: Combine store from context with state
 *
 * ```tsx
 * const state = useContextState();
 * ```
 */
export function useContextState<T extends Record<string, any>>(): T {
  const store = useContextStore();
  return useStoreState(store) as T;
}
