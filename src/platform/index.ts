import type { Platform } from './Platform';
import { LocalPlatform } from './local';

export type { Platform } from './Platform';

let instance: Platform | null = null;

/** Returns the active adapter. The `playables` and `playgama` adapters are added in M3. */
export function getPlatform(): Platform {
  instance ??= new LocalPlatform();
  return instance;
}
