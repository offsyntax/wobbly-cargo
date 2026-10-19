import { describe, expect, it } from 'vitest';
import { Vec2 } from 'planck';
import test01 from '../levels/test-01.json';
import { GameSim } from './game';
import { LevelGeometry, smoothChain, type LevelData, type Pt } from './level';
import type { SimEvent } from './types';
import { FIXED_DT } from './constants';
import { EGG } from '../data/cargo';

function level(terrain: (Pt | null)[], over: Partial<LevelData> = {}): LevelData {
  return {
    id: 'unit',
    world: 'city',
    terrain,
    start: [3, 0],
    finishX: 1000,
    cargo: 'egg',
    cargoCount: 3,
    coins: [],
    props: [],
    parTimeSec: 30,
    ...over,
  };
}

const FLAT: Pt[] = [[-20, 0], [400, 0]];

function run(sim: GameSim, steps: number, hold: boolean | ((i: number) => boolean)): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < steps; i++) {
    sim.step({ hold: typeof hold === 'function' ? hold(i) : hold });
    out.push(...sim.drainEvents());
  }
  return out;
}

/** Rotate the whole vehicle + cargo by `angle` about the chassis position. */
function rotateRig(sim: GameSim, angle: number, lift = 0): void {
  const c = sim.vehicle.chassis.getPosition().clone();
  const bodies = [sim.vehicle.chassis, ...sim.vehicle.wheels, ...sim.cargo.map((u) => u.body!)];
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  for (const b of bodies) {
    const p = b.getPosition();
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    b.setTransform(new Vec2(c.x + dx * cos - dy * sin, c.y + lift + dx * sin + dy * cos), b.getAngle() + angle);
  }
}

describe('level loader', () => {
  it('smooths through the control points and splits chains at null (gap)', () => {
    const pts: Pt[] = [[0, 0], [10, 2], [20, 0]];
    const s = smoothChain(pts, 8);
    expect(s.length).toBe(17);
    expect(s[8]).toEqual([10, 2]);
    const g = new LevelGeometry(level([[0, 0], [10, 0], null, [14, 1], [30, 1]]));
    expect(g.chains.length).toBe(2);
    expect(g.isGap(12)).toBe(true);
    expect(g.groundHeightAt(5)).toBeCloseTo(0);
    expect(g.groundHeightAt(12)).toBeCloseTo(0.5); // gaps interpolate for the camera
    expect(g.groundHeightAt(20)).toBeCloseTo(1);
  });

  it('includes props in groundHeightAt', () => {
    const g = new LevelGeometry(level(FLAT, { props: [{ type: 'ramp', x: 10, w: 4, h: 1 }] }));
    expect(g.groundHeightAt(12)).toBeCloseTo(0.5);
    expect(g.groundHeightAt(15)).toBeCloseTo(0);
  });
});

describe('GameSim', () => {
  it('is deterministic: same level + inputs give identical results', () => {
    const play = () => {
      const sim = new GameSim(test01 as LevelData);
      let seed = 12345;
      const events = run(sim, 600, () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed % 100 < 70;
      });
      return { bodies: sim.bodies, cargo: sim.cargoState(), tel: sim.telemetry(), events };
    };
    const a = play();
    const b = play();
    expect(a.bodies.chassis.x).toBeGreaterThan(10);
    expect(b).toEqual(a);
  });

  it('accelerates on flat ground while held and stops without reversing on release', () => {
    const sim = new GameSim(level(FLAT));
    run(sim, 180, true);
    const t = sim.telemetry();
    expect(t.speed).toBeGreaterThan(5);
    expect(t.rearWheelAngVel).toBeGreaterThan(0);
    let minSpeed = Infinity;
    let prevX = -Infinity;
    let stoppedX = 0;
    for (let i = 0; i < 600; i++) {
      sim.step({ hold: false });
      const v = sim.telemetry().speed;
      minSpeed = Math.min(minSpeed, v);
      if (i > 0) expect(sim.telemetry().x).toBeGreaterThanOrEqual(prevX - 0.01);
      prevX = sim.telemetry().x;
      if (i === 500) stoppedX = prevX;
    }
    expect(Math.abs(sim.telemetry().speed)).toBeLessThan(0.05);
    expect(minSpeed).toBeGreaterThan(-0.1);
    expect(Math.abs(sim.telemetry().x - stoppedX)).toBeLessThan(0.05);
  });

  it('air control: hold rotates nose up, release rotates nose forward', () => {
    const air = (hold: boolean) => {
      const sim = new GameSim(level(FLAT, { start: [3, 60] }));
      run(sim, 30, hold);
      expect(sim.telemetry().airborne).toBe(true);
      return sim.vehicle.chassis.getAngularVelocity();
    };
    expect(air(true)).toBeGreaterThan(1);
    const w = air(false);
    expect(w).toBeLessThan(-0.3);
    expect(w).toBeGreaterThan(-2); // slower than nose-up
  });

  it('a hard drop breaks an egg', () => {
    const sim = new GameSim(level(FLAT, { start: [3, 4.5] }));
    const ev = run(sim, 180, false);
    expect(ev.some((e) => e.type === 'cargoBreak')).toBe(true);
    expect(ev.some((e) => e.type === 'land')).toBe(true);
  });

  it('a gentle drive over low hills does not break eggs', () => {
    const hills: Pt[] = [[-20, 0], [10, 0], [20, 0.6], [30, 0], [40, 0.8], [50, 0], [80, 0]];
    const sim = new GameSim(level(hills, { finishX: 70 }));
    const ev = run(sim, 60 * 30, () => sim.telemetry().speed < 5);
    expect(ev.filter((e) => e.type === 'cargoBreak' || e.type === 'cargoLost')).toEqual([]);
    expect(ev.find((e) => e.type === 'finish')).toMatchObject({ stars: 3 });
  });

  it('an egg outside the bed is lost after 0.5 s and removed', () => {
    const sim = new GameSim(level(FLAT));
    run(sim, 40, false);
    const egg = sim.cargo[1].body!;
    egg.setTransform(new Vec2(sim.telemetry().x + 6, 0.3), 0);
    egg.setLinearVelocity(new Vec2(0, 0));
    let lostAt = -1;
    for (let i = 1; i <= 60 && lostAt < 0; i++) {
      sim.step({ hold: false });
      if (sim.drainEvents().some((e) => e.type === 'cargoLost' && e.index === 1)) lostAt = i * FIXED_DT;
    }
    expect(lostAt).toBeGreaterThan(EGG.lostAfterSec);
    expect(lostAt).toBeLessThan(EGG.lostAfterSec + 0.05);
    expect(sim.cargo[1].body).toBeNull();
    expect(sim.cargoState()[1].status).toBe('lost');
    expect(sim.bodies.cargo[1]).toBeNull();
  });

  it('fails when the roof touches the ground for > 0.4 s', () => {
    const sim = new GameSim(level(FLAT));
    run(sim, 30, false);
    rotateRig(sim, Math.PI, 0.3);
    const ev = run(sim, 120, false);
    const fail = ev.find((e) => e.type === 'fail');
    expect(fail).toEqual({ type: 'fail', reason: 'flipped' });
    expect(sim.status).toBe('failed');
  });

  it('fails when the vehicle falls below the map', () => {
    const sim = new GameSim(level([[-20, 0], [10, 0], null, [40, 0], [100, 0]]));
    const ev = run(sim, 60 * 10, true);
    expect(ev.filter((e) => e.type === 'fail')).toEqual([{ type: 'fail', reason: 'fell' }]);
  });

  it('fails when all cargo is lost', () => {
    const sim = new GameSim(level(FLAT));
    run(sim, 30, false);
    for (const u of sim.cargo) u.body!.setTransform(new Vec2(-15, 0.3), 0);
    const ev = run(sim, 60, false);
    expect(ev.filter((e) => e.type === 'cargoLost').length).toBe(3);
    expect(ev.at(-1)).toEqual({ type: 'fail', reason: 'cargo' });
  });

  it('finishes at finishX with 3 stars, or 2 stars after losing one egg', () => {
    const a = new GameSim(level(FLAT, { finishX: 20 }));
    const evA = run(a, 60 * 15, () => a.telemetry().speed < 6);
    const fin = evA.find((e) => e.type === 'finish');
    expect(fin).toMatchObject({ type: 'finish', stars: 3 });
    expect(a.telemetry().x).toBeGreaterThanOrEqual(20);
    expect(evA.filter((e) => e.type === 'finish').length).toBe(1);

    const b = new GameSim(level(FLAT, { finishX: 20 }));
    run(b, 30, false);
    b.cargo[0].body!.setTransform(new Vec2(-15, 0.3), 0);
    const evB = run(b, 60 * 15, () => b.telemetry().speed < 6);
    expect(evB.find((e) => e.type === 'finish')).toMatchObject({ stars: 2 });
  });

  it('runs test-01 with the bot policy to >= 2 stars', () => {
    const sim = new GameSim(test01 as LevelData);
    for (let i = 0; i < 60 * 120 && sim.status === 'running'; i++) {
      const t = sim.telemetry();
      sim.step({ hold: t.airborne ? Math.atan2(Math.sin(t.angle), Math.cos(t.angle)) < 0.2 : t.speed < 7 });
    }
    expect(sim.status).toBe('finished');
    expect(sim.stars).toBeGreaterThanOrEqual(2);
  });
});
