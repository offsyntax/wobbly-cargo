import { describe, expect, it } from 'vitest';
import { Box, Vec2 } from 'planck';
import { FixedStepper, createWorld } from './world';
import { FIXED_DT } from './constants';

function makeSim() {
  const world = createWorld();
  const ground = world.createBody();
  ground.createFixture(new Box(50, 1, new Vec2(0, -1), 0));
  const body = world.createBody({ type: 'dynamic', position: new Vec2(0, 10) });
  body.createFixture(new Box(0.5, 0.5), { density: 1, friction: 0.3 });
  return { stepper: new FixedStepper(world), body };
}

describe('FixedStepper', () => {
  it('is deterministic for identical inputs', () => {
    const a = makeSim();
    const b = makeSim();
    for (let i = 0; i < 300; i++) {
      a.stepper.advance(FIXED_DT);
      b.stepper.advance(FIXED_DT);
    }
    expect(a.body.getPosition().y).toBe(b.body.getPosition().y);
    expect(a.body.getPosition().x).toBe(b.body.getPosition().x);
    expect(a.body.getPosition().y).toBeLessThan(10);
  });

  it('accumulates partial frames', () => {
    const { stepper } = makeSim();
    expect(stepper.advance(FIXED_DT * 0.5)).toBe(0);
    expect(stepper.advance(FIXED_DT * 0.6)).toBe(1);
    expect(stepper.alpha).toBeCloseTo(0.1, 5);
  });

  it('clamps steps per frame and drops backlog', () => {
    const { stepper } = makeSim();
    expect(stepper.advance(10)).toBe(stepper.maxSteps);
    expect(stepper.advance(0)).toBe(0);
  });

  it('does nothing while paused', () => {
    const { stepper, body } = makeSim();
    stepper.paused = true;
    expect(stepper.advance(1)).toBe(0);
    expect(body.getPosition().y).toBe(10);
  });
});
