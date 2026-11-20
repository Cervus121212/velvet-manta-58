// meshkit — merge painted boxes and planes into single geometries.
// One merged mesh = one draw call, which keeps the whole city cheap:
// buildings, palms, cars and people are each a single mesh with
// per-vertex colours under one Lambert material.
import * as THREE from '../vendor/three.module.min.js';

function paint(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

export function box(w, h, d, x, y, z, hex, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return paint(g, hex);
}

export function slab(w, d, x, z, hex, y = 0.02) {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  g.translate(x, y, z);
  return paint(g, hex);
}

export function mergeGeoms(geoms) {
  let vCount = 0, iCount = 0;
  for (const g of geoms) { vCount += g.attributes.position.count; iCount += g.index.count; }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const col = new Float32Array(vCount * 3);
  const idx = new Uint32Array(iCount);
  let vOff = 0, iOff = 0;
  for (const g of geoms) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, vOff * 3);
    nor.set(g.attributes.normal.array, vOff * 3);
    col.set(g.attributes.color.array, vOff * 3);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[iOff + i] = gi[i] + vOff;
    vOff += n; iOff += gi.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

export function mergedMesh(geoms) {
  const mesh = new THREE.Mesh(
    mergeGeoms(geoms),
    new THREE.MeshLambertMaterial({ vertexColors: true }),
  );
  mesh.matrixAutoUpdate = false;
  return mesh;
}

// A car from boxes: body, cabin, glass band, bumpers, wheels.
// Returns one mesh (one draw call) facing +x when heading = 0.
export function carMesh(colorHex, kind = 'sedan') {
  const parts = [];
  const L = kind === 'van' ? 5.6 : kind === 'cruiser' ? 4.9 : 4.4;
  const W = 2.0, bodyH = 0.85;
  parts.push(box(L, bodyH, W, 0, 0.62, 0, colorHex));
  parts.push(box(L * 0.42, 0.62, W * 0.86, kind === 'van' ? 0.2 : -0.25, 1.32, 0, kind === 'van' ? colorHex : 0x1c2733));
  parts.push(box(L * 0.44, 0.1, W * 0.88, kind === 'van' ? 0.2 : -0.25, 1.05, 0, 0x22303e));
  parts.push(box(0.3, 0.3, W + 0.06, L / 2, 0.55, 0, 0x222222));
  parts.push(box(0.3, 0.3, W + 0.06, -L / 2, 0.55, 0, 0x222222));
  if (kind === 'cruiser') {
    parts.push(box(0.9, 0.16, 0.5, -0.25, 1.72, 0, 0xdddddd));
    parts.push(box(0.34, 0.14, 0.2, -0.5, 1.78, 0, 0xff2a2a));
    parts.push(box(0.34, 0.14, 0.2, 0.0, 1.78, 0, 0x2a6bff));
  }
  const wheel = 0x141414;
  for (const [wx, wz] of [[L * 0.32, W / 2], [L * 0.32, -W / 2], [-L * 0.32, W / 2], [-L * 0.32, -W / 2]]) {
    parts.push(box(0.62, 0.62, 0.28, wx, 0.34, wz, wheel));
  }
  const mesh = mergedMesh(parts);
  mesh.matrixAutoUpdate = true;
  return mesh;
}

// A person from boxes: legs, torso, head. One mesh, one draw call.
export function personMesh(shirtHex, skinHex = 0xc98d64) {
  const parts = [
    box(0.34, 0.55, 0.2, -0.1, 0.28, 0, 0x2a2f38),
    box(0.34, 0.55, 0.2, 0.1, 0.28, 0, 0x2a2f38),
    box(0.62, 0.75, 0.34, 0, 0.95, 0, shirtHex),
    box(0.42, 0.42, 0.42, 0, 1.55, 0, skinHex),
  ];
  const mesh = mergedMesh(parts);
  mesh.matrixAutoUpdate = true;
  return mesh;
}
