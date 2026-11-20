// player — Dante on foot and behind the wheel: arcade driving, entering
// and stealing cars, pistol / SMG combat. All input flows through ctx.keys,
// so the autopilot drives the same code paths as a human.
import { WORLD } from './config.js';
import { resolveCircle } from './world.js';
import { syncCar, removeCar } from './vehicles.js';
import { damageEnemy, damagePlayer } from './people.js';

export function createPlayer(ctx) {
  ctx.player = {
    x: WORLD.spawn.x, z: WORLD.spawn.z, heading: Math.PI / 2,
    speed: 0, onFoot: true, car: null,
    health: 100, armour: 0, weapon: 'pistol', smgAmmo: 60,
    shootCd: 0, walkBob: 0,
  };
  ctx.playerCar = null;
  return ctx.player;
}

function nearestCar(ctx, maxD) {
  let best = null, bd = maxD;
  const cars = [...ctx.parkedCars, ...ctx.traffic];
  if (ctx.playerCar) cars.push(ctx.playerCar);
  for (const c of cars) {
    if (c === ctx.player.car) continue;
    const d = Math.hypot(c.x - ctx.player.x, c.z - ctx.player.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

function tryEnterCar(ctx) {
  const car = nearestCar(ctx, 4.2);
  if (!car) { ctx.hud.showMessage('No car in reach'); return false; }
  const stolen = car.parked || ctx.traffic.includes(car);
  if (ctx.traffic.includes(car)) {
    const i = ctx.traffic.indexOf(car);
    ctx.traffic.splice(i, 1);
    ctx.hud.showMessage('You jacked a car!');
  }
  // the car leaves the parked list when driven — otherwise every
  // exit/enter cycle leaves a stale ghost entry behind it
  const pi = ctx.parkedCars.indexOf(car);
  if (pi >= 0) ctx.parkedCars.splice(pi, 1);
  car.parked = false;
  ctx.player.car = car;
  ctx.playerCar = car;
  ctx.player.onFoot = false;
  ctx.player.x = car.x; ctx.player.z = car.z; ctx.player.heading = car.heading;
  ctx.player.speed = 0;
  if (stolen && ctx.stars < 1) ctx.police.addStars(ctx, 1);
  ctx.audio.blip(520);
  ctx.missions.onEnterCar(ctx, car);
  return true;
}

function tryExitCar(ctx) {
  const car = ctx.player.car;
  if (!car) return false;
  car.speed = 0;
  car.parked = true;
  ctx.parkedCars.push(car);
  const sx = Math.sin(ctx.player.heading + Math.PI / 2), sz = Math.cos(ctx.player.heading + Math.PI / 2);
  ctx.player.x = car.x + sx * 2.4; ctx.player.z = car.z + sz * 2.4;
  ctx.player.onFoot = true;
  ctx.player.car = null;
  ctx.playerCar = null;
  ctx.player.speed = 0;
  ctx.audio.blip(440);
  return true;
}

function shoot(ctx) {
  const p = ctx.player;
  if (p.shootCd > 0) return;
  const isSmg = p.weapon === 'smg';
  if (isSmg && p.smgAmmo <= 0) { ctx.hud.showMessage('SMG out of ammo — press 1 for pistol'); p.weapon = 'pistol'; return; }
  p.shootCd = isSmg ? 0.12 : 0.35;
  if (isSmg) p.smgAmmo -= 1;
  ctx.audio.shot(isSmg);
  ctx.hud.showMuzzle();
  // hit scan: nearest enemy within a 12-degree cone, 34 m out
  const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
  let best = null, bd = 34;
  for (const e of ctx.enemies) {
    if (!e.alive) continue;
    const dx = e.x - p.x, dz = e.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > 34) continue;
    const dot = (dx * fx + dz * fz) / (d || 1);
    if (dot > 0.985 && d < bd) { bd = d; best = e; }
  }
  if (best) {
    const killed = damageEnemy(ctx, best, isSmg ? 20 : 34);
    ctx.hud.showMessage(killed ? 'Target down.' : 'Hit!');
    ctx.missions.onKill(ctx, best);
  }
}

export function updatePlayer(ctx, dt) {
  const p = ctx.player;
  const k = ctx.keys;
  p.shootCd = Math.max(0, p.shootCd - dt);

  if (k['KeyE'] && !ctx._eLatch) { ctx._eLatch = true; p.onFoot ? tryEnterCar(ctx) : tryExitCar(ctx); }
  if (!k['KeyE']) ctx._eLatch = false;
  if (k['Digit1']) { p.weapon = 'pistol'; }
  if (k['Digit2'] && p.smgAmmo > 0) { p.weapon = 'smg'; }
  if ((k['KeyF'] || k['Mouse0']) && p.onFoot) shoot(ctx);

  if (p.onFoot) {
    // on foot: W/S forward/back, A/D turn, Shift sprint
    const sprint = k['ShiftLeft'] || k['ShiftRight'] ? 1.7 : 1;
    const turn = (k['KeyA'] ? 1 : 0) - (k['KeyD'] ? 1 : 0);
    p.heading += turn * 2.6 * dt;
    const fwd = (k['KeyW'] ? 1 : 0) - (k['KeyS'] ? 1 : 0);
    const sp = 5.2 * sprint * fwd;
    p.speed += (sp - p.speed) * Math.min(1, dt * 10);
    const nx = p.x + Math.sin(p.heading) * p.speed * dt;
    const nz = p.z + Math.cos(p.heading) * p.speed * dt;
    const fixed = resolveCircle(ctx, nx, nz, 0.6);
    if (fixed.hit) p.speed *= 0.4;
    p.x = fixed.x; p.z = fixed.z;
    p.walkBob += Math.abs(p.speed) * dt;
    // stay inside the playable area
    p.x = Math.max(-280, Math.min(280, p.x));
    p.z = Math.max(-280, Math.min(280, p.z));
  } else {
    // driving: arcade model with steering that bites harder at speed
    const car = p.car;
    const accel = k['KeyW'] ? 16 : 0;
    const brake = k['KeyS'] ? 26 : 0;
    const handbrake = k['Space'] ? 0.86 : 1;
    car.speed += (accel - brake) * dt;
    car.speed *= Math.pow(handbrake, dt * 8);
    car.speed -= car.speed * 0.35 * dt; // drag
    if (!k['KeyW'] && !k['KeyS']) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 6 * dt);
    car.speed = Math.max(-12, Math.min(34, car.speed));
    const steer = ((k['KeyA'] ? 1 : 0) - (k['KeyD'] ? 1 : 0)) * (car.speed >= 0 ? 1 : -1);
    // even creeping, the wheel still bites a little — otherwise a car
    // nosed into a wall at standstill can never turn away from it
    const grip = Math.max(0.35, Math.min(1, Math.abs(car.speed) / 8));
    car.heading += steer * 1.9 * grip * dt * (k['Space'] ? 1.5 : 1);
    const nx = car.x + Math.sin(car.heading) * car.speed * dt;
    const nz = car.z + Math.cos(car.heading) * car.speed * dt;
    const fixed = resolveCircle(ctx, nx, nz, 1.7);
    if (fixed.hit) {
      car.speed *= -0.25; // bounce off the wall
      ctx.hud.flashDamage();
    }
    car.x = fixed.x; car.z = fixed.z;
    // nudge traffic cars out of the way
    for (const t of ctx.traffic) {
      const d = Math.hypot(t.x - car.x, t.z - car.z);
      if (d < 3.4 && d > 0.01) {
        t.x += ((t.x - car.x) / d) * (3.4 - d);
        t.z += ((t.z - car.z) / d) * (3.4 - d);
        t.speed *= 0.5;
      }
    }
    p.x = car.x; p.z = car.z; p.heading = car.heading; p.speed = car.speed;
    syncCar(car);
    ctx.audio.setEngine(Math.abs(car.speed) / 34);
  }
}
