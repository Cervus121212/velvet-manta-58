// main — Porto Vela boot + game loop. Wires every system together and
// exposes the debug contract the test driver reads (window.__game,
// window.__errors, window.__failedReqs, window.__fps).
import * as THREE from '../vendor/three.module.min.js';
import { WORLD } from './config.js';
import { makeRng } from './rng.js';
import { createAudio } from './audio.js';
import { buildWorld } from './world.js';
import { createTraffic, updateTraffic } from './vehicles.js';
import { createPedestrians, updatePeds, updateEnemies, updatePickups, updateCops, spawnPickup } from './people.js';
import { createPlayer, updatePlayer } from './player.js';
import { createCamera, updateCamera } from './camera.js';
import { createPolice, updatePolice } from './police.js';
import { createHud } from './hud.js';
import { saveApi } from './save.js';
import { missionsApi, startMission } from './missions.js';
import { runAutopilot } from './autopilot.js';
import { setupShot } from './shots.js';

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') || '20261120');

window.__errors = [];
window.__failedReqs = [];
window.__fps = 0;
window.__autopilotResults = null;
window.__trace = [];
window.addEventListener('error', (e) => {
  if (e.target && e.target !== window && (e.target.src || e.target.href)) {
    window.__failedReqs.push(String(e.target.src || e.target.href));
  } else if (e.message) {
    window.__errors.push(String(e.message).slice(0, 300));
  }
}, true);
window.addEventListener('unhandledrejection', (e) => {
  window.__errors.push(String(e.reason && e.reason.message || e.reason).slice(0, 300));
});

const canvas = document.getElementById('game');
// Screenshot mode renders full quality (antialias on); interactive and
// autopilot modes render without antialias — under software rendering
// (swiftshader) MSAA at 1280x800 costs most of the frame budget.
const isShot = !!params.get('shot');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: isShot });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
if (params.get('autopilot')) {
  // autopilot runs headless: smaller drawing buffer, CSS upscales it
  renderer.setSize(Math.floor(window.innerWidth * 0.5), Math.floor(window.innerHeight * 0.5), false);
} else {
  renderer.setSize(window.innerWidth, window.innerHeight);
}

const ctx = {
  seed, rng: makeRng(seed),
  renderer, scene: new THREE.Scene(),
  camera: new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900),
  clock: { t: 0, minutes: 480 },
  state: 'title', cash: 0, stars: 0, completedMissions: 0, missionIndex: 0,
  keys: {}, traffic: [], peds: [], cops: [], cruisers: [], enemies: [],
  pickups: [], parkedCars: [], playerCar: null, heli: null, mission: null,
  spawnPoint: { x: WORLD.spawn.x, z: WORLD.spawn.z },
  cinematic: null,
};
ctx.audio = createAudio();
ctx.save = saveApi;
ctx.missions = missionsApi;
window.__game = ctx;

buildWorld(ctx);
createTraffic(ctx);
createPedestrians(ctx);
createPlayer(ctx);
createCamera(ctx);
createPolice(ctx);
createHud(ctx);

// permanent pickups: armour by the docks, health at the beach kiosk,
// SMG ammo at the garage.
spawnPickup(ctx, 220, 80, 'armour');
spawnPickup(ctx, -96, 222, 'health');
spawnPickup(ctx, -72, 66, 'smg-ammo');

// --- input ------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  ctx.keys[e.code] = true;
  if (e.code === 'KeyR' && ctx.state === 'play') {
    const name = ctx.audio.setStation(ctx.audio.station + 1);
    ctx.hud.showMessage('Radio: ' + name);
  }
  if (e.code === 'KeyR' && ctx.state === 'busted') {
    ctx.player.health = 100; ctx.stars = 0; ctx.state = 'play';
    ctx.hud.showMessage('Back on your feet. Stay out of sight.');
  }
  if (e.code === 'KeyM' && ctx.state === 'play' && !ctx.mission && ctx.completedMissions < 8) {
    startMission(ctx, ctx.completedMissions);
  }
  if ((e.code === 'Enter' || e.code === 'Space') && ctx.state === 'title') startGame(false);
});
window.addEventListener('keyup', (e) => { ctx.keys[e.code] = false; });
window.addEventListener('mousedown', (e) => { if (e.button === 0) ctx.keys['Mouse0'] = true; });
window.addEventListener('mouseup', (e) => { if (e.button === 0) ctx.keys['Mouse0'] = false; });
window.addEventListener('resize', () => {
  ctx.camera.aspect = window.innerWidth / window.innerHeight;
  ctx.camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
document.getElementById('start-btn').addEventListener('click', () => startGame(false));
document.getElementById('continue-btn').addEventListener('click', () => startGame(true));

function startGame(fromSave) {
  ctx.audio.ensure();
  ctx.hud.title.classList.remove('show');
  ctx.state = 'play';
  if (fromSave) {
    const data = ctx.save.loadGame(ctx);
    if (data) {
      ctx.hud.showMessage('Welcome back — $' + ctx.cash.toLocaleString() + ', ' + ctx.completedMissions + '/8 jobs done.');
      if (ctx.completedMissions < 8) startMission(ctx, ctx.completedMissions);
      return;
    }
  }
  ctx.hud.showDialogue('Dante', 'Porto Vela. Sun, salt, sirens — and Mara Voss holding my debt. Time to work.');
  startMission(ctx, 0);
}

// title screen shows the Continue button only when a save exists
if (ctx.save.hasSave()) document.getElementById('continue-btn').style.display = 'inline-block';

// --- modes -------------------------------------------------------------
const mode = params.get('autopilot') ? 'autopilot' : params.get('shot') ? 'shot' : 'play';
if (mode === 'autopilot' || mode === 'shot') {
  ctx.hud.title.classList.remove('show');
  ctx.state = 'play';
  startMission(ctx, 0);
}

// --- loop --------------------------------------------------------------
let last = performance.now();
let frames = 0, fpsT0 = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  frames++;
  if (now - fpsT0 >= 1000) { // honest fps: real frames per real second
    window.__fps = Math.round((frames * 1000) / (now - fpsT0));
    frames = 0; fpsT0 = now;
  }
  if (ctx.state === 'play') {
    ctx.clock.t += dt;
    ctx.clock.minutes += dt * 0.5; // one game minute every two real seconds
    updatePlayer(ctx, dt);
    updateTraffic(ctx, dt);
    updatePeds(ctx, dt);
    updateCops(ctx, dt);
    updateEnemies(ctx, dt);
    updatePickups(ctx, dt);
    updatePolice(ctx, dt);
    missionsApi.updateMissions(ctx, dt);
  } else if (ctx.state === 'title') {
    ctx.clock.t += dt;
    // slow orbit over the city behind the title screen
    if (!ctx.cinematic) {
      const a = ctx.clock.t * 0.03;
      ctx.camera.position.set(Math.sin(a) * 200, 95, Math.cos(a) * 200);
      ctx.camera.lookAt(0, 8, 0);
    }
  }
  updateCamera(ctx, dt);
  ctx.hud.update(dt);
  renderer.render(ctx.scene, ctx.camera);
}
requestAnimationFrame(loop);

// --- self-test / screenshot modes --------------------------------------
if (mode === 'autopilot') {
  setTimeout(() => { runAutopilot(ctx).catch((e) => { window.__errors.push(String(e)); document.title = 'AUTOPILOT-FAIL'; }); }, 800);
} else if (mode === 'shot') {
  setTimeout(() => { setupShot(ctx, params.get('shot')).catch((e) => { window.__errors.push(String(e)); }); }, 800);
}
