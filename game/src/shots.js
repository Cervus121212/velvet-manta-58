// shots — staged scenes for the four screenshots (?shot=name): the
// title vista, a three-star chase, the dockside fight and the marina
// cruise. Each arranges the real game state, then flags SHOT-READY.
import * as THREE from '../vendor/three.module.min.js';
import { PLACES } from './config.js';
import { spawnParkedCar } from './vehicles.js';
import { spawnEnemies, spawnPickup } from './people.js';
import { setStars } from './police.js';
import { startMission } from './missions.js';

const waitFrames = (n) => new Promise((r) => {
  let c = 0;
  const tick = () => { if (++c >= n) r(); else requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
});

function putPlayerInCar(ctx, x, z, heading, color) {
  const car = spawnParkedCar(ctx, x, z, heading, color, 'sedan');
  ctx.player.x = x; ctx.player.z = z; ctx.player.heading = heading;
  ctx.player.onFoot = false; ctx.player.car = car; ctx.playerCar = car;
  car.parked = false;
  return car;
}

export async function setupShot(ctx, name) {
  ctx.audio.ensure();
  if (name === 'start') {
    // title screen over a high vista of the whole city at golden hour
    ctx.cinematic = {
      pos: new THREE.Vector3(-160, 90, -190),
      look: new THREE.Vector3(60, 10, 80),
    };
    ctx.hud.title.classList.add('show');
    ctx.state = 'title';
    await waitFrames(90);
  } else if (name === 'chase') {
    ctx.state = 'play';
    ctx.hud.title.classList.remove('show');
    putPlayerInCar(ctx, -120, 24, Math.PI / 2, 0xc94f3d);
    ctx.playerCar.speed = 26;
    setStars(ctx, 3);
    // clear pedestrians off the chase line, or the shot reads as a pile-up
    for (const p of ctx.peds) {
      if (Math.abs(p.z - 24) < 12 && p.x > -160 && p.x < 60) { p.x -= 40; p.z += 26; }
    }
    ctx.hud.setObjective('M3 — Hot Wheels: Lose the heat — break line of sight and stay clean');
    ctx.hud.showMessage('PVPD on your tail — three stars!');
    ctx.hud.showDialogue('Det. Rook', 'All units, Reyes is on Avenida Mar. Box him in.');
    await waitFrames(120);
  } else if (name === 'docks') {
    ctx.state = 'play';
    ctx.hud.title.classList.remove('show');
    if (ctx.playerCar) { ctx.player.car = null; ctx.playerCar = null; }
    ctx.player.onFoot = true;
    ctx.player.x = PLACES.docks.x - 6; ctx.player.z = PLACES.docks.z - 4;
    ctx.player.heading = Math.atan2(6, 4);
    startMission(ctx, 3); // arms the kill step: four guards spawn on pier 4
    ctx.hud.showMessage('Four guards on pier 4.');
    await waitFrames(120);
  } else if (name === 'marina') {
    ctx.state = 'play';
    ctx.hud.title.classList.remove('show');
    // cruise the beach road east toward the marina, sea on the right —
    // the old staging drove the car straight into a block
    putPlayerInCar(ctx, 120, 216, Math.PI / 2, 0x3d7ac9);
    ctx.playerCar.speed = 12;
    startMission(ctx, 1);
    ctx.hud.setObjective('M2 — The Pickup: Pick up the passenger at the marina');
    ctx.hud.showDialogue('Mara Voss', 'A friend needs a lift from the marina. No questions.');
    await waitFrames(120);
  }
  document.title = 'SHOT-READY';
}
