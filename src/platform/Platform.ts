/** Everything game code may ask of the host portal. Game code imports only from src/platform. */
export interface Platform {
  readonly name: string;
  init(): Promise<void>;
  gameReady(): void;
  loadSave(): Promise<unknown | null>;
  save(data: unknown): Promise<void>;
  onPause(cb: () => void): void;
  onResume(cb: () => void): void;
  onAudioChange(cb: (enabled: boolean) => void): void;
  isAudioEnabled(): boolean;
  showInterstitial(): Promise<void>;
  showRewarded(): Promise<boolean>;
}
