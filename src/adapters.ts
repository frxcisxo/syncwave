import type { StorageAdapter } from './types';

/**
 * IndexedDB Adapter
 * 
 * For browser storage - handles offline persistence
 * Stores both snapshots and event history
 */
export class IndexedDBAdapter implements StorageAdapter {
  private dbName: string;
  private storeName: string;
  private db: IDBDatabase | null = null;

  constructor(dbName: string = 'syncwave', storeName: string = 'state') {
    this.dbName = dbName;
    this.storeName = storeName;
  }

  /**
   * Initialize database
   */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
    });
  }

  async get(key: string): Promise<string | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async set(key: string, value: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(value, key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async delete(key: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async clear(): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Close database
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

/**
 * LocalStorage Adapter
 * 
 * Simple implementation for testing and small data
 * Not recommended for large state (localStorage has ~5-10MB limit)
 */
export class LocalStorageAdapter implements StorageAdapter {
  private prefix: string;

  constructor(prefix: string = 'syncwave:') {
    this.prefix = prefix;
  }

  async get(key: string): Promise<string | null> {
    try {
      return localStorage.getItem(this.prefix + key);
    } catch (error) {
      console.error('LocalStorage get error:', error);
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    try {
      localStorage.setItem(this.prefix + key, value);
    } catch (error) {
      console.error('LocalStorage set error:', error);
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        console.warn('LocalStorage quota exceeded');
      }
    }
  }

  async delete(key: string): Promise<void> {
    try {
      localStorage.removeItem(this.prefix + key);
    } catch (error) {
      console.error('LocalStorage delete error:', error);
    }
  }

  async clear(): Promise<void> {
    try {
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        if (key.startsWith(this.prefix)) {
          localStorage.removeItem(key);
        }
      }
    } catch (error) {
      console.error('LocalStorage clear error:', error);
    }
  }
}

/**
 * AsyncStorage Adapter
 * 
 * For React Native - compatible with AsyncStorage
 */
export class AsyncStorageAdapter implements StorageAdapter {
  private storage: any;
  private prefix: string;

  constructor(asyncStorage: any, prefix: string = 'syncwave:') {
    this.storage = asyncStorage;
    this.prefix = prefix;
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.storage.getItem(this.prefix + key);
    } catch (error) {
      console.error('AsyncStorage get error:', error);
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    try {
      await this.storage.setItem(this.prefix + key, value);
    } catch (error) {
      console.error('AsyncStorage set error:', error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.storage.removeItem(this.prefix + key);
    } catch (error) {
      console.error('AsyncStorage delete error:', error);
    }
  }

  async clear(): Promise<void> {
    try {
      const keys = await this.storage.getAllKeys();
      const toDelete = keys.filter((k: string) => k.startsWith(this.prefix));
      await this.storage.multiRemove(toDelete);
    } catch (error) {
      console.error('AsyncStorage clear error:', error);
    }
  }
}

/**
 * Memory Adapter
 * 
 * For testing - stores in memory (loses on reload)
 */
export class MemoryAdapter implements StorageAdapter {
  private data = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.data.get(key) || null;
  }

  async set(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }

  async clear(): Promise<void> {
    this.data.clear();
  }
}
