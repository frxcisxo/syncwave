/**
 * Utility functions for Syncwave
 */

const hasOwn = Object.prototype.hasOwnProperty;

function isObjectLike(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object';
}

function cloneContainer<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.slice() as T;
  }

  if (isObjectLike(value)) {
    return { ...value } as T;
  }

  return {} as T;
}

/**
 * Generate unique ID using timestamp + random
 * Good for distributed systems, minimal collision
 */
export function generateId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${random}`;
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime()) as any;
  if (Array.isArray(obj)) return obj.map((item) => deepClone(item)) as any;
  if (obj instanceof Object) {
    const clonedObj = {} as T;
    for (const key in obj) {
      if (hasOwn.call(obj, key)) {
        clonedObj[key] = deepClone(obj[key]);
      }
    }
    return clonedObj;
  }
  return obj;
}

/**
 * Deep merge two objects (right overwrites left)
 */
export function deepMerge<T>(left: T, right: Partial<T>): T {
  const mergeValues = (target: any, source: any): any => {
    if (!isObjectLike(source) || Array.isArray(source)) {
      return deepEqual(target, source) ? target : deepClone(source);
    }

    const base = isObjectLike(target) && !Array.isArray(target) ? target : {};
    let result = base;
    let changed = !isObjectLike(target) || Array.isArray(target);

    for (const key in source) {
      if (!hasOwn.call(source, key)) continue;

      const currentValue = base[key];
      const nextValue = mergeValues(currentValue, source[key]);

      if (nextValue !== currentValue) {
        if (!changed) {
          result = { ...base };
          changed = true;
        }
        result[key] = nextValue;
      }
    }

    return changed ? result : target;
  };

  return mergeValues(left, right);
}

/**
 * Check if two values are deeply equal
 */
export function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  if (a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!deepEqual(a[key], b[key])) return false;
  }

  return true;
}

/**
 * Get value at path in object
 */
export function getAtPath(obj: any, path: string): any {
  const parts = path.split('.');
  let current = obj;

  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }

  return current;
}

/**
 * Set value at path in object
 */
export function setAtPath(obj: any, path: string, value: any): any {
  const parts = path.split('.');

  const update = (current: any, index: number): any => {
    const key = parts[index];
    const container = isObjectLike(current) ? current : {};

    if (index === parts.length - 1) {
      const existingValue = container[key];
      if (deepEqual(existingValue, value)) {
        return current;
      }

      const clone = cloneContainer(container);
      clone[key] = deepClone(value);
      return clone;
    }

    const existingChild = container[key];
    const nextChild = update(existingChild, index + 1);

    if (nextChild === existingChild) {
      return current;
    }

    const clone = cloneContainer(container);
    clone[key] = nextChild;
    return clone;
  };

  return update(obj, 0);
}

/**
 * Delete value at path in object
 */
export function deleteAtPath(obj: any, path: string): any {
  const parts = path.split('.');

  const remove = (current: any, index: number): any => {
    if (!isObjectLike(current)) {
      return current;
    }

    const key = parts[index];
    if (!hasOwn.call(current, key)) {
      return current;
    }

    if (index === parts.length - 1) {
      const clone = cloneContainer(current);
      delete clone[key];
      return clone;
    }

    const existingChild = current[key];
    const nextChild = remove(existingChild, index + 1);

    if (nextChild === existingChild) {
      return current;
    }

    const clone = cloneContainer(current);
    clone[key] = nextChild;
    return clone;
  };

  return remove(obj, 0);
}

/**
 * Debounce function execution
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
}

/**
 * Create a simple observable
 */
export class Observable<T> {
  private listeners: Set<(value: T) => void> = new Set();

  subscribe(listener: (value: T) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(value: T): void {
    this.listeners.forEach((listener) => listener(value));
  }

  clear(): void {
    this.listeners.clear();
  }
}

/**
 * Create a unique session ID
 */
export function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).substring(2)}`;
}
