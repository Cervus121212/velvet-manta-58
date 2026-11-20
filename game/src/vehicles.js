// vehicles — car meshes, the 14-car traffic flow and parked mission cars.
// Traffic drives the road grid: along a road line, turning at
// intersections, slowing for the car ahead.
import * as THREE from '../vendor/three.module.min.js';
import { WORLD, TRAFFIC_COUNT } from './config.js';
import { carMesh } from './meshkit.js';
import { roadLines } from './world.js';

const TRAFFIC_COLORS = [0xc94f3d, 0x3d7ac9, 0xd8d3c3, 0x2a2f38, 0x7ac93d, 0xc9a13d, 0x8a5ac9, 0xe8e8e8];

export function makeCar(ctx, x, z, heading, colorHex, kind = 'sedan') {
  const mesh = carMesh(colorHex, kind);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  ctx.scene.add(mesh);
  const car = { mesh, x, z, heading, speed: 0, kind, color: colorHex, parked: false };
  return car;
}

export function syncCar(car) {
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
}

export function createTraffic(ctx) {
  const lines = roadLines();
  const traffic = [];
  for (let i = 0; i < TRAFFIC_COUNT; i++) {
    const axis = ctx.rng.chance(0.5) ? 'x' : 'z';
    const line = ctx.rng.pick(lines);
    const along = ctx.rng.range(-WORLD.half + 20, WORLD.half - 20);
    const dir = ctx.rng.chance(0.5) ? 1 : -1;
    const lane = dir > 0 ? 3.5 : -3.5;
    const car = makeCar(ctx, 0, 0, 0, ctx.rng.pick(TRAFFIC_COLORS), 'sedan');
    car.axis = axis; car.dir = dir; car.lane = lane; car.line = line;
    car.cruise = ctx.rng.range(6, 11);
    if (axis === 'x') { car.x = along; car.z = line + lane; car.heading = dir > 0 ? 0 : Math.PI; }
    else { car.x = line + lane; car.z = along; car.heading = dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
    car.speed = car.cruise;
    syncCar(car);
    traffic.push(car);
  }
  ctx.traffic = traffic;
  return traffic;
}

function nearestLine(v) {
  let best = roadLines()[0], bd = 1e9;
  for (const l of roadLines()) { const d = Math.abs(v - l); if (d < bd) { bd = d; best = l; } }
  return best;
}

export function updateTraffic(ctx, dt) {
  const lines = roadLines();
  for (const car of ctx.traffic) {
    // slow for the player's car ahead
    let target = car.cruise;
    const pc = ctx.playerCar;
    if (pc) {
      const dx = pc.x - car.x, dz = pc.z - car.z;
      const ahead = car.axis === 'x' ? dx * car.dir : dz * car.dir;
      const lateral = car.axis === 'x' ? Math.abs(dz) : Math.abs(dx);
      if (ahead > 0 && ahead < 10 && lateral < 4) target = 0;
    }
    car.speed += (target - car.speed) * Math.min(1, dt * 2);
    const step = car.speed * car.dir * dt;
    if (car.axis === 'x') car.x += step; else car.z += step;
    const along = car.axis === 'x' ? car.x : car.z;
    // at an intersection, sometimes turn onto the cross road
    const cross = nearestLine(along);
    if (Math.abs(along - cross) < 1.2 && ctx.rng.chance(dt * 0.25)) {
      const oldAxis = car.axis;
      car.axis = oldAxis === 'x' ? 'z' : 'x';
      car.dir = ctx.rng.chance(0.5) ? 1 : -1;
      car.lane = car.dir > 0 ? 3.5 : -3.5;
      car.line = cross;
      if (car.axis === 'x') { car.z = cross + car.lane; car.heading = car.dir > 0 ? 0 : Math.PI; }
      else { car.x = cross + car.lane; car.heading = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
    } else {
      if (car.axis === 'x') { car.z = car.line + car.lane; car.heading = car.dir > 0 ? 0 : Math.PI; }
      else { car.x = car.line + car.lane; car.heading = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
    }
    // bounce at the city edge
    if (along > WORLD.half - 6 || along < -WORLD.half + 6) {
      car.dir *= -1; car.lane = -car.lane;
    }
    syncCar(car);
  }
}

// A parked car the player can steal (mission sedan / van / garage coupe).
export function spawnParkedCar(ctx, x, z, heading, colorHex, kind) {
  const car = makeCar(ctx, x, z, heading, colorHex, kind);
  car.parked = true;
  ctx.parkedCars.push(car);
  return car;
}

export function removeCar(ctx, car) {
  ctx.scene.remove(car.mesh);
  const list = ctx.parkedCars;
  const i = list.indexOf(car);
  if (i >= 0) list.splice(i, 1);
}
