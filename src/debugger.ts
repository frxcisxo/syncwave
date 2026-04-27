import { Store } from './store';
import { StateEvent } from './types';

export interface TimeTravelFrame<T> {
  version: number;
  state: T;
  event?: StateEvent;
}

export class TimeTravelDebugger<T extends Record<string, any>> {
  constructor(private store: Store<T>) {}

  inspect(version: number = this.store.getVersion()): TimeTravelFrame<T> {
    const clampedVersion = Math.max(
      0,
      Math.min(version, this.store.getLatestVersion())
    );

    return {
      version: clampedVersion,
      state: this.store.getStateAtVersion(clampedVersion),
      event: this.store
        .getHistory()
        .find((entry) => entry.metadata.version === clampedVersion),
    };
  }

  list(): TimeTravelFrame<T>[] {
    const frames: TimeTravelFrame<T>[] = [{ version: 0, state: this.store.getStateAtVersion(0) }];

    for (let version = 1; version <= this.store.getLatestVersion(); version++) {
      frames.push(this.inspect(version));
    }

    return frames;
  }

  apply(version: number): T {
    this.store.travelTo(version);
    return this.store.getState();
  }

  stepBackward(): T {
    return this.apply(this.store.getVersion() - 1);
  }

  stepForward(): T {
    return this.apply(this.store.getVersion() + 1);
  }

  reset(): T {
    return this.apply(this.store.getLatestVersion());
  }
}

export function createTimeTravelDebugger<T extends Record<string, any>>(
  store: Store<T>
): TimeTravelDebugger<T> {
  return new TimeTravelDebugger(store);
}
