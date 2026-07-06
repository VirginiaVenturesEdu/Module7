// ============================================================================
// environment.ts  —  Main Street for Money Moves
// Built from simple shapes in the Market Harvest style: a few mesh helpers, a
// gradient sky, soft daylight, and a stage-look retint so the street's time of
// day shifts as the student grows up. Buildings are landmarks the student
// walks to. No 3D model files are needed; real models can be swapped in later.
// ============================================================================

import {
  Mesh,
  Group,
  BoxGeometry,
  CylinderGeometry,
  SphereGeometry,
  ConeGeometry,
  PlaneGeometry,
  MeshLambertMaterial,
  MeshBasicMaterial,
  Color,
  CanvasTexture,
  SRGBColorSpace,
  DirectionalLight,
  HemisphereLight,
  Fog,
  BackSide,
  DoubleSide,
  Vector3,
} from "@iwsdk/core";

// ----------------------------------------------------------------------------
// PALETTE  —  the WORLD colors (warm and naturalistic). The cream/navy/gold of
// the panels is reserved for signs and UI, so the buildings feel like a place.
// ----------------------------------------------------------------------------
export const PALETTE = {
  grass: "#7db84e",
  road: "#9a9488",
  sidewalk: "#cfc7b5",
  homeWall: "#f1d49a",
  homeRoof: "#c2593f",
  bankWall: "#d8d2c4",
  bankRoof: "#7a8a93",
  bankTrim: "#b9b1a0",
  storeWall: "#e7b27a",
  storeRoof: "#7b4a2c",
  awningA: "#c0432f",
  awningB: "#f3e9d2",
  wood: "#8b5e3c",
  woodDark: "#5b3a21",
  trunk: "#6e4a2c",
  leaf: "#4e8f3a",
  hedge: "#3f7a34", // the boundary hedge that fences the plaza in
  lamp: "#ffd98a",
  skyTop: "#3f8fd6",
  skyMid: "#8ec4ea",
  horizon: "#dceefb",
  sun: "#fff2d4",
  piggy: "#f59ab6",
};
const SIGN_CREAM = "#f3e9d2"; // sign background (matches the panel cream)
const SIGN_NAVY = "#1F3A5F";  // sign text (matches the panel navy)

// ----------------------------------------------------------------------------
// STAGE LOOKS  —  the street's time of day shifts as the student ages. The new
// PROPS for each stage (the food truck in Stage 2, your storefront in Stage 3)
// are added with those stages; here we change the light and sky.
// ----------------------------------------------------------------------------
const stageState = {
  skyMat: null as MeshBasicMaterial | null,
  sun: null as DirectionalLight | null,
  hemi: null as HemisphereLight | null,
  fog: null as Fog | null,
  groundMats: [] as MeshLambertMaterial[],
  foliageMats: [] as { mat: { color: Color }; orig: Color }[],
};

function registerFoliage(mesh: Mesh) {
  const mat = mesh.material as MeshLambertMaterial;
  stageState.foliageMats.push({ mat, orig: mat.color.clone() });
}

const STAGE_LOOKS = {
  // Stage 1, childhood: a fresh bright morning.
  stage1: { skyTop: "#5aa6e0", skyMid: "#9fcdee", horizon: "#e3f1fb", sun: "#fff4dd", sunI: 2.3, hemiI: 1.15, ground: "#ffffff", foliage: "#ffffff" },
  // Stage 2, working years: a strong full midday.
  stage2: { skyTop: "#2f86d8", skyMid: "#7fbcec", horizon: "#d6ebfb", sun: "#ffefbe", sunI: 2.7, hemiI: 1.2, ground: "#f3ffe4", foliage: "#eaffce" },
  // Stage 3, adult: a warm golden hour.
  stage3: { skyTop: "#6f7fb8", skyMid: "#d9a878", horizon: "#f6cf9a", sun: "#ffba78", sunI: 2.0, hemiI: 0.98, ground: "#f0e0b8", foliage: "#e8b878" },
};

// Retint the whole street for a stage. Safe to call any number of times; every
// tint is computed from stored originals, never stacked. "setup" uses stage1.
export function setStageLook(world: any, stage: string) {
  void world;
  let key = stage;
  if (key === "setup" || key === "report") key = key === "report" ? "stage3" : "stage1";
  const preset = (STAGE_LOOKS as any)[key];
  if (!preset) return;
  if (stageState.skyMat) {
    const old = stageState.skyMat.map;
    stageState.skyMat.map = makeSkyTexture(preset.skyTop, preset.skyMid, preset.horizon);
    stageState.skyMat.needsUpdate = true;
    if (old) old.dispose();
  }
  if (stageState.sun) {
    stageState.sun.color.set(preset.sun);
    stageState.sun.intensity = preset.sunI;
  }
  if (stageState.hemi) stageState.hemi.intensity = preset.hemiI;
  if (stageState.fog) stageState.fog.color.set(preset.horizon);
  for (const mat of stageState.groundMats) mat.color.set(preset.ground);
  const tint = new Color(preset.foliage);
  for (const f of stageState.foliageMats) {
    f.mat.color.copy(f.orig).multiply(tint);
  }
}

// ----------------------------------------------------------------------------
// SMALL SHAPE HELPERS  —  every scenery piece is made out of these.
// ----------------------------------------------------------------------------
function meshBox(w: number, h: number, d: number, color: string): Mesh {
  const m = new Mesh(new BoxGeometry(w, h, d), new MeshLambertMaterial({ color: new Color(color) }));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function meshCyl(rTop: number, rBot: number, h: number, color: string, seg = 12): Mesh {
  const m = new Mesh(new CylinderGeometry(rTop, rBot, h, seg), new MeshLambertMaterial({ color: new Color(color) }));
  m.castShadow = true;
  return m;
}
function meshSphere(r: number, color: string, seg = 12): Mesh {
  const m = new Mesh(new SphereGeometry(r, seg, seg), new MeshLambertMaterial({ color: new Color(color) }));
  m.castShadow = true;
  return m;
}
function meshCone(r: number, h: number, color: string, seg = 12): Mesh {
  const m = new Mesh(new ConeGeometry(r, h, seg), new MeshLambertMaterial({ color: new Color(color) }));
  m.castShadow = true;
  return m;
}

// ----------------------------------------------------------------------------
// CANVAS TEXTURES  —  a gradient sky and readable signs, drawn once at startup.
// ----------------------------------------------------------------------------
function makeSkyTexture(top: string, mid: string, horizon: string): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 256;
  const ctx = c.getContext("2d") as CanvasRenderingContext2D;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top);
  g.addColorStop(0.55, mid);
  g.addColorStop(1, horizon);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 256);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

function makeSignTexture(text: string): CanvasTexture {
  // Drawn at high resolution so the text stays crisp even on the wide overhead
  // banner, which stretches one texture across a much larger board than the
  // building signs. Low resolution there blurred "Main Street" into nothing.
  const W = 720;
  const H = 240;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d") as CanvasRenderingContext2D;
  ctx.fillStyle = SIGN_CREAM;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = SIGN_NAVY;
  ctx.lineWidth = 16;
  ctx.strokeRect(12, 12, W - 24, H - 24);
  ctx.fillStyle = SIGN_NAVY;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Pick the largest font (up to a cap) that still fits, so longer names like
  // "Main Street" fill the board instead of shrinking to nothing.
  let size = 104;
  do {
    ctx.font = "bold " + size + "px sans-serif";
    size -= 4;
  } while (ctx.measureText(text).width > W - 72 && size > 24);
  ctx.fillText(text, W / 2, H / 2 + 4);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

// A flat readable sign board (unlit so it never darkens), added to a building
// group facing the street (the building's +Z side).
function addBoardSign(group: Group, text: string, x: number, y: number, z: number) {
  const board = new Mesh(
    new PlaneGeometry(2.2, 0.72),
    new MeshBasicMaterial({ map: makeSignTexture(text), side: DoubleSide }),
  );
  board.position.set(x, y, z);
  group.add(board);
}

// ----------------------------------------------------------------------------
// SKY + LIGHTS
// ----------------------------------------------------------------------------
function buildSkyAndLights(world: any) {
  const scene = world.scene;

  // A big inside-out sphere painted with the sky gradient.
  const skyMat = new MeshBasicMaterial({
    map: makeSkyTexture(PALETTE.skyTop, PALETTE.skyMid, PALETTE.horizon),
    side: BackSide,
    fog: false,
  });
  const skyMesh = new Mesh(new SphereGeometry(120, 24, 16), skyMat);
  world.createTransformEntity(skyMesh);
  stageState.skyMat = skyMat;

  // Fog so distant things melt into the horizon color.
  const fog = new Fog(new Color(PALETTE.horizon), 28, 95);
  scene.fog = fog;
  stageState.fog = fog;

  // Soft sky light + a warm sun.
  const hemi = new HemisphereLight(new Color("#ffffff"), new Color("#7f9a6a"), 1.15);
  scene.add(hemi);
  stageState.hemi = hemi;

  const sun = new DirectionalLight(new Color(PALETTE.sun), 2.3);
  sun.position.set(12, 22, 8);
  scene.add(sun);
  stageState.sun = sun;
}

// ----------------------------------------------------------------------------
// THE STREET  —  grass ground (the walkable floor), a road, and two sidewalks.
// Returns the grass ground entity so index.ts can mark it walkable.
// ----------------------------------------------------------------------------
function buildStreet(world: any) {
  // Grass ground (the walkable floor). Returned to index.ts. Sized to the
  // bounded plaza (the hedge ring in buildBoundary fences the player in), with
  // its edges tucked a little past the hedges so you never see or reach them.
  // Offset back so the plaza is centered on the shops, not on the empty apron.
  const grassMat = new MeshLambertMaterial({ color: new Color(PALETTE.grass) });
  const grassMesh = new Mesh(new PlaneGeometry(32, 28), grassMat);
  grassMesh.receiveShadow = true;
  const ground = world.createTransformEntity(grassMesh);
  ground.object3D!.rotation.x = -Math.PI / 2;
  ground.object3D!.position.set(0, 0, -1.5);
  stageState.groundMats.push(grassMat);

  // The street runs LEFT TO RIGHT (along X) in front of the shops, so the road
  // and sidewalks are long, thin strips that cross your view. Kept inside the
  // side hedges (x = +/-13.5) so they do not poke through the boundary.
  const roadMesh = new Mesh(new PlaneGeometry(26, 5), new MeshLambertMaterial({ color: new Color(PALETTE.road) }));
  const roadE = world.createTransformEntity(roadMesh);
  roadE.object3D!.rotation.x = -Math.PI / 2;
  roadE.object3D!.position.set(0, 0.02, -5.0);

  const frontWalk = new Mesh(new PlaneGeometry(26, 2.2), new MeshLambertMaterial({ color: new Color(PALETTE.sidewalk) }));
  const fwE = world.createTransformEntity(frontWalk);
  fwE.object3D!.rotation.x = -Math.PI / 2;
  fwE.object3D!.position.set(0, 0.025, -6.9);

  const nearWalk = new Mesh(new PlaneGeometry(26, 1.6), new MeshLambertMaterial({ color: new Color(PALETTE.sidewalk) }));
  const nwE = world.createTransformEntity(nearWalk);
  nwE.object3D!.rotation.x = -Math.PI / 2;
  nwE.object3D!.position.set(0, 0.025, -2.8);

  // A "Main Street" banner across the middle, facing you.
  const banner = new Group();
  for (const sx of [-6, 6]) {
    const post = meshCyl(0.16, 0.18, 4.3, PALETTE.woodDark, 10);
    post.position.set(sx, 2.15, 0);
    banner.add(post);
  }
  const beam = meshBox(12.4, 0.35, 0.35, PALETTE.wood);
  beam.position.set(0, 4.15, 0);
  banner.add(beam);
  const board = new Mesh(new PlaneGeometry(4.2, 0.95), new MeshBasicMaterial({ map: makeSignTexture("Main Street"), side: DoubleSide }));
  // Sit clearly IN FRONT of the beam (front face at z +0.175); otherwise the
  // beam covers the centered text and the board reads as blank.
  board.position.set(0, 4.15, 0.3);
  banner.add(board);
  const bannerE = world.createTransformEntity(banner);
  bannerE.object3D!.position.set(0, 0, -8.0);

  return ground;
}

// ----------------------------------------------------------------------------
// THE FOUR BUILDINGS  —  each is a Group of shapes, then one world object.
// Built facing +Z (the street side); placed and rotated by buildEnvironment.
// ----------------------------------------------------------------------------
function buildHome(world: any, x: number, z: number, rotY: number) {
  const g = new Group();
  const foundation = meshBox(4.2, 0.25, 3.2, "#9a948a");
  foundation.position.set(0, 0.125, 0);
  g.add(foundation);
  const walls = meshBox(4, 2.2, 3, PALETTE.homeWall);
  walls.position.set(0, 0.25 + 1.1, 0);
  g.add(walls);
  // Gabled roof: a 3-sided prism, scaled to overhang.
  const roofGeo = new CylinderGeometry(1, 1, 4.6, 3, 1);
  roofGeo.rotateZ(Math.PI / 2);
  const roof = new Mesh(roofGeo, new MeshLambertMaterial({ color: new Color(PALETTE.homeRoof) }));
  roof.castShadow = true;
  roof.scale.set(1, 0.7, (3 + 0.8) / Math.sqrt(3));
  roof.position.set(0, 0.25 + 2.2 + 0.5 * 0.7, 0);
  g.add(roof);
  const door = meshBox(0.7, 1.3, 0.08, PALETTE.woodDark);
  door.position.set(-0.9, 0.25 + 0.65, 1.52);
  g.add(door);
  const win = meshBox(0.7, 0.7, 0.06, "#bcd8ec");
  win.position.set(0.9, 0.25 + 1.3, 1.52);
  g.add(win);
  const chim = meshBox(0.4, 1.2, 0.4, "#9c4a32");
  chim.position.set(1.3, 0.25 + 2.2 + 0.4, 0);
  g.add(chim);
  addBoardSign(g, "Home", 0, 0.25 + 2.0, 1.55);
  buildPiggyBank(g, 1.6, 2.2);
  const e = world.createTransformEntity(g);
  e.object3D!.position.set(x, 0, z);
  e.object3D!.rotation.y = rotY;
}

// A cute piggy bank on a little stand, sat in front of the home.
function buildPiggyBank(group: Group, x: number, z: number) {
  const stand = meshBox(0.8, 0.5, 0.8, PALETTE.wood);
  stand.position.set(x, 0.25, z);
  group.add(stand);
  const body = meshSphere(0.35, PALETTE.piggy, 14);
  body.scale.set(1.3, 1, 1);
  body.position.set(x, 0.86, z);
  group.add(body);
  const snout = meshCyl(0.12, 0.12, 0.1, "#e87fa0", 10);
  snout.rotation.x = Math.PI / 2;
  snout.position.set(x + 0.46, 0.86, z);
  group.add(snout);
  for (const sz of [-1, 1]) {
    const ear = meshCone(0.1, 0.16, PALETTE.piggy, 8);
    ear.position.set(x + 0.22, 1.16, z + sz * 0.18);
    group.add(ear);
  }
  for (const dx of [-0.2, 0.2]) {
    for (const dz of [-0.18, 0.18]) {
      const leg = meshCyl(0.07, 0.07, 0.25, "#e87fa0", 8);
      leg.position.set(x + dx, 0.62, z + dz);
      group.add(leg);
    }
  }
  const slot = meshBox(0.2, 0.04, 0.06, PALETTE.woodDark);
  slot.position.set(x, 1.19, z);
  group.add(slot);
}

function buildBank(world: any, x: number, z: number, rotY: number) {
  const g = new Group();
  const base = meshBox(5, 0.3, 3.6, PALETTE.bankTrim);
  base.position.set(0, 0.15, 0);
  g.add(base);
  const walls = meshBox(4.6, 2.8, 3.2, PALETTE.bankWall);
  walls.position.set(0, 0.3 + 1.4, 0);
  g.add(walls);
  const roof = meshBox(5, 0.4, 3.6, PALETTE.bankRoof);
  roof.position.set(0, 0.3 + 2.8 + 0.2, 0);
  g.add(roof);
  for (const cx of [-1.7, -0.57, 0.57, 1.7]) {
    const col = meshCyl(0.22, 0.22, 2.8, "#efe9da", 12);
    col.position.set(cx, 0.3 + 1.4, 1.7);
    g.add(col);
  }
  const steps = meshBox(3.6, 0.2, 0.8, PALETTE.bankTrim);
  steps.position.set(0, 0.1, 2.0);
  g.add(steps);
  const door = meshBox(0.9, 1.6, 0.08, PALETTE.woodDark);
  door.position.set(0, 0.3 + 0.8, 1.62);
  g.add(door);
  addBoardSign(g, "Bank", 0, 0.3 + 2.55, 1.62);
  const e = world.createTransformEntity(g);
  e.object3D!.position.set(x, 0, z);
  e.object3D!.rotation.y = rotY;
}

function buildStore(world: any, x: number, z: number, rotY: number) {
  const g = new Group();
  const foundation = meshBox(4.4, 0.25, 3.2, "#9a948a");
  foundation.position.set(0, 0.125, 0);
  g.add(foundation);
  const walls = meshBox(4.2, 2.4, 3, PALETTE.storeWall);
  walls.position.set(0, 0.25 + 1.2, 0);
  g.add(walls);
  const roof = meshBox(4.4, 0.35, 3.2, PALETTE.storeRoof);
  roof.position.set(0, 0.25 + 2.4 + 0.18, 0);
  g.add(roof);
  const win = meshBox(2.2, 1.2, 0.06, "#bcd8ec");
  win.position.set(0, 0.25 + 1.1, 1.52);
  g.add(win);
  const door = meshBox(0.8, 1.4, 0.08, PALETTE.woodDark);
  door.position.set(1.4, 0.25 + 0.7, 1.52);
  g.add(door);
  // Striped awning over the window: a slanted row of thin boxes.
  const awn = new Group();
  let i = 0;
  for (const ax of [-1.0, -0.5, 0, 0.5, 1.0]) {
    const stripe = meshBox(0.5, 0.08, 0.9, i % 2 === 0 ? PALETTE.awningA : PALETTE.awningB);
    stripe.position.set(ax, 0, 0);
    awn.add(stripe);
    i = i + 1;
  }
  awn.position.set(0, 0.25 + 1.85, 1.9);
  awn.rotation.x = -0.5;
  g.add(awn);
  addBoardSign(g, "Corner Store", 0, 0.25 + 2.2, 1.55);
  const e = world.createTransformEntity(g);
  e.object3D!.position.set(x, 0, z);
  e.object3D!.rotation.y = rotY;
}

function buildBusinessLot(world: any, x: number, z: number, rotY: number) {
  const g = new Group();
  const dirt = new Mesh(new PlaneGeometry(4.4, 3.4), new MeshLambertMaterial({ color: new Color("#caa877") }));
  dirt.rotation.x = -Math.PI / 2;
  dirt.position.set(0, 0.03, 0);
  g.add(dirt);
  for (const fx of [-2, -1, 0, 1, 2]) {
    const post = meshCyl(0.07, 0.07, 0.7, PALETTE.woodDark, 8);
    post.position.set(fx, 0.35, -1.6);
    g.add(post);
  }
  const rail = meshBox(4.2, 0.08, 0.08, PALETTE.wood);
  rail.position.set(0, 0.55, -1.6);
  g.add(rail);
  const post = meshCyl(0.08, 0.08, 2.2, PALETTE.woodDark, 8);
  post.position.set(0, 1.1, 0);
  g.add(post);
  addBoardSign(g, "Your Spot", 0, 1.9, 0.1);
  const small = new Mesh(new PlaneGeometry(1.4, 0.32), new MeshBasicMaterial({ map: makeSignTexture("Coming Soon"), side: DoubleSide }));
  small.position.set(0, 1.5, 0.1);
  g.add(small);
  const e = world.createTransformEntity(g);
  e.object3D!.position.set(x, 0, z);
  e.object3D!.rotation.y = rotY;
}

// ----------------------------------------------------------------------------
// DECORATION  —  a few trees and street lamps to make the street feel alive.
// ----------------------------------------------------------------------------
function buildTrees(world: any) {
  // Lined up the two sides of the plaza (none behind the shops, where the back
  // hedge now sits), framing the walk from the entrance down to the stores.
  const spots = [[-12, 7], [12, 7], [-12, -1], [12, -1], [-12, -9], [12, -9]];
  for (const s of spots) {
    const g = new Group();
    const trunk = meshCyl(0.18, 0.24, 1.4, PALETTE.trunk, 8);
    trunk.position.set(0, 0.7, 0);
    g.add(trunk);
    const f1 = meshSphere(0.9, PALETTE.leaf, 12);
    f1.position.set(0, 1.7, 0);
    registerFoliage(f1);
    g.add(f1);
    const f2 = meshSphere(0.7, PALETTE.leaf, 12);
    f2.position.set(0.4, 1.4, 0.2);
    registerFoliage(f2);
    g.add(f2);
    const e = world.createTransformEntity(g);
    e.object3D!.position.set(s[0], 0, s[1]);
  }
}

function buildLamps(world: any) {
  const spots = [[-11, -6.9], [-5.5, -6.9], [0, -6.9], [5.5, -6.9], [11, -6.9]];
  for (const s of spots) {
    const g = new Group();
    const pole = meshCyl(0.08, 0.1, 3, PALETTE.woodDark, 8);
    pole.position.set(0, 1.5, 0);
    g.add(pole);
    const head = meshSphere(0.18, PALETTE.lamp, 10);
    head.position.set(0, 3.05, 0);
    g.add(head);
    const e = world.createTransformEntity(g);
    e.object3D!.position.set(s[0], 0, s[1]);
  }
}

// ----------------------------------------------------------------------------
// BOUNDARY  —  a hedge ring around the plaza. This is the ONE thing that keeps
// the player on the ground: index.ts registers it as a LocomotionEnvironment, so
// the locomotion capsule collides with it and cannot walk off the edge (which is
// what made you fall). The hedges are tall enough (1.8 m) to block the capsule
// and sit just inside the grass so its edges stay hidden behind them.
// ----------------------------------------------------------------------------
export const BOUNDARY = {
  xHalf: 13.5, // left/right hedges sit here
  zBack: -12.5, // just behind the shops
  zFront: 9.5, // a little behind where you start
  height: 1.8,
  thickness: 0.6,
};

function buildBoundary(world: any) {
  const g = new Group();
  const H = BOUNDARY.height;
  const T = BOUNDARY.thickness;
  const x = BOUNDARY.xHalf;
  const zMid = (BOUNDARY.zFront + BOUNDARY.zBack) / 2;
  const spanX = x * 2 + T; // overhang the corners so there are no gaps
  const spanZ = BOUNDARY.zFront - BOUNDARY.zBack + T;

  function hedge(w: number, d: number, cx: number, cz: number) {
    const m = meshBox(w, H, d, PALETTE.hedge);
    m.position.set(cx, H / 2, cz);
    g.add(m);
  }
  hedge(spanX, T, 0, BOUNDARY.zBack); // back, behind the shops
  hedge(spanX, T, 0, BOUNDARY.zFront); // front, behind the start
  hedge(T, spanZ, -x, zMid); // left
  hedge(T, spanZ, x, zMid); // right

  return world.createTransformEntity(g);
}

// ----------------------------------------------------------------------------
// STATION ANCHORS  —  where each building sits and which way it faces. Later
// prompts (the mentor, the panels) read these so they know where the player
// walks. This is the ONE place to nudge building positions.
// ----------------------------------------------------------------------------
export const STATIONS = {
  home: { x: -9.5, z: -9, faceY: 0 },
  bank: { x: -3.2, z: -9, faceY: 0 },
  store: { x: 3.2, z: -9, faceY: 0 },
  business: { x: 9.5, z: -9, faceY: 0 },
};

// ============================================================================
// GUS  —  the Main Street cart shopkeeper and your money mentor. He wheels his
// cart to where you are, waves you over with a gold "!", and greets you when you
// walk up. His stage question (which feeds Money Smarts) arrives with the panel
// system in the next prompt; for now he is alive and says hello.
// ============================================================================

// Where Gus parks (and which way he faces). The one place to move him.
export const GUS_SPOT = { x: -8, z: -2.5, faceY: 0 };

// Break a sentence into lines that fit a given width, for the speech bubble.
function wrapLines(ctx: any, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxWidth) {
      if (line) lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Draw a white speech bubble with navy text onto a canvas, wrapped to fit.
function makeBubbleTexture(text: string): CanvasTexture {
  const W = 460;
  const H = 240;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d") as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, W, H);
  const bx = 14;
  const by = 14;
  const bw = W - 28;
  const bh = H - 78;
  ctx.fillStyle = "#fffdf8";
  ctx.strokeStyle = SIGN_NAVY;
  ctx.lineWidth = 8;
  ctx.fillRect(bx, by, bw, bh);
  // a little tail pointing down toward Gus
  ctx.beginPath();
  ctx.moveTo(W / 2 - 28, by + bh);
  ctx.lineTo(W / 2 + 28, by + bh);
  ctx.lineTo(W / 2, by + bh + 50);
  ctx.closePath();
  ctx.fill();
  ctx.strokeRect(bx, by, bw, bh);
  ctx.fillStyle = SIGN_NAVY;
  ctx.font = "bold 30px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lines = wrapLines(ctx, text, bw - 44);
  const lh = 38;
  const startY = by + bh / 2 - ((lines.length - 1) * lh) / 2;
  let li = 0;
  for (const ln of lines) {
    ctx.fillText(ln, W / 2, startY + li * lh);
    li = li + 1;
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

// Build Gus, his cart, his gold "!", and his greeting bubble, then keep an eye
// on how close the player is and show the right thing.
function buildGus(world: any) {
  const GREETING = "Well hello there! Come on over when you are ready, and I will help you make a smart money move.";
  const RADIUS = 4.2; // how close you must be for Gus to greet you

  // ---- The cart ----
  const cart = new Group();
  const counter = meshBox(1.6, 0.9, 0.8, PALETTE.wood);
  counter.position.set(0, 0.55, 0);
  cart.add(counter);
  const top = meshBox(1.72, 0.12, 0.92, PALETTE.woodDark);
  top.position.set(0, 1.06, 0);
  cart.add(top);
  for (const wz of [-0.32, 0.32]) {
    const wheel = meshCyl(0.32, 0.32, 0.14, "#3a3a3a", 16);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(0.72, 0.32, wz);
    cart.add(wheel);
  }
  for (const px of [-0.7, 0.7]) {
    const post = meshCyl(0.05, 0.05, 1.0, PALETTE.woodDark, 8);
    post.position.set(px, 1.55, -0.35);
    cart.add(post);
  }
  const awn = new Group();
  let i = 0;
  for (const ax of [-0.6, -0.2, 0.2, 0.6]) {
    const stripe = meshBox(0.4, 0.07, 0.8, i % 2 === 0 ? PALETTE.awningA : PALETTE.awningB);
    stripe.position.set(ax, 0, 0);
    awn.add(stripe);
    i = i + 1;
  }
  awn.position.set(0, 2.05, 0.05);
  awn.rotation.x = -0.35;
  cart.add(awn);
  for (const gx of [-0.5, -0.1, 0.3]) {
    const fruit = meshSphere(0.12, gx === -0.1 ? "#e7b84a" : "#d2452f", 10);
    fruit.position.set(gx, 1.22, 0.12);
    cart.add(fruit);
  }
  const sign = new Mesh(new PlaneGeometry(1.0, 0.3), new MeshBasicMaterial({ map: makeSignTexture("Gus's Cart"), side: DoubleSide }));
  sign.position.set(0, 1.0, 0.47);
  cart.add(sign);

  // ---- Gus the figure, standing behind the counter ----
  for (const lx of [-0.16, 0.16]) {
    const leg = meshCyl(0.1, 0.1, 0.7, "#3c4a63", 8);
    leg.position.set(lx, 0.35, -0.55);
    cart.add(leg);
  }
  const torso = meshCyl(0.26, 0.3, 0.8, "#5b7da6", 10);
  torso.position.set(0, 1.1, -0.55);
  cart.add(torso);
  const apron = meshBox(0.42, 0.6, 0.08, "#caa15a");
  apron.position.set(0, 1.0, -0.4);
  cart.add(apron);
  for (const ax of [-0.32, 0.32]) {
    const arm = meshCyl(0.08, 0.08, 0.6, "#5b7da6", 8);
    arm.position.set(ax, 1.15, -0.55);
    arm.rotation.z = ax > 0 ? -0.3 : 0.3;
    cart.add(arm);
  }
  const head = meshSphere(0.2, "#e8b48c", 14);
  head.position.set(0, 1.72, -0.55);
  cart.add(head);
  const cap = meshCyl(0.22, 0.22, 0.1, "#7a5230", 12);
  cap.position.set(0, 1.88, -0.55);
  cart.add(cap);
  const brim = meshBox(0.38, 0.04, 0.22, "#7a5230");
  brim.position.set(0, 1.85, -0.4);
  cart.add(brim);
  const mustache = meshBox(0.18, 0.05, 0.04, "#f2efe9");
  mustache.position.set(0, 1.64, -0.36);
  cart.add(mustache);

  // ---- The gold "!" that invites you over ----
  const bang = new Group();
  const barG = meshBox(0.1, 0.4, 0.1, "#c8962a");
  barG.position.set(0, 0.26, 0);
  bang.add(barG);
  const dotG = meshBox(0.1, 0.1, 0.1, "#c8962a");
  dotG.position.set(0, -0.02, 0);
  bang.add(dotG);
  bang.position.set(0, 2.7, 0);
  cart.add(bang);

  // Place the whole stand on the street.
  const cartE = world.createTransformEntity(cart);
  cartE.object3D!.position.set(GUS_SPOT.x, 0, GUS_SPOT.z);
  cartE.object3D!.rotation.y = GUS_SPOT.faceY;

  // ---- The greeting bubble. Parked over Gus's head it ran off the TOP of the
  // screen up close (eye height is ~1.6, the bubble sat at 3.1), so you could not
  // read it. Instead it floats in front of you, a little above eye level so it
  // still reads as Gus speaking from above, always faces you, and draws ON TOP so
  // his cart and awning never cover it. depthTest off + a high renderOrder keep
  // it over the world. ----
  const bubbleMat = new MeshBasicMaterial({
    map: makeBubbleTexture(GREETING),
    transparent: true,
    side: DoubleSide,
    depthTest: false,
    depthWrite: false,
  });
  const bubble = new Mesh(new PlaneGeometry(2.3, 1.2), bubbleMat);
  bubble.renderOrder = 2000;
  const bubbleE = world.createTransformEntity(bubble);
  bubbleE.object3D!.position.set(GUS_SPOT.x, 3.1, GUS_SPOT.z);
  bubbleE.object3D!.visible = false;

  // ---- Watch how close the player is. Far out, Gus waves you over with the "!".
  // In the greeting band the bubble floats readably in front of you. Once you are
  // close enough for his question panel, the greeting steps aside for it. ----
  const GREET_FAR = RADIUS;  // start greeting at this range
  const GREET_NEAR = 3.0;    // inside here the question panel takes over (matches it)
  const GREET_DIST = 3.7;    // how far ahead of you the bubble floats (readable size)
  const GREET_RAISE = 0.22;  // just above eye level, so it still reads as "up" but stays on screen
  const camPos = new Vector3();
  const bubbleFwd = new Vector3();
  let t = 0;
  setInterval(function () {
    t = t + 1;
    const cam = world.camera;
    if (!cam) return;
    cam.getWorldPosition(camPos);
    const dx = camPos.x - GUS_SPOT.x;
    const dz = camPos.z - GUS_SPOT.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const showGreeting = dist <= GREET_FAR && dist > GREET_NEAR;
    bubbleE.object3D!.visible = showGreeting;
    bang.visible = dist > GREET_FAR;
    bang.position.y = 2.7 + Math.sin(t * 0.12) * 0.08;
    if (showGreeting) {
      cam.getWorldDirection(bubbleFwd);
      bubbleFwd.y = 0;
      if (bubbleFwd.lengthSq() < 1e-6) bubbleFwd.set(0, 0, -1);
      bubbleFwd.normalize();
      const px = camPos.x + bubbleFwd.x * GREET_DIST;
      const pz = camPos.z + bubbleFwd.z * GREET_DIST;
      bubbleE.object3D!.position.set(px, camPos.y + GREET_RAISE, pz);
      bubbleE.object3D!.rotation.set(0, Math.atan2(camPos.x - px, camPos.z - pz), 0, "YXZ");
    }
  }, 33);
}

// ============================================================================
// MONEY PLANT  —  a potted plant by the bank that grows with Financial Growth.
// The pot stays the same size; the leafy part scales up smoothly as the Growth
// meter climbs, so good money habits have something living to show for them.
// index.ts calls setPlantGrowth() whenever Growth changes.
// ============================================================================
let plantPivot: any = null;     // the growable part (stem, leaves, bloom)
let plantTargetScale = 0.75;    // where the plant is growing toward
let plantCurrentScale = 0.75;   // where it is right now (eased toward the target)

// Set how grown the plant should be. frac is 0 (tiny) to 1 (full). A Growth
// meter of 50 maps to about half grown.
export function setPlantGrowth(frac: number) {
  const f = Math.max(0, Math.min(1, frac));
  plantTargetScale = 0.4 + 0.7 * f;
}

// A slow loop that eases the plant toward its target size, so growth glides.
function startPlantAnim() {
  setInterval(function () {
    if (!plantPivot) return;
    plantCurrentScale = plantCurrentScale + (plantTargetScale - plantCurrentScale) * 0.12;
    plantPivot.scale.setScalar(plantCurrentScale);
  }, 33);
}

// Build the pot, the seed coins, and the growable plant, and drop it by the bank.
function buildMoneyPlant(world: any) {
  const g = new Group();

  // Terracotta pot with a rim and soil.
  const pot = meshCyl(0.34, 0.24, 0.46, "#b5683b", 16);
  pot.position.set(0, 0.23, 0);
  g.add(pot);
  const rim = meshCyl(0.37, 0.37, 0.08, "#9c5430", 16);
  rim.position.set(0, 0.46, 0);
  g.add(rim);
  const soil = meshCyl(0.31, 0.31, 0.06, "#4a3320", 14);
  soil.position.set(0, 0.48, 0);
  g.add(soil);

  // Two gold coins resting by the pot (the seed money).
  const coinA = meshSphere(0.1, "#c8962a", 12);
  coinA.scale.set(1, 0.4, 1);
  coinA.position.set(0.44, 0.06, 0.16);
  g.add(coinA);
  const coinB = meshSphere(0.1, "#c8962a", 12);
  coinB.scale.set(1, 0.4, 1);
  coinB.position.set(0.52, 0.06, -0.08);
  g.add(coinB);

  // The growable part: stem, three leaves, and a gold bloom. This whole group
  // scales together, growing up and out from the soil.
  const pivot = new Group();
  pivot.position.set(0, 0.49, 0);

  const stem = meshCyl(0.045, 0.07, 1.1, "#3f8f3a", 8);
  stem.position.set(0, 0.55, 0);
  pivot.add(stem);

  const leaf1 = meshSphere(0.22, "#57a83f", 12);
  leaf1.scale.set(1.5, 0.7, 1);
  leaf1.position.set(0.2, 0.5, 0);
  pivot.add(leaf1);
  const leaf2 = meshSphere(0.22, "#57a83f", 12);
  leaf2.scale.set(1.5, 0.7, 1);
  leaf2.position.set(-0.2, 0.82, 0);
  pivot.add(leaf2);
  const leaf3 = meshSphere(0.26, "#4e9f3a", 12);
  leaf3.position.set(0, 1.12, 0);
  pivot.add(leaf3);

  const bloom = meshSphere(0.17, "#c8962a", 14);
  bloom.position.set(0, 1.34, 0);
  pivot.add(bloom);

  g.add(pivot);
  plantPivot = pivot;
  plantCurrentScale = 0.4 + 0.7 * 0.5; // start matching a Growth meter of 50
  plantTargetScale = plantCurrentScale;
  pivot.scale.setScalar(plantCurrentScale);

  const e = world.createTransformEntity(g);
  e.object3D!.position.set(STATIONS.bank.x - 2.9, 0, STATIONS.bank.z + 2.4);

  startPlantAnim();
}

// ============================================================================
// AMBIENT LIFE  —  a dog, a stroller, and two birds, so Main Street feels
// lived in. None of this changes the lesson; it is set dressing. Everything
// moves on one gentle loop, and it shares no state with the game. No new imports.
// ============================================================================
function buildDog() {
  const d = new Group();
  const body = meshBox(0.5, 0.26, 0.22, "#8a5a2b"); body.position.set(0, 0.3, 0); d.add(body);
  const head = meshBox(0.2, 0.2, 0.2, "#8a5a2b"); head.position.set(0.32, 0.36, 0); d.add(head);
  const snout = meshBox(0.12, 0.1, 0.1, "#6e4420"); snout.position.set(0.45, 0.31, 0); d.add(snout);
  for (const ez of [0.07, -0.07]) {
    const ear = meshBox(0.05, 0.12, 0.08, "#6e4420");
    ear.position.set(0.28, 0.48, ez);
    d.add(ear);
  }
  const tail = meshBox(0.18, 0.05, 0.05, "#8a5a2b"); tail.position.set(-0.3, 0.4, 0); tail.rotation.z = 0.7; d.add(tail);
  for (const lp of [[0.18, 0.09], [0.18, -0.09], [-0.18, 0.09], [-0.18, -0.09]]) {
    const leg = meshBox(0.07, 0.22, 0.07, "#6e4420");
    leg.position.set(lp[0], 0.11, lp[1]);
    d.add(leg);
  }
  return d;
}

function buildPasserby() {
  const p = new Group();
  const legs = meshCyl(0.1, 0.13, 0.5, "#39404c", 8); legs.position.set(0, 0.25, 0); p.add(legs);
  const coat = meshCyl(0.17, 0.13, 0.52, "#3a6ea5", 10); coat.position.set(0, 0.73, 0); p.add(coat);
  const head = meshSphere(0.13, "#e0b48c", 12); head.position.set(0, 1.04, 0); p.add(head);
  const hat = meshCyl(0.15, 0.15, 0.08, "#2b3550", 10); hat.position.set(0, 1.16, 0); p.add(hat);
  return p;
}

function buildBird(bodyColor: string) {
  const g = new Group();
  const body = meshSphere(0.12, bodyColor, 10); body.scale.set(1.3, 1, 1); g.add(body);
  const head = meshSphere(0.08, bodyColor, 10); head.position.set(0.13, 0.05, 0); g.add(head);
  const beak = meshCone(0.04, 0.09, "#e0a020", 8); beak.position.set(0.22, 0.05, 0); beak.rotation.z = -Math.PI / 2; g.add(beak);
  const wingL = meshBox(0.16, 0.03, 0.1, bodyColor); wingL.position.set(-0.02, 0.05, 0.12); g.add(wingL);
  const wingR = meshBox(0.16, 0.03, 0.1, bodyColor); wingR.position.set(-0.02, 0.05, -0.12); g.add(wingR);
  return { group: g, wingL: wingL, wingR: wingR };
}

function buildAmbientLife(world: any) {
  // A dog trotting in front of the shops.
  const dogObj = world.createTransformEntity(buildDog()).object3D!;
  dogObj.position.set(0, 0, -2.8);

  // Someone strolling along the road.
  const personObj = world.createTransformEntity(buildPasserby()).object3D!;
  personObj.position.set(0, 0, -4.4);

  // Two birds circling above the street.
  const b1 = buildBird("#3a7bd5");
  const bird1Obj = world.createTransformEntity(b1.group).object3D!;
  const b2 = buildBird("#c0563f");
  const bird2Obj = world.createTransformEntity(b2.group).object3D!;

  let t = 0;
  setInterval(function () {
    t = t + 1;

    // Dog: trots back and forth, faces the way it walks, with a little bounce.
    dogObj.position.set(Math.sin(t * 0.025) * 4.0, Math.abs(Math.sin(t * 0.3)) * 0.05, -2.8);
    dogObj.rotation.y = Math.cos(t * 0.025) > 0 ? 0 : Math.PI;

    // Person: a slow stroll along the road.
    personObj.position.set(Math.sin(t * 0.015) * 6.0, 0, -4.4);

    // Bird 1: a wide circle with flapping wings.
    const a1 = t * 0.03;
    bird1Obj.position.set(Math.cos(a1) * 5.0, 3.4 + Math.sin(t * 0.1) * 0.3, -5 + Math.sin(a1) * 4.0);
    bird1Obj.rotation.y = -a1;
    const flap1 = Math.sin(t * 0.8) * 0.6;
    b1.wingL.rotation.x = flap1;
    b1.wingR.rotation.x = -flap1;

    // Bird 2: a smaller, offset circle.
    const a2 = t * 0.026 + 2.0;
    bird2Obj.position.set(2 + Math.cos(a2) * 4.0, 3.9 + Math.sin(t * 0.12) * 0.3, -5 + Math.sin(a2) * 3.2);
    bird2Obj.rotation.y = -a2;
    const flap2 = Math.sin(t * 0.9) * 0.6;
    b2.wingL.rotation.x = flap2;
    b2.wingR.rotation.x = -flap2;
  }, 33);
}

// ----------------------------------------------------------------------------
// buildEnvironment  —  put the whole street together. Returns the walkable
// ground so index.ts can mark it for locomotion. Signature unchanged.
// ----------------------------------------------------------------------------
// ============================================================================
// STATION BEACONS  —  a glowing beam with a bobbing arrow over the place you
// should walk to next. Gus already waves you over with his gold "!"; these do
// the same job for the Bank and the Business lot. The game toggles which one is
// lit (setBeaconTarget) as the current objective changes, so kids in a headset
// always have a clear "go here" landmark — the single biggest wayfinding win.
// ============================================================================
const beacons: { bank: Group | null; business: Group | null; markers: Mesh[] } = {
  bank: null,
  business: null,
  markers: [],
};

function makeBeacon(x: number, z: number): Group {
  const g = new Group();
  // A soft, tall gold beam so it reads from across the plaza.
  const beamMat = new MeshBasicMaterial({
    color: new Color("#c8962a"),
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });
  const beam = new Mesh(new CylinderGeometry(0.14, 0.14, 6, 10), beamMat);
  beam.position.y = 3;
  g.add(beam);
  // A bright arrow pointing down at the spot, bobbing so it draws the eye.
  const mark = new Mesh(new ConeGeometry(0.36, 0.7, 4), new MeshBasicMaterial({ color: new Color("#c8962a") }));
  mark.rotation.x = Math.PI; // point down
  mark.position.y = 4.6;
  g.add(mark);
  beacons.markers.push(mark);
  g.position.set(x, 0, z);
  g.visible = false;
  return g;
}

function buildBeacons(world: any) {
  beacons.bank = makeBeacon(STATIONS.bank.x, STATIONS.bank.z);
  beacons.business = makeBeacon(STATIONS.business.x, STATIONS.business.z);
  world.createTransformEntity(beacons.bank);
  world.createTransformEntity(beacons.business);
  let t = 0;
  setInterval(function () {
    t = t + 1;
    const y = 4.6 + Math.sin(t * 0.1) * 0.2;
    for (const m of beacons.markers) {
      m.position.y = y;
      m.rotation.y = t * 0.05; // slow spin
    }
  }, 33);
}

// Light exactly one station beacon (or none). Called by the game as the goal
// moves from Gus to a station and back.
export function setBeaconTarget(target: "none" | "bank" | "business") {
  if (beacons.bank) beacons.bank.visible = target === "bank";
  if (beacons.business) beacons.business.visible = target === "business";
}

export function buildEnvironment(world: any) {
  buildSkyAndLights(world);
  const ground = buildStreet(world);
  const boundary = buildBoundary(world);
  buildHome(world, STATIONS.home.x, STATIONS.home.z, STATIONS.home.faceY);
  buildBank(world, STATIONS.bank.x, STATIONS.bank.z, STATIONS.bank.faceY);
  buildStore(world, STATIONS.store.x, STATIONS.store.z, STATIONS.store.faceY);
  buildBusinessLot(world, STATIONS.business.x, STATIONS.business.z, STATIONS.business.faceY);
  buildTrees(world);
  buildLamps(world);
  buildGus(world);
  buildBeacons(world);
  buildMoneyPlant(world);
  buildAmbientLife(world);
  return { ground, boundary };
}
