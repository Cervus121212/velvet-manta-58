// world — Porto Vela itself: the 9x9 grid city, beach, docks, marina,
// palms, lamps and every collider. Everything static merges into a few
// meshes so the renderer stays cheap.
import * as THREE from '../vendor/three.module.min.js';
import { WORLD, PALETTE } from './config.js';
import { box, slab, mergedMesh } from './meshkit.js';

export function roadLines() {
  const lines = [];
  for (let i = 0; i <= WORLD.blocks; i++) lines.push(-WORLD.half + i * WORLD.pitch);
  return lines;
}

export function isOnRoad(x, z) {
  const half = WORLD.road / 2;
  for (const l of roadLines()) {
    if (Math.abs(x - l) <= half || Math.abs(z - l) <= half) return true;
  }
  return false;
}

// Circle (player / car) vs building AABBs: push the circle out.
export function resolveCircle(ctx, x, z, r) {
  let hit = false;
  for (const c of ctx.world.colliders) {
    const cx = Math.max(c.x0, Math.min(x, c.x1));
    const cz = Math.max(c.z0, Math.min(z, c.z1));
    const dx = x - cx, dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * r; z = cz + (dz / d) * r;
      } else {
        // centre inside the box: shove out along the smallest penetration
        const pl = x - c.x0, pr = c.x1 - x, pt = z - c.z0, pb = c.z1 - z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = c.x0 - r; else if (m === pr) x = c.x1 + r;
        else if (m === pt) z = c.z0 - r; else z = c.z1 + r;
      }
    }
  }
  return { x, z, hit };
}

export function buildWorld(ctx) {
  const rng = ctx.rng;
  const scene = ctx.scene;
  const colliders = [];
  const statics = []; // merged building boxes
  const ground = [];
  const props = []; // palms, lamps, signs

  // --- ground planes (one layer each — overlapping full-city planes
  // cost a full fragment pass apiece under software rendering) ---------
  ground.push(slab(WORLD.half * 2 + 90, WORLD.half * 2 + 90, 0, 0, PALETTE.asphalt, 0.01)); // city asphalt
  for (const l of roadLines()) {
    ground.push(slab(WORLD.road, WORLD.half * 2, l, 0, 0x3a3e46, 0.02));
    ground.push(slab(WORLD.half * 2, WORLD.road, 0, l, 0x3a3e46, 0.02));
  }
  // centre dashes along every road
  for (const l of roadLines()) {
    for (let t = -WORLD.half + 12; t < WORLD.half; t += 24) {
      ground.push(slab(6, 0.5, l, t, PALETTE.roadLine, 0.03));
      ground.push(slab(0.5, 6, t, l, PALETTE.roadLine, 0.03));
    }
  }
  // beach + sea + docklands
  ground.push(slab(560, 44, 0, WORLD.beachZ + 16, PALETTE.sand, 0.01));
  ground.push(slab(560, 120, 0, WORLD.seaZ + 60, PALETTE.sea, 0.0));
  ground.push(slab(120, 560, WORLD.seaZ + 60, 0, PALETTE.sea, 0.0));
  ground.push(slab(72, WORLD.half * 2, WORLD.dockX, 0, 0x6a6258, 0.01)); // dock concrete
  ground.push(slab(560, 40, 0, -WORLD.half - 20, PALETTE.grass, 0.01)); // north grass
  const groundMesh = mergedMesh(ground);
  scene.add(groundMesh);

  // --- buildings: 1-4 per block, taller near the centre ---------------
  let buildingCount = 0;
  for (let bi = 0; bi < WORLD.blocks; bi++) {
    for (let bj = 0; bj < WORLD.blocks; bj++) {
      const cx = -WORLD.half + WORLD.pitch / 2 + bi * WORLD.pitch;
      const cz = -WORLD.half + WORLD.pitch / 2 + bj * WORLD.pitch;
      const distC = Math.hypot(cx, cz) / WORLD.half;
      const tall = rng.chance(0.25 + 0.45 * (1 - distC));
      const wall = rng.pick(PALETTE.wall);
      const roof = rng.pick(PALETTE.roof);
      if (tall) {
        const w = rng.range(18, 26), d = rng.range(18, 26), h = rng.range(26, 58);
        statics.push(box(w, h, d, cx, h / 2, cz, wall));
        statics.push(box(w + 1, 1.2, d + 1, cx, h + 0.6, cz, roof));
        statics.push(box(w * 0.5, 2.5, 1, cx, h + 1.5, cz + d / 2 + 0.2, rng.pick(PALETTE.neon)));
        colliders.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 });
        buildingCount++;
      } else {
        for (const [ox, oz] of [[-8, -8], [8, -8], [-8, 8], [8, 8]]) {
          if (!rng.chance(0.8)) continue;
          const w = rng.range(10, 14), d = rng.range(10, 14), h = rng.range(7, 18);
          const bx = cx + ox, bz = cz + oz;
          statics.push(box(w, h, d, bx, h / 2, bz, rng.pick(PALETTE.wall)));
          statics.push(box(w + 0.6, 0.8, d + 0.6, bx, h + 0.4, bz, roof));
          colliders.push({ x0: bx - w / 2, x1: bx + w / 2, z0: bz - d / 2, z1: bz + d / 2 });
          buildingCount++;
        }
      }
    }
  }
  const cityMesh = mergedMesh(statics);
  scene.add(cityMesh);

  // --- docks: piers, containers, warehouse ----------------------------
  const dockParts = [];
  for (let p = 0; p < 3; p++) {
    const pz = -96 + p * 96;
    dockParts.push(box(48, 1.2, 10, WORLD.dockX + 24, 0.6, pz, 0x7a5a3a));
    dockParts.push(box(2, 3, 10, WORLD.dockX + 46, 1.5, pz, 0x5a4632));
  }
  const contCols = [0xc94f3d, 0x3d7ac9, 0x7ac93d, 0xc9a13d];
  for (let i = 0; i < 10; i++) {
    const cx = WORLD.dockX - 12 + rng.range(-8, 8), cz = -160 + i * 30 + rng.range(-6, 6);
    const w = 12, d = 3, h = 3;
    dockParts.push(box(w, h, d, cx, 1.5 + (i % 2) * 3, cz, contCols[i % 4]));
    colliders.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 });
  }
  dockParts.push(box(30, 10, 18, WORLD.dockX - 6, 5, 150, 0x8a7a5a)); // warehouse
  colliders.push({ x0: WORLD.dockX - 21, x1: WORLD.dockX + 9, z0: 141, z1: 159 });
  const dockMesh = mergedMesh(dockParts);
  scene.add(dockMesh);

  // --- beach: kiosk, umbrellas, marina boats -------------------------
  const beachParts = [
    box(8, 4, 6, -96, 2, 228, 0xe8dcc0), // kiosk
    box(9, 0.5, 7, -96, 4.2, 228, 0xff5a7a),
  ];
  colliders.push({ x0: -100, x1: -92, z0: 225, z1: 231 });
  for (let i = 0; i < 6; i++) {
    const ux = -180 + i * 60, uz = 236 + (i % 2) * 8;
    beachParts.push(box(0.3, 3, 0.3, ux, 1.5, uz, 0x8a6a4a));
    beachParts.push(box(6, 0.3, 6, ux, 3.1, uz, [0xff5a7a, 0x39d0ff, 0xffd23e][i % 3]));
  }
  for (let i = 0; i < 5; i++) { // marina boats
    const bx = 150 + i * 18, bz = 268 + (i % 2) * 14;
    beachParts.push(box(10, 1.6, 3.4, bx, 0.8, bz, [0xe8e8e8, 0x3d7ac9, 0xc94f3d][i % 3]));
    beachParts.push(box(0.4, 7, 0.4, bx, 4, bz, 0x5a4632));
    beachParts.push(box(3, 2.4, 2.6, bx - 1, 2.6, bz, 0xd8d3c3));
  }
  const beachMesh = mergedMesh(beachParts);
  scene.add(beachMesh);

  // --- palms along the beach + lamps along roads (merged props) -------
  for (let i = 0; i < 18; i++) {
    const px = -210 + i * 24, pz = 222 + (i % 2) * 4;
    props.push(box(0.5, 6, 0.5, px, 3, pz, 0x6a4a2a));
    props.push(box(4, 1, 4, px, 6.4, pz, 0x3d7a2a));
  }
  for (const l of roadLines()) {
    for (let t = -WORLD.half + 24; t < WORLD.half; t += 96) {
      props.push(box(0.3, 6, 0.3, l + 8, 3, t, 0x3a3f46));
      props.push(box(1.4, 0.5, 0.7, l + 8, 6.1, t, 0xffe9a8));
    }
  }
  const propsMesh = mergedMesh(props);
  scene.add(propsMesh);

  // --- north hills backdrop ------------------------------------------
  const hillParts = [];
  for (let i = 0; i < 9; i++) {
    const hx = -240 + i * 60;
    hillParts.push(box(70, rng.range(18, 34), 30, hx, 8, -262, 0x4a6a3a));
  }
  const hills = mergedMesh(hillParts);
  scene.add(hills);

  // --- lights ---------------------------------------------------------
  const sun = new THREE.DirectionalLight(0xffe3b3, 2.4);
  sun.position.set(120, 180, 60);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbcd6e8, 0x5a4a3a, 1.1));
  scene.fog = new THREE.Fog(PALETTE.fog, 260, 620);
  scene.background = new THREE.Color(PALETTE.sky);

  ctx.world = { colliders, buildingCount };
  return ctx.world;
}
