// police — the wanted system: stars, PVPD cruisers that chase, foot
// cops from 2 stars, the Air One helicopter from 3 stars, and heat that
// decays when the player breaks line of sight.
import * as THREE from '../vendor/three.module.min.js';
import { makeCar, syncCar } from './vehicles.js';
import { spawnFootCop } from './people.js';
import { resolveCircle, roadLines } from './world.js';

export function createPolice(ctx) {
  ctx.police = {
    decayT: 0, crimeT: 0, heliAngle: 0,
    addStars, setStars,
  };
  ctx.cruisers = [];
  ctx.cops = [];
  ctx.heli = null;
  return ctx.police;
}

function desiredCruisers(stars) { return Math.min(8, stars * 2); }
function desiredCops(stars) { return stars >= 2 ? 2 : 0; }

export function addStars(ctx, n) {
  ctx.stars = Math.min(5, ctx.stars + n);
  ctx.police.crimeT = 0;
  ctx.police.decayT = 0;
  if (n > 0) ctx.hud.flashStars();
}

export function setStars(ctx, n) {
  ctx.stars = Math.max(0, Math.min(5, n));
  ctx.police.crimeT = 0;
  ctx.police.decayT = 0;
}

function spawnCruiser(ctx) {
  const lines = roadLines();
  const line = lines[Math.floor(ctx.rng.next() * lines.length)];
  const axis = ctx.rng.chance(0.5) ? 'x' : 'z';
  const along = ctx.player.x + ctx.rng.range(30, 60) * (ctx.rng.chance(0.5) ? 1 : -1);
  const x = axis === 'x' ? along : line;
  const z = axis === 'x' ? line : along;
  const car = makeCar(ctx, x, z, 0, 0x1c2f4a, 'cruiser');
  car.axis = axis;
  ctx.cruisers.push(car);
  return car;
}

function spawnHeli(ctx) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(4.2, 1.6, 2.2),
    new THREE.MeshLambertMaterial({ color: 0x1c2f4a }),
  );
  body.position.y = 0;
  const tail = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 0.7, 0.7),
    new THREE.MeshLambertMaterial({ color: 0x1c2f4a }),
  );
  tail.position.set(-3.4, 0.3, 0);
  const rotor = new THREE.Mesh(
    new THREE.BoxGeometry(9, 0.12, 0.5),
    new THREE.MeshLambertMaterial({ color: 0x222222 }),
  );
  rotor.position.y = 1.1;
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(6, 26, 12, 1, true),
    new THREE.MeshLambertMaterial({ color: 0xfff6c8, transparent: true, opacity: 0.16 }),
  );
  cone.position.y = -14;
  cone.rotation.x = Math.PI;
  group.add(body, tail, rotor, cone);
  group.userData.rotor = rotor;
  ctx.scene.add(group);
  ctx.heli = { group, rotor, angle: 0, x: ctx.player.x, z: ctx.player.z };
  return ctx.heli;
}

export function updatePolice(ctx, dt) {
  const pol = ctx.police;
  pol.crimeT += dt;

  // --- cruisers ------------------------------------------------------
  const want = desiredCruisers(ctx.stars);
  while (ctx.cruisers.length < want) spawnCruiser(ctx);
  while (ctx.cruisers.length > want) {
    const c = ctx.cruisers.pop();
    ctx.scene.remove(c.mesh);
  }
  for (const c of ctx.cruisers) {
    const dx = ctx.player.x - c.x, dz = ctx.player.z - c.z;
    const d = Math.hypot(dx, dz);
    const wantHeading = Math.atan2(dx, dz);
    let dh = wantHeading - c.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    c.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, dh));
    const targetSpeed = d > 6 ? 24 : 10;
    c.speed += (targetSpeed - c.speed) * Math.min(1, dt * 1.5);
    const nx = c.x + Math.sin(c.heading) * c.speed * dt;
    const nz = c.z + Math.cos(c.heading) * c.speed * dt;
    const fixed = resolveCircle(ctx, nx, nz, 1.7);
    c.x = fixed.x; c.z = fixed.z;
    if (fixed.hit) c.speed *= 0.5;
    if (d < 4.5) { // ram: shove the player's car and slow it
      if (ctx.playerCar) ctx.playerCar.speed *= 0.94;
    }
    syncCar(c);
  }

  // --- foot cops -------------------------------------------------------
  const wantCops = desiredCops(ctx.stars);
  while (ctx.cops.length < wantCops) {
    spawnFootCop(ctx, ctx.player.x + ctx.rng.range(-14, 14), ctx.player.z + ctx.rng.range(-14, 14));
  }
  while (ctx.cops.length > wantCops) {
    const c = ctx.cops.pop();
    ctx.scene.remove(c.mesh);
  }

  // --- helicopter ------------------------------------------------------
  if (ctx.stars >= 3 && !ctx.heli) spawnHeli(ctx);
  if (ctx.stars < 3 && ctx.heli) { ctx.scene.remove(ctx.heli.group); ctx.heli = null; }
  if (ctx.heli) {
    pol.heliAngle += dt * 0.45;
    ctx.heli.angle = pol.heliAngle;
    ctx.heli.x = ctx.player.x + Math.cos(pol.heliAngle) * 26;
    ctx.heli.z = ctx.player.z + Math.sin(pol.heliAngle) * 26;
    ctx.heli.group.position.set(ctx.heli.x, 38, ctx.heli.z);
    ctx.heli.group.rotation.y = -pol.heliAngle;
    ctx.heli.rotor.rotation.y += dt * 18;
  }

  // --- heat decay: unseen + quiet for 6 s loses a star -----------------
  let nearest = 1e9;
  for (const c of ctx.cruisers) nearest = Math.min(nearest, Math.hypot(c.x - ctx.player.x, c.z - ctx.player.z));
  const seen = nearest < 25; // the heli watches, but only a cruiser on your tail keeps the heat up
  if (ctx.stars > 0 && !seen && pol.crimeT > 4) {
    pol.decayT += dt;
    if (pol.decayT >= 6) { ctx.stars -= 1; pol.decayT = 0; ctx.hud.showMessage('Heat cooling off…'); }
  } else {
    pol.decayT = 0;
  }

  ctx.audio.setSiren(ctx.stars >= 1);
}
