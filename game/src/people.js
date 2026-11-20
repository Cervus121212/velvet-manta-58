// people — pedestrians on the sidewalks, foot cops who chase, and the
// armed dock guards of mission 4. Every person is one merged mesh.
import { WORLD, PED_COUNT } from './config.js';
import { personMesh } from './meshkit.js';
import { resolveCircle } from './world.js';

const SHIRTS = [0xc94f3d, 0x3d7ac9, 0x7ac93d, 0xe8dcc0, 0x8a5ac9, 0xd8a03d, 0x39d0ff, 0xff5a7a];

export function createPedestrians(ctx) {
  const peds = [];
  for (let i = 0; i < PED_COUNT; i++) {
    const mesh = personMesh(ctx.rng.pick(SHIRTS));
    const x = ctx.rng.range(-200, 200), z = ctx.rng.range(-200, 200);
    mesh.position.set(x, 0, z);
    ctx.scene.add(mesh);
    peds.push({
      mesh, x, z, heading: ctx.rng.range(0, Math.PI * 2),
      speed: ctx.rng.range(1.2, 2.2), target: null, panic: 0,
    });
  }
  ctx.peds = peds;
  return peds;
}

function pickStrollTarget(ped, rng) {
  return { x: Math.max(-205, Math.min(205, ped.x + rng.range(-60, 60))), z: Math.max(-205, Math.min(205, ped.z + rng.range(-60, 60))) };
}

export function updatePeds(ctx, dt) {
  for (const p of ctx.peds) {
    if (!p.target || Math.hypot(p.target.x - p.x, p.target.z - p.z) < 2) {
      p.target = pickStrollTarget(p, ctx.rng);
    }
    // panic: run away from gunfire / the player's car
    const dxp = p.x - ctx.player.x, dzp = p.z - ctx.player.z;
    const dp = Math.hypot(dxp, dzp);
    if (dp < 9 && p.panic <= 0) p.panic = 2.5;
    let tx, tz, sp = p.speed;
    if (p.panic > 0) {
      p.panic -= dt;
      tx = p.x + dxp / (dp || 1) * 10; tz = p.z + dzp / (dp || 1) * 10; sp = 5;
    } else { tx = p.target.x; tz = p.target.z; }
    const dx = tx - p.x, dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.1) {
      p.heading = Math.atan2(dx, dz);
      const nx = p.x + (dx / d) * sp * dt, nz = p.z + (dz / d) * sp * dt;
      const fixed = resolveCircle(ctx, nx, nz, 0.5);
      p.x = fixed.x; p.z = fixed.z;
    }
    p.mesh.position.set(p.x, 0, p.z);
    p.mesh.rotation.y = p.heading;
    // simple leg swing: bob the mesh
    p.mesh.position.y = Math.abs(Math.sin(ctx.clock.t * 6 + p.x)) * 0.06;
  }
}

// Armed enemies for mission 4 (and any later fight): they stand their
// ground and shoot at the player when close.
export function spawnEnemies(ctx, x, z, count) {
  const enemies = [];
  for (let i = 0; i < count; i++) {
    const mesh = personMesh(0x3a1f1f, 0xb08a5a);
    const ex = x + ctx.rng.range(-8, 8), ez = z + ctx.rng.range(-8, 8);
    mesh.position.set(ex, 0, ez);
    ctx.scene.add(mesh);
    enemies.push({ mesh, x: ex, z: ez, health: 100, heading: 0, shootCd: ctx.rng.range(0.5, 2), alive: true });
  }
  ctx.enemies = enemies;
  return enemies;
}

export function updateEnemies(ctx, dt) {
  for (const e of ctx.enemies) {
    if (!e.alive) continue;
    const dx = ctx.player.x - e.x, dz = ctx.player.z - e.z;
    const d = Math.hypot(dx, dz);
    e.heading = Math.atan2(dx, dz);
    e.mesh.rotation.y = e.heading;
    e.shootCd -= dt;
    if (d < 26 && e.shootCd <= 0) {
      e.shootCd = ctx.rng.range(1.2, 2.2);
      damagePlayer(ctx, 6);
      ctx.audio.shot(false);
      ctx.hud.flashDamage();
    }
  }
}

export function damageEnemy(ctx, enemy, amount) {
  if (!enemy.alive) return false;
  enemy.health -= amount;
  if (enemy.health <= 0) {
    enemy.alive = false;
    ctx.scene.remove(enemy.mesh);
    spawnPickup(ctx, enemy.x, enemy.z, 'smg-ammo');
    return true; // killed
  }
  return false;
}

export function damagePlayer(ctx, amount) {
  if (ctx.player.armour > 0) { // armour absorbs first
    const absorbed = Math.min(ctx.player.armour, amount);
    ctx.player.armour -= absorbed;
    amount -= absorbed;
  }
  if (amount > 0) ctx.player.health -= amount;
  if (ctx.player.health <= 0) {
    ctx.player.health = 0;
    ctx.state = 'busted';
    ctx.hud.showMessage('BUSTED — Det. Rook caught up with you. Press R to restart the job.');
  }
}

// Pickups: smg-ammo (from kills), armour (in the world), health.
export function spawnPickup(ctx, x, z, kind) {
  const color = kind === 'smg-ammo' ? 0xffd23e : kind === 'armour' ? 0x39d0ff : 0x7dff5a;
  const mesh = personMesh(color, color);
  mesh.scale.set(0.55, 0.55, 0.55);
  mesh.position.set(x, 0.4, z);
  ctx.scene.add(mesh);
  const p = { mesh, x, z, kind, bob: 0 };
  ctx.pickups.push(p);
  return p;
}

export function updatePickups(ctx, dt) {
  for (let i = ctx.pickups.length - 1; i >= 0; i--) {
    const p = ctx.pickups[i];
    p.bob += dt;
    p.mesh.position.y = 0.4 + Math.sin(p.bob * 3) * 0.25;
    p.mesh.rotation.y += dt * 2;
    const d = Math.hypot(p.x - ctx.player.x, p.z - ctx.player.z);
    if (d < 1.8) {
      if (p.kind === 'smg-ammo') { ctx.player.smgAmmo += 30; ctx.hud.showMessage('+30 SMG ammo'); }
      if (p.kind === 'armour') { ctx.player.armour = 100; ctx.hud.showMessage('Body armour — 100'); }
      if (p.kind === 'health') { ctx.player.health = 100; ctx.hud.showMessage('Health restored'); }
      ctx.audio.blip(990);
      ctx.scene.remove(p.mesh);
      ctx.pickups.splice(i, 1);
    }
  }
}

// Foot cops: spawn at 2+ stars, chase the player on foot.
export function spawnFootCop(ctx, x, z) {
  const mesh = personMesh(0x1c2f4a, 0xc98d64);
  mesh.position.set(x, 0, z);
  ctx.scene.add(mesh);
  const cop = { mesh, x, z, heading: 0, speed: 4.2, grabT: 0 };
  ctx.cops.push(cop);
  return cop;
}

export function updateCops(ctx, dt) {
  for (const c of ctx.cops) {
    const dx = ctx.player.x - c.x, dz = ctx.player.z - c.z;
    const d = Math.hypot(dx, dz);
    c.heading = Math.atan2(dx, dz);
    if (d > 1.6) {
      const nx = c.x + (dx / d) * c.speed * dt, nz = c.z + (dz / d) * c.speed * dt;
      const fixed = resolveCircle(ctx, nx, nz, 0.5);
      c.x = fixed.x; c.z = fixed.z;
      c.grabT = 0;
    } else {
      // foot cops can only drag you out of the car when you are on foot;
      // from a car they just chase
      if (!ctx.player.onFoot) { c.grabT = 0; }
      else {
        c.grabT += dt;
        if (c.grabT > 2.5) { // caught
          ctx.cash = Math.max(0, ctx.cash - 200);
          ctx.police.setStars(ctx, 0);
          ctx.hud.showMessage('BUSTED — $200 fine. Rook lets you walk this time.');
          c.grabT = 0;
        }
      }
    }
    c.mesh.position.set(c.x, 0, c.z);
    c.mesh.rotation.y = c.heading;
  }
}
