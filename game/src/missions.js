// missions — the eight-job story: Dante Reyes vs Mara Voss, with Det.
// Rook closing in. Each mission is steps (reach / clear / kill / pickup /
// steal / survive); finishing one pays its cash and starts the next.
import * as THREE from '../vendor/three.module.min.js';
import { MISSIONS, PLACES, RANKS } from './config.js';
import { spawnEnemies } from './people.js';
import { spawnParkedCar, removeCar } from './vehicles.js';
import { setStars } from './police.js';

function markerMeshes(ctx, x, z) {
  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(3.2, 3.2, 0.25, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.75 }),
  );
  ring.position.set(x, 0.15, z);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.55, 46, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.28, side: THREE.DoubleSide }),
  );
  beam.position.set(x, 23, z);
  ctx.scene.add(ring, beam);
  return { ring, beam, x, z };
}

function clearMarker(ctx) {
  if (!ctx.mission || !ctx.mission.marker) return;
  ctx.scene.remove(ctx.mission.marker.ring, ctx.mission.marker.beam);
  ctx.mission.marker = null;
}

function stepTarget(step) {
  if (step.at) return PLACES[step.at];
  return null;
}

function armStep(ctx) {
  const m = ctx.mission;
  if (!m) return;
  clearMarker(ctx);
  const step = m.def.steps[m.stepIndex];
  if (!step) return;
  ctx.hud.setObjective(`M${m.def.id} — ${m.def.title}: ${step.text}`);
  const at = stepTarget(step);
  if (at) m.marker = markerMeshes(ctx, at.x, at.z);
  if (step.kind === 'kill') {
    m.kills = 0;
    spawnEnemies(ctx, at.x, at.z, step.count);
    ctx.hud.showDialogue('Mara Voss', `${step.count} guards on pier 4. Make it quiet — or loud. Your call.`);
  }
  if (step.kind === 'steal') {
    const isVan = m.def.id === 7;
    m.targetCar = spawnParkedCar(ctx, at.x, at.z, 0.6, isVan ? 0xd8d3c3 : 0x141414, isVan ? 'van' : 'sedan');
    ctx.hud.showDialogue('Dante', isVan ? 'There it is — the evidence van. Take it.' : 'Black sedan, Voss plates. That is the one.');
  }
  if (step.kind === 'survive') {
    m.surviveT = step.seconds;
    ctx.hud.showDialogue('Det. Rook', 'Every cruiser in Porto Vela is coming for you, Reyes.');
  }
}

export function startMission(ctx, index) {
  if (index >= MISSIONS.length) { ctx.mission = null; return null; }
  const def = MISSIONS[index];
  if (ctx.mission) clearMarker(ctx);
  ctx.mission = { def, stepIndex: 0, kills: 0, surviveT: 0, marker: null, targetCar: null };
  ctx.missionIndex = index;
  if (def.startStars) setStars(ctx, def.startStars);
  ctx.hud.showDialogue(def.giver, def.brief);
  ctx.hud.showMessage(`JOB ${def.id}/8 — ${def.title}  •  $${def.cash.toLocaleString()}`);
  ctx.audio.blip(660);
  // M1 parks Dante's coupe at the garage so the first job has a car.
  if (def.id === 1) spawnParkedCar(ctx, PLACES.garage.x + 6, PLACES.garage.z, 0, 0xc94f3d, 'sedan');
  armStep(ctx);
  return ctx.mission;
}

function advanceStep(ctx) {
  const m = ctx.mission;
  m.stepIndex++;
  if (m.stepIndex >= m.def.steps.length) {
    completeMission(ctx);
  } else {
    ctx.audio.blip(880);
    armStep(ctx);
  }
}

function completeMission(ctx) {
  const m = ctx.mission;
  const def = m.def;
  clearMarker(ctx);
  ctx.cash += def.cash;
  ctx.completedMissions += 1;
  ctx.rep = ctx.completedMissions;
  ctx.audio.cash();
  ctx.hud.showMessage(`JOB DONE — ${def.title}  +$${def.cash.toLocaleString()}  (total $${ctx.cash.toLocaleString()})`);
  ctx.hud.showDialogue(def.giver, 'Pleasure doing business. The next job is waiting when you are.');
  ctx.hud.setObjective('Job complete — press M for the next job');
  ctx.mission = null;
  ctx.missionIndex = ctx.completedMissions;
  ctx.save.saveGame(ctx);
  if (ctx.completedMissions >= MISSIONS.length) {
    ctx.hud.showDialogue('Dante', 'Eight jobs. Nineteen thousand. Porto Vela is mine now.');
    ctx.hud.showMessage('STORY COMPLETE — You are the King of Porto Vela.');
  } else {
    setTimeout(() => { if (!ctx.mission && ctx.state === 'play') startMission(ctx, ctx.completedMissions); }, 2500);
  }
}

export function updateMissions(ctx, dt) {
  const m = ctx.mission;
  if (!m || ctx.state !== 'play') return;
  const step = m.def.steps[m.stepIndex];
  if (!step) return;
  if (step.kind === 'reach' || step.kind === 'pickup') {
    const at = stepTarget(step);
    const d = Math.hypot(ctx.player.x - at.x, ctx.player.z - at.z);
    if (d < step.radius) {
      if (step.kind === 'pickup') ctx.hud.showMessage('Package secured.');
      advanceStep(ctx);
    }
  } else if (step.kind === 'clear') {
    if (ctx.stars === 0) advanceStep(ctx);
  } else if (step.kind === 'kill') {
    if (m.kills >= step.count) advanceStep(ctx);
  } else if (step.kind === 'survive') {
    m.surviveT -= dt;
    ctx.hud.setObjective(`M${m.def.id} — ${m.def.title}: Survive — ${Math.ceil(Math.max(0, m.surviveT))}s left`);
    if (m.surviveT <= 0) advanceStep(ctx);
  } else if (step.kind === 'steal') {
    // step completes in onEnterCar; nothing to poll here
  }
}

export function rankName(completed) {
  let name = RANKS[0].name;
  for (const r of RANKS) if (completed >= r.missions) name = r.name;
  return name;
}

export const missionsApi = { startMission, updateMissions, rankName,
  onEnterCar(ctx, car) {
    const m = ctx.mission;
    if (!m) return;
    const step = m.def.steps[m.stepIndex];
    if (step && step.kind === 'steal' && m.targetCar && car === m.targetCar) {
      if (m.def.id === 7) setStars(ctx, 3); // the van job goes loud
      ctx.hud.showMessage('Got it — now deliver it.');
      advanceStep(ctx);
    }
  },
  onKill(ctx) {
    const m = ctx.mission;
    if (!m) return;
    const step = m.def.steps[m.stepIndex];
    if (step && step.kind === 'kill') m.kills += 1;
  },
};
