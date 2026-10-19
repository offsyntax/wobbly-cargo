import type { Platform } from './Platform';

export const SAVE_KEY = 'wobbly-cargo:save';

/** Minimal storage surface so tests can stub it. */
export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class LocalPlatform implements Platform {
  readonly name = 'local';
  private pauseCbs: Array<() => void> = [];
  private resumeCbs: Array<() => void> = [];
  private audioCbs: Array<(enabled: boolean) => void> = [];

  constructor(private readonly storage: KV | null = safeStorage()) {}

  async init(): Promise<void> {
    if (typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', () => {
      const list = document.hidden ? this.pauseCbs : this.resumeCbs;
      list.forEach((cb) => cb());
    });
  }

  gameReady(): void {
    // Nothing to report in dev.
  }

  async loadSave(): Promise<unknown | null> {
    try {
      const raw = this.storage?.getItem(SAVE_KEY);
      return raw ? (JSON.parse(raw) as unknown) : null;
    } catch {
      return null;
    }
  }

  async save(data: unknown): Promise<void> {
    try {
      this.storage?.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      // Storage full or blocked: saving is best effort.
    }
  }

  onPause(cb: () => void): void {
    this.pauseCbs.push(cb);
  }
  onResume(cb: () => void): void {
    this.resumeCbs.push(cb);
  }
  onAudioChange(cb: (enabled: boolean) => void): void {
    this.audioCbs.push(cb);
  }
  isAudioEnabled(): boolean {
    return true;
  }

  async showInterstitial(): Promise<void> {}

  showRewarded(): Promise<boolean> {
    return new Promise((resolve) => setTimeout(() => resolve(true), 300));
  }
}

function safeStorage(): KV | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
