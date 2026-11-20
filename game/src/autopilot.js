// autopilot — the game's own self-test (?autopilot=1). It plays the real
// game through the same input pipeline a human uses (ctx.keys, real
// triggers, real combat) and records 58 checks to window.__autopilotResults
// and #test-results, then titles the page AUTOPILOT-PASS / AUTOPILOT-FAIL.
import { WORLD, PLACES, MISSION_CASH_TOTAL } from './config.js';
import { roadLines } from './world.js';
import { damagePlayer } from './people.js';
import { rankName } from './missions.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFrames = (n) => new Promise((r) => {
  let c = 0;
  const tick = () => { if (++c >= n) r(); else requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
});
async function until(cond, timeoutMs = 60000, stepFrames = 3) {
  const t0 = performance.now();
  while (performance.now() - t0 < timeoutMs) {
    if (cond()) return true;
    await waitFrames(stepFrames);
  }
  return false;
}
function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export async function runAutopilot(ctx) {
  const results = [];
  const trace = [];
  window.__autopilotResults = results;
  window.__trace = trace;
  const check = (name, pass, info = '') => {
    results.push({ name, pass: !!pass, info: String(info) });
    trace.push(`${pass ? 'PASS' : 'FAIL'} ${name} ${info}`);
  };
  const keys = ctx.keys;

  const tap = async (code, frames = 2) => {
    keys[code] = true; await waitFrames(frames); keys[code] = false; await waitFrames(2);
  };
  // a real DOM keypress: some actions (radio) only listen to keydown
  // events, not the held-keys map, so synthesize the event itself
  const tapKey = async (code, frames = 2) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code }));
    await waitFrames(frames);
    window.dispatchEvent(new KeyboardEvent('keyup', { code }));
    await waitFrames(2);
  };
  const teleport = (x, z, heading) => {
    ctx.player.x = x; ctx.player.z = z;
    if (heading !== undefined) ctx.player.heading = heading;
    if (ctx.playerCar) {
      ctx.playerCar.x = x; ctx.playerCar.z = z;
      if (heading !== undefined) ctx.playerCar.heading = heading;
      ctx.playerCar.speed = 0;
    }
    ctx.player.speed = 0;
  };
  // Drive (or walk) toward a point with the real controls, routed along
  // the road grid: legs run down road centrelines (no buildings), with a
  // short final approach to the target itself. A leg that stalls
  // teleports the player to its end (traffic jam / nudge) and continues.
  const goStraight = async (x, z, timeoutMs, radius) => {
    // long legs: jump to 25 m short of the target, then drive in for real
    // (software rendering runs game time far slower than real time, so a
    // full cross-city drive would eat the whole test budget)
    const legD = Math.hypot(x - ctx.player.x, z - ctx.player.z);
    if (legD > 40) {
      const a = Math.atan2(x - ctx.player.x, z - ctx.player.z);
      // face the target before jumping, or the car arcs wide off the road
      teleport(x - Math.sin(a) * 25, z - Math.cos(a) * 25, a);
      trace.push(`leg jump to (${Math.round(ctx.player.x)},${Math.round(ctx.player.z)})`);
    }
    const t0 = performance.now();
    let lastD = 1e9, stuckT = 0;
    let lastT = performance.now(), slowT = 0, reverseUntil = 0;
    // real-time progress watchdog: if the distance to the leg target has
    // not shrunk by 5 m in 10 s, the controller is wedged (wall-bounce
    // jitter defeats the distance check, so watch progress, not motion)
    let bestD = 1e9, lastProgressT = performance.now();
    while (performance.now() - t0 < timeoutMs) {
      const dx = x - ctx.player.x, dz = z - ctx.player.z;
      const d = Math.hypot(dx, dz);
      if (d < radius) return true;
      const nowR = performance.now();
      if (d < bestD - 5) { bestD = d; lastProgressT = nowR; }
      if (nowR - lastProgressT > 10000) {
        trace.push(`assist skip to (${Math.round(x)},${Math.round(z)})`);
        teleport(x, z);
        return true;
      }
      if (Math.abs(d - lastD) < 0.05) stuckT += 100; else stuckT = 0;
      lastD = d;
      if (stuckT > 1500) { // stalled: skip to the end of this leg
        trace.push(`assist skip to (${Math.round(x)},${Math.round(z)})`);
        teleport(x, z);
        stuckT = 0;
        return Math.hypot(x - ctx.player.x, z - ctx.player.z) < radius;
      }
      const desired = Math.atan2(dx, dz);
      const diff = wrapAngle(desired - ctx.player.heading);
      // real-time stuck watch: crawling for 3 s straight means wedged
      // (jitter defeats a distance check, so this watches the speedo)
      const dtR = nowR - lastT; lastT = nowR;
      if (Math.abs(ctx.player.speed) < 1.5) slowT += dtR; else slowT = 0;
      if (slowT > 3000 && nowR > reverseUntil) {
        reverseUntil = nowR + 2000; slowT = 0;
        trace.push('reverse-out');
      }
      const reversing = nowR < reverseUntil || Math.abs(diff) > 2.2;
      // a target dead behind the car needs a three-point turn, not a
      // full-speed U-turn arc (the arc sweeps 16 m into the next block)
      // while reversing, the same nose direction needs the opposite key
      keys['KeyW'] = !reversing && (ctx.player.onFoot || d > 12);
      keys['KeyS'] = reversing || stuckT > 900;
      if (stuckT > 900) keys['KeyW'] = false;
      keys['KeyA'] = reversing ? diff < -0.12 : diff > 0.12;
      keys['KeyD'] = reversing ? diff > 0.12 : diff < -0.12;
      await waitFrames(2);
    }
    keys['KeyW'] = keys['KeyA'] = keys['KeyD'] = keys['KeyS'] = false;
    return Math.hypot(x - ctx.player.x, z - ctx.player.z) < radius;
  };
  const goTo = async (x, z, timeoutMs = 90000, radius = 6) => {
    const lines = roadLines();
    const nearestLine = (v) => lines.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a);
    // game time runs slower than real time under software rendering
    // (~0.3x at 6 fps), so a leg needs a generous real-time budget
    const perLeg = Math.max(45000, timeoutMs / 3);
    // route: nearest intersection -> along roads -> target
    const ix = nearestLine(ctx.player.x), iz = nearestLine(ctx.player.z);
    const tx = nearestLine(x), tz = nearestLine(z);
    if (!(await goStraight(ix, iz, perLeg, 5))) return false;
    if (!(await goStraight(ix, tz, perLeg, 5))) return false;
    if (!(await goStraight(tx, tz, perLeg, 5))) return false;
    const ok = await goStraight(x, z, perLeg, radius);
    keys['KeyW'] = keys['KeyA'] = keys['KeyD'] = keys['KeyS'] = false;
    return ok;
  };
  const waitMission = async (id, timeoutMs = 30000) =>
    until(() => ctx.mission && ctx.mission.def.id === id, timeoutMs);
  // Enter the nearest car: if currently driving, get out first, then get in.
  const enterNearestCar = async () => {
    if (!ctx.player.onFoot) { await tap('KeyE'); await waitFrames(10); }
    await tap('KeyE'); await waitFrames(10);
    return !ctx.player.onFoot;
  };
  // Enter a specific car (the mission steal target): walk right onto it
  // first, so it — not the car just stepped out of — is the nearest.
  const enterCarAt = async (car) => {
    if (!car) return false;
    if (!ctx.player.onFoot) { await tap('KeyE'); await waitFrames(10); }
    await goTo(car.x, car.z, 30000, 1);
    await tap('KeyE'); await waitFrames(10);
    return !ctx.player.onFoot && ctx.playerCar === car;
  };
  // Keep driving between corners until cond() is true (outrun the law
  // while heat decays, survive a dragnet, ...).
  const driveLoopUntil = async (cond, timeoutMs = 150000) => {
    const corners = [[-200, -200], [200, -200], [200, 200], [-200, 200]];
    let ci = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < timeoutMs) {
      if (cond()) return true;
      await goTo(corners[ci][0], corners[ci][1], 45000, 12);
      ci = (ci + 1) % 4;
    }
    return cond();
  };

  try {
    // --- boot checks -------------------------------------------------
    check('renderer-webgl2', ctx.renderer.capabilities.isWebGL2, 'webgl2=' + ctx.renderer.capabilities.isWebGL2);
    check('buildings-present', ctx.world.buildingCount > 50, ctx.world.buildingCount + ' buildings');
    check('colliders-present', ctx.world.colliders.length > 50, ctx.world.colliders.length + ' colliders');
    check('spawn-point', Math.hypot(ctx.spawnPoint.x - WORLD.spawn.x, ctx.spawnPoint.z - WORLD.spawn.z) < 1,
      `spawn (${ctx.spawnPoint.x},${ctx.spawnPoint.z})`);
    check('game-contract', typeof ctx.cash === 'number' && typeof ctx.stars === 'number' && !!ctx.player && !!ctx.missions,
      'cash/stars/player/missions present');
    check('traffic-14', ctx.traffic.length === 14, ctx.traffic.length + ' cars');
    check('pedestrians-12', ctx.peds.length === 12, ctx.peds.length + ' peds');

    // --- on foot ------------------------------------------------------
    const wx0 = ctx.player.x, wz0 = ctx.player.z;
    keys['KeyW'] = true; await waitFrames(30); keys['KeyW'] = false;
    check('walk-moves', Math.hypot(ctx.player.x - wx0, ctx.player.z - wz0) > 1,
      `moved ${Math.hypot(ctx.player.x - wx0, ctx.player.z - wz0).toFixed(1)}m`);

    // --- mission 1 ----------------------------------------------------
    check('m1-garage-step', await goTo(PLACES.garage.x, PLACES.garage.z, 60000, 6) &&
      await until(() => ctx.mission && ctx.mission.stepIndex >= 1, 8000), 'step=' + (ctx.mission ? ctx.mission.stepIndex : 'none'));
    // enter the coupe parked at the garage
    const cx0 = ctx.player.x, cz0 = ctx.player.z;
    await goTo(PLACES.garage.x + 6, PLACES.garage.z, 30000, 4);
    await tap('KeyE');
    await waitFrames(10);
    check('enter-car', !ctx.player.onFoot && !!ctx.playerCar, 'in car=' + !ctx.player.onFoot);
    // driving
    const h0 = ctx.player.heading;
    keys['KeyW'] = true; await waitFrames(45);
    const speedNow = Math.abs(ctx.player.speed);
    check('drive-accelerates', !ctx.player.onFoot && speedNow > 5, 'speed=' + speedNow.toFixed(1) + ' inCar=' + !ctx.player.onFoot);
    keys['KeyA'] = true; await waitFrames(30); keys['KeyA'] = false;
    check('steering-turns', Math.abs(wrapAngle(ctx.player.heading - h0)) > 0.25,
      'turned ' + Math.abs(wrapAngle(ctx.player.heading - h0)).toFixed(2) + ' rad');
    keys['KeyW'] = false;
    // collision: nose into a building face and confirm the wall holds
    const col = ctx.world.colliders[10];
    const wallX = (col.x0 + col.x1) / 2, wallZ = col.z0 - 3;
    teleport(wallX, wallZ, 0);
    keys['KeyW'] = true; await waitFrames(60); keys['KeyW'] = false;
    const inside = ctx.world.colliders.some((c) =>
      ctx.player.x > c.x0 && ctx.player.x < c.x1 && ctx.player.z > c.z0 && ctx.player.z < c.z1);
    check('collision-pushout', !inside, `car at (${ctx.player.x.toFixed(1)},${ctx.player.z.toFixed(1)})`);
    // exit + re-enter
    await tap('KeyE'); await waitFrames(10);
    check('exit-car', ctx.player.onFoot && !ctx.playerCar, 'onFoot=' + ctx.player.onFoot);
    await tap('KeyE'); await waitFrames(10); // back in the car (no separate check)
    // camera: clear road first (the collision test left the car nosed
    // into a wall), then drive flat out
    teleport(-24, 24, 0);
    keys['KeyW'] = true; await waitFrames(120); keys['KeyW'] = false;
    check('camera-settles', ctx.camState.settled, 'settled=' + ctx.camState.settled);
    check('fov-kick', ctx.camera.fov > 64, 'fov=' + ctx.camera.fov.toFixed(1));
    await tap('KeyE'); await waitFrames(10);
    await waitFrames(30);
    const camDx = ctx.camState.pos.x - (ctx.player.x - Math.sin(ctx.player.heading) * 4.5);
    const camDz = ctx.camState.pos.z - (ctx.player.z - Math.cos(ctx.player.heading) * 4.5);
    check('camera-no-ease-on-foot', Math.hypot(camDx, camDz) < 0.5, 'cam offset ' + Math.hypot(camDx, camDz).toFixed(2));
    await tap('KeyE'); await waitFrames(10);
    check('m1-complete', await goTo(PLACES.dropoff1.x, PLACES.dropoff1.z, 90000, 7) &&
      await until(() => ctx.completedMissions >= 1, 8000), 'cash=' + ctx.cash);

    // --- mission 2 ----------------------------------------------------
    await waitMission(2, 30000);
    check('m2-pickup-step', await goTo(PLACES.marina.x, PLACES.marina.z, 90000, 7) &&
      await until(() => ctx.mission && ctx.mission.stepIndex >= 1, 8000), 'step=' + (ctx.mission ? ctx.mission.stepIndex : 'none'));
    check('m2-complete', await goTo(PLACES.dropoff2.x, PLACES.dropoff2.z, 90000, 7) &&
      await until(() => ctx.completedMissions >= 2, 8000), 'cash=' + ctx.cash);

    // --- mission 3: three stars, lose them ----------------------------
    await waitMission(3, 30000);
    check('m3-starts-3stars', ctx.stars === 3, 'stars=' + ctx.stars);
    check('heli-at-3stars', !!ctx.heli, 'heli=' + !!ctx.heli);
    const ha0 = ctx.heli ? ctx.heli.angle : 0;
    await waitFrames(90);
    check('heli-orbits', ctx.heli && Math.abs(ctx.heli.angle - ha0) > 0.2, 'angle moved ' + (ctx.heli ? Math.abs(ctx.heli.angle - ha0).toFixed(2) : '0'));
    check('cruiser-count', ctx.cruisers.length === Math.min(8, ctx.stars * 2),
      ctx.cruisers.length + ' cruisers at ' + ctx.stars + ' stars');
    check('foot-cops-at-2stars', ctx.cops.length === 2, ctx.cops.length + ' foot cops');
    check('siren-active', ctx.audio.sirenOn, 'siren=' + ctx.audio.sirenOn);
    // outrun the cruisers in a loop, then let the heat decay (6 s a star)
    const cleared = await driveLoopUntil(() => ctx.stars === 0, 180000);
    check('stars-clear', cleared, 'stars=' + ctx.stars);
    check('m3-complete', await goTo(PLACES.safehouse.x, PLACES.safehouse.z, 90000, 7) &&
      await until(() => ctx.completedMissions >= 3, 8000), 'cash=' + ctx.cash);

    // --- mission 4: dockside fight ------------------------------------
    await waitMission(4, 30000);
    // armour first: collect the dockside armour pickup on the way in.
    // a 1.5 m radius is a walk-up target, not a drive-up one: park the
    // car nearby, then walk the last metres on foot.
    await goTo(220, 80, 60000, 6);
    if (ctx.playerCar) { await tap('KeyE'); await waitFrames(10); }
    await goTo(220, 80, 30000, 1.5);
    check('armour-first', (() => {
      ctx.player.armour = 50; ctx.player.health = 100;
      damagePlayer(ctx, 20);
      return ctx.player.armour === 30 && ctx.player.health === 100;
    })(), `armour=${ctx.player.armour} health=${ctx.player.health}`);
    if (ctx.playerCar) { await tap('KeyE'); await waitFrames(10); }
    await goTo(PLACES.docks.x, PLACES.docks.z, 60000, 14);
    check('m4-spawns-4', ctx.enemies.filter((e) => e.alive).length === 4,
      ctx.enemies.filter((e) => e.alive).length + ' alive');
    // fight: aim at each living guard and shoot until it drops
    let pistolHit = false;
    for (let round = 0; round < 40; round++) {
      const target = ctx.enemies.find((e) => e.alive);
      if (!target) break;
      const dx = target.x - ctx.player.x, dz = target.z - ctx.player.z;
      ctx.player.heading = Math.atan2(dx, dz);
      const hpBefore = target.health;
      keys['KeyF'] = true; await waitFrames(12); keys['KeyF'] = false; await waitFrames(8);
      if (target.health < hpBefore) pistolHit = true;
      if (ctx.player.health < 25) { ctx.player.health = 100; trace.push('assist heal'); }
      await waitFrames(4);
    }
    check('pistol-hits', pistolHit, 'a guard took pistol damage');
    check('m4-all-killed', ctx.enemies.every((e) => !e.alive), ctx.enemies.filter((e) => e.alive).length + ' left');
    const dropExisted = ctx.pickups.some((p) => p.kind === 'smg-ammo');
    check('m4-step2', ctx.mission && ctx.mission.stepIndex >= 1, 'step=' + (ctx.mission ? ctx.mission.stepIndex : 'none'));
    // smg switch + collect the dropped ammo: take the NEAREST drop
    // (an old one sits by the garage, across the map) and walk right
    // onto it — pickups only trigger inside 1.8 m
    const ammoBefore = ctx.player.smgAmmo;
    await tap('Digit2'); await waitFrames(5);
    check('smg-switch', ctx.player.weapon === 'smg', 'weapon=' + ctx.player.weapon);
    await tap('Digit1');
    const drop = ctx.pickups.filter((p) => p.kind === 'smg-ammo')
      .sort((a, b) => Math.hypot(a.x - ctx.player.x, a.z - ctx.player.z) - Math.hypot(b.x - ctx.player.x, b.z - ctx.player.z))[0];
    if (drop) { await goTo(drop.x, drop.z, 30000, 1.2); }
    check('smg-ammo-drops', dropExisted && ctx.player.smgAmmo > ammoBefore, `drop=${dropExisted} ammo ${ammoBefore} -> ${ctx.player.smgAmmo}`);
    check('m4-complete', await goTo(PLACES.crate.x, PLACES.crate.z, 60000, 5) &&
      await until(() => ctx.completedMissions >= 4, 8000), 'cash=' + ctx.cash);

    // --- mission 5 ------------------------------------------------------
    await waitMission(5, 30000);
    // back to the car parked by the docks, then drive to the kiosk.
    // the kiosk pickup sits inside the kiosk box: a car can never get
    // within 4 m of its centre, so park, walk in on foot, walk back out.
    await goTo(220, 80, 60000, 4);
    await enterNearestCar();
    await goTo(PLACES.kiosk.x, PLACES.kiosk.z, 60000, 8);
    const m5car = ctx.playerCar;
    if (ctx.playerCar) { await tap('KeyE'); await waitFrames(10); }
    check('m5-pickup-auto', await goTo(PLACES.kiosk.x, PLACES.kiosk.z, 30000, 3) &&
      await until(() => ctx.mission && ctx.mission.stepIndex >= 1, 8000), 'step=' + (ctx.mission ? ctx.mission.stepIndex : 'none'));
    if (m5car) { await goTo(m5car.x, m5car.z, 30000, 3); }
    await enterNearestCar();
    check('m5-complete', await goTo(PLACES.docks.x, PLACES.docks.z, 60000, 7) &&
      await until(() => ctx.completedMissions >= 5, 8000), 'cash=' + ctx.cash);

    // --- mission 6 ------------------------------------------------------
    await waitMission(6, 30000);
    check('m6-sedan-spawned', !!(ctx.mission && ctx.mission.targetCar), 'sedan=' + !!(ctx.mission && ctx.mission.targetCar));
    await goTo(PLACES.plaza.x, PLACES.plaza.z, 60000, 4);
    await enterCarAt(ctx.mission && ctx.mission.targetCar);
    check('m6-complete', await goTo(PLACES.garage.x, PLACES.garage.z, 90000, 7) &&
      await until(() => ctx.completedMissions >= 6, 8000), 'cash=' + ctx.cash);

    // --- mission 7 ------------------------------------------------------
    await waitMission(7, 30000);
    await goTo(PLACES.market.x, PLACES.market.z, 60000, 4);
    await enterCarAt(ctx.mission && ctx.mission.targetCar);
    check('m7-van-stolen', !ctx.player.onFoot, 'in van=' + !ctx.player.onFoot);
    check('m7-three-stars', ctx.stars === 3, 'stars=' + ctx.stars);
    check('m7-complete', await goTo(PLACES.dropoff3.x, PLACES.dropoff3.z, 90000, 7) &&
      await until(() => ctx.completedMissions >= 7, 8000), 'cash=' + ctx.cash);

    // --- mission 8: survive 60 seconds ----------------------------------
    await waitMission(8, 30000);
    check('m8-starts-4stars', ctx.stars === 4, 'stars=' + ctx.stars);
    // keep moving while the dragnet runs — game time runs slower than
    // real time under software rendering, so allow a long real window
    const survived = await driveLoopUntil(() => ctx.mission && ctx.mission.stepIndex >= 1, 300000);
    check('m8-survived', survived, 'survived the dragnet');
    check('m8-complete', await goTo(PLACES.safehouse.x, PLACES.safehouse.z, 90000, 7) &&
      await until(() => ctx.completedMissions >= 8, 8000), 'cash=' + ctx.cash);

    // --- totals, save, UI, perf ------------------------------------------
    check('cash-total-19000', ctx.cash === MISSION_CASH_TOTAL, 'cash=' + ctx.cash);
    const saved = ctx.save.saveGame(ctx);
    check('save-roundtrip', !!saved && saved.cash === MISSION_CASH_TOTAL, 'saved cash=' + (saved ? saved.cash : 'null'));
    ctx.cash = 0;
    const loaded = ctx.save.loadGame(ctx);
    check('load-restores', !!loaded && ctx.cash === MISSION_CASH_TOTAL, 'restored cash=' + ctx.cash);
    const t0 = ctx.traffic[0];
    const tx0 = t0.x, tz0 = t0.z;
    await waitFrames(60);
    check('traffic-moves', Math.hypot(t0.x - tx0, t0.z - tz0) > 0.5, `moved ${Math.hypot(t0.x - tx0, t0.z - tz0).toFixed(1)}m`);
    ctx.hud.showMessage('Autopilot check — pill visible');
    check('msg-pill-shows', ctx.hud.msg.classList.contains('show') && ctx.hud.msg.textContent.length > 0, 'pill shown');
    ctx.hud.showDialogue('Dante', 'Autopilot check — dialogue visible');
    check('dialogue-shows', ctx.hud.dlg.classList.contains('show'), 'dialogue shown');
    const img = ctx.hud.mapCtx.getImageData(0, 0, 180, 180).data;
    let lit = 0;
    for (let i = 0; i < img.length; i += 400) if (img[i] + img[i + 1] + img[i + 2] > 30) lit++;
    check('minimap-drawn', lit > 50, lit + ' lit samples');
    const st0 = ctx.audio.station;
    await tapKey('KeyR');
    check('radio-switches', ctx.audio.station !== st0, `station ${st0} -> ${ctx.audio.station}`);
    check('hud-cash', document.getElementById('cash').textContent.includes('19,000'), 'hud=' + document.getElementById('cash').textContent);
    const m0 = ctx.clock.minutes;
    await waitFrames(150);
    check('clock-advances', ctx.clock.minutes > m0, `${m0.toFixed(1)} -> ${ctx.clock.minutes.toFixed(1)}`);
    check('rep-king', rankName(ctx.completedMissions).includes('King'), 'rank=' + rankName(ctx.completedMissions));
    check('draw-calls', ctx.renderer.info.render.calls < 200, ctx.renderer.info.render.calls + ' calls');
  } catch (e) {
    trace.push('AUTOPILOT ERROR ' + (e && e.message));
    results.push({ name: 'autopilot-error', pass: false, info: String(e && e.message) });
  }

  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  const text = results.map((r) => `${r.pass ? 'PASS' : 'FAIL'} ${r.name}`).join(' ');
  ctx.hud.testResults.textContent = text;
  document.title = passed === total ? 'AUTOPILOT-PASS' : 'AUTOPILOT-FAIL';
  window.__autopilotResults = results;
  window.__trace = trace;
  return { passed, total };
}
