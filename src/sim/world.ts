import { World, Vec2 } from 'planck';
import { FIXED_DT, MAX_STEPS_PER_FRAME, POS_ITERS, VEL_ITERS } from './constants';

export function createWorld(): World {
  return new World({ gravity: new Vec2(0, -10) });
}

/** Fixed-step accumulator. Pure: no Phaser, no wall clock. */
export class FixedStepper {
  private acc = 0;
  paused = false;

  constructor(
    readonly world: World,
    readonly dt = FIXED_DT,
    readonly maxSteps = MAX_STEPS_PER_FRAME,
  ) {}

  /** Advance by frameSeconds of real time; returns number of sim steps taken. */
  advance(frameSeconds: number, onStep?: () => void): number {
    if (this.paused) return 0;
    this.acc += Math.max(0, frameSeconds);
    let steps = 0;
    while (this.acc >= this.dt && steps < this.maxSteps) {
      this.world.step(this.dt, VEL_ITERS, POS_ITERS);
      this.acc -= this.dt;
      steps++;
      onStep?.();
    }
    // Drop backlog beyond the clamp so we never spiral.
    if (steps === this.maxSteps && this.acc >= this.dt) this.acc = 0;
    return steps;
  }

  /** Leftover fraction of a step, for render interpolation. */
  get alpha(): number {
    return this.acc / this.dt;
  }
}
