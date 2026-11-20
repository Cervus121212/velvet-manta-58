// camera — chase camera with a settling spring behind the car, a speed
// FOV kick, and a direct (no-ease) follow on foot.
import * as THREE from '../vendor/three.module.min.js';

export function createCamera(ctx) {
  ctx.camState = { pos: new THREE.Vector3(0, 8, -14), look: new THREE.Vector3(0, 1, 0), settled: false };
  return ctx.camState;
}

export function updateCamera(ctx, dt) {
  const p = ctx.player;
  const cam = ctx.camera;
  const cs = ctx.camState;
  if (ctx.cinematic) { // fixed shot framing (title screen / screenshots)
    cam.position.copy(ctx.cinematic.pos);
    cam.lookAt(ctx.cinematic.look);
    cam.fov = 55;
    cam.updateProjectionMatrix();
    return;
  }
  const back = 9.5, height = 4.2;
  if (p.onFoot) {
    // on foot: the camera sits right behind the player with no easing,
    // so turns feel instant.
    const bx = p.x - Math.sin(p.heading) * 4.5;
    const bz = p.z - Math.cos(p.heading) * 4.5;
    cs.pos.set(bx, 2.6, bz);
    cs.look.set(p.x + Math.sin(p.heading) * 6, 1.4, p.z + Math.cos(p.heading) * 6);
    cs.settled = true;
    cam.fov = 62;
  } else {
    const bx = p.x - Math.sin(p.heading) * back;
    const bz = p.z - Math.cos(p.heading) * back;
    const target = new THREE.Vector3(bx, height, bz);
    const k = 1 - Math.exp(-dt * 3.2); // spring settle
    cs.pos.lerp(target, k);
    const lookT = new THREE.Vector3(
      p.x + Math.sin(p.heading) * 10,
      1.6,
      p.z + Math.cos(p.heading) * 10,
    );
    cs.look.lerp(lookT, 1 - Math.exp(-dt * 6));
    if (cs.pos.distanceTo(target) < 0.4) cs.settled = true;
    // FOV kick: wider as the car goes faster
    const speed01 = Math.min(1, Math.abs(p.speed) / 34);
    cam.fov += ((62 + speed01 * 14) - cam.fov) * Math.min(1, dt * 5);
  }
  cam.position.copy(cs.pos);
  cam.lookAt(cs.look);
  cam.updateProjectionMatrix();
}
