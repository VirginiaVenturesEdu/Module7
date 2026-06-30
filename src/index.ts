// ============================================================================
// Money Moves: Your Financial Literacy
// FOUNDATION SHELL  —  rebuilt to match the Market Harvest (m4) house style.
// This file sets up:
//   1. The economic CONSTANTS (kept; the stages will read these)
//   2. The house colors (cream / navy / gold / green)
//   3. The three score meters and the HUD that shows them
//   4. The IWSDK world: a walkable, lit space, with mouse-look + WASD/thumbstick
//   5. The hidden-panel click guard and a press helper (needed once panels exist)
//   6. The phase machine skeleton (Setup -> Stage 1 -> 2 -> 3 -> Report)
// The stations, the mentor, the panels, and the stage logic arrive in later prompts.
// ============================================================================

import {
  World,
  SessionMode,
  LocomotionEnvironment,
  EnvironmentType,
  VisibilityState,
  Pressed,
  PanelUI,
  PanelDocument,
  Interactable,
  Vector3,
  Quaternion,
  Box3,
} from "@iwsdk/core";

import { buildEnvironment, setStageLook, GUS_SPOT, STATIONS, setPlantGrowth } from "./environment";
import { sfxStage, sfxClick, sfxCoin, sfxFanfare } from "./sfx";

// ============================================================================
// ECONOMIC CONSTANTS  (carried over; the stages read these in later prompts)
// ============================================================================
const ECON = {
  STARTING_MONEY: 20,            // birthday money in the piggy bank
  ALLOWANCE_PER_WEEK: 10,        // money earned each week in Stage 1
  SAVINGS_INTEREST_RATE: 0.1,    // savings grows this much each week
  FRIEND_OFFER_PRICE: 15,        // the rare item the friend offers in Stage 1
  PAYCHECK_STAGE2: 100,          // the Stage 2 part-time-job paycheck
  INVEST_GOOD_MULTIPLIER: 1.4,   // an investment that does well
  INVEST_BAD_MULTIPLIER: 0.7,    // an investment that struggles
  INVEST_GOOD_PROBABILITY: 0.55, // chance an investment does well
  BIG_DECISION_FUNDS: 200,       // the Stage 3 money to spread around
  SURPRISE_EXPENSE: 30,          // the unexpected cost in Stage 3
  DIVERSIFY_MIN_CHANNELS: 3,     // places you must use to count as spreading out
};

// ============================================================================
// HOUSE PALETTE  (the Market Harvest colonial parchment look)
// Bright values are for graphics (bars). The TEXT_ values are darker,
// high-contrast versions for words on light backgrounds.
// ============================================================================
const COLOR_NAVY = "#1F3A5F";
const TEXT_GOLD = "#8a6118";
const TEXT_GREEN = "#2e7d32";
const TEXT_BLUE = "#1e5fa8";
const METER_GROWTH_COLOR = "#5fae4a";   // Financial Growth bar (green)
const METER_SECURITY_COLOR = "#4a8fd6"; // Financial Security bar (blue)
const METER_SMARTS_COLOR = "#c8962a";   // Money Smarts bar (gold)

// ============================================================================
// THREE METERS  (each starts at 50, the neutral middle, and moves 0..100)
// ============================================================================
const SCORE_MIN = 0;
const SCORE_MAX = 100;
let scoreGrowth = 50;
let scoreSecurity = 50;
let scoreSmarts = 50;

// Which plan the player picked in each stage. The final money personality is
// decided from THESE choices, not just the meter numbers, so the report can
// never tell a spender they were a saver. Set when a plan card is clicked.
let stage1Choice = "";
let stage2Choice = "";
let stage3Choice = "";

function clampScore(value: number): number {
  return Math.max(SCORE_MIN, Math.min(SCORE_MAX, value));
}

// The one and only way to change a meter. meter is "growth", "security", or
// "smarts"; delta is positive to reward, negative to penalize.
function updateScore(meter: string, delta: number) {
  let before = 0;
  let after = 0;
  if (meter === "growth") { before = scoreGrowth; after = clampScore(scoreGrowth + delta); scoreGrowth = after; }
  else if (meter === "security") { before = scoreSecurity; after = clampScore(scoreSecurity + delta); scoreSecurity = after; }
  else if (meter === "smarts") { before = scoreSmarts; after = clampScore(scoreSmarts + delta); scoreSmarts = after; }
  else { console.warn("updateScore: unknown meter " + meter); return; }
  console.log("[SCORE] " + meter + ": " + before + " to " + after);
  if (meter === "growth") setPlantGrowth(scoreGrowth / 100);
  refreshHUD();
  if (meter === "growth") bumpHudValue(hudGrowthValue);
  else if (meter === "security") bumpHudValue(hudSecurityValue);
  else bumpHudValue(hudSmartsValue);
}
void updateScore; // used by the stages in later prompts

// ============================================================================
// HUD  (a small panel pinned to the top-left, always showing the three meters)
// Built as a plain HTML overlay on top of the 3D canvas. pointerEvents is off
// so it never blocks a click. A matching 3D scoreboard for the headset is added
// with the panels in a later prompt.
// ============================================================================
let hudGrowthValue: HTMLElement | null = null;
let hudSecurityValue: HTMLElement | null = null;
let hudSmartsValue: HTMLElement | null = null;
let hudGrowthFill: HTMLElement | null = null;
let hudSecurityFill: HTMLElement | null = null;
let hudSmartsFill: HTMLElement | null = null;
let hudStageChip: HTMLElement | null = null;
let hudObjective: HTMLElement | null = null;

function makeHudMeter(label: string, barColor: string, textColor: string) {
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.gap = "8px";
  row.style.marginBottom = "7px";

  const labelEl = document.createElement("span");
  labelEl.textContent = label;
  labelEl.style.color = COLOR_NAVY;
  labelEl.style.fontWeight = "700";
  labelEl.style.width = "140px";
  labelEl.style.whiteSpace = "nowrap";

  const track = document.createElement("div");
  track.style.width = "90px";
  track.style.height = "12px";
  track.style.background = "#e4ddd0";
  track.style.borderRadius = "6px";
  track.style.overflow = "hidden";
  track.style.flexShrink = "0";

  const fill = document.createElement("div");
  fill.style.height = "100%";
  fill.style.width = "50%";
  fill.style.background = barColor;
  fill.style.borderRadius = "6px";
  fill.style.transition = "width 0.45s ease";
  track.appendChild(fill);

  const value = document.createElement("span");
  value.textContent = "50";
  value.style.color = textColor;
  value.style.fontWeight = "800";
  value.style.minWidth = "26px";
  value.style.textAlign = "right";
  value.style.transition = "transform 0.18s ease";

  row.appendChild(labelEl);
  row.appendChild(track);
  row.appendChild(value);
  return { row, value, fill };
}

function createHUD() {
  const hud = document.createElement("div");
  hud.style.position = "fixed";
  hud.style.top = "16px";
  hud.style.left = "16px";
  hud.style.zIndex = "1000";
  hud.style.background = "rgba(255, 252, 244, 0.95)";
  hud.style.padding = "12px 16px 10px";
  hud.style.borderRadius = "14px";
  hud.style.border = "2px solid " + COLOR_NAVY;
  hud.style.fontFamily = "system-ui, sans-serif";
  hud.style.fontSize = "14px";
  hud.style.boxShadow = "0 4px 14px rgba(31, 58, 95, 0.3)";
  hud.style.pointerEvents = "none";

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.justifyContent = "space-between";
  header.style.gap = "12px";
  header.style.marginBottom = "8px";

  const title = document.createElement("span");
  title.textContent = "Money Moves";
  title.style.color = COLOR_NAVY;
  title.style.fontWeight = "800";
  title.style.fontSize = "15px";

  hudStageChip = document.createElement("span");
  hudStageChip.textContent = "Getting Ready";
  hudStageChip.style.background = TEXT_GREEN;
  hudStageChip.style.color = "#ffffff";
  hudStageChip.style.fontWeight = "700";
  hudStageChip.style.fontSize = "12px";
  hudStageChip.style.padding = "2px 10px";
  hudStageChip.style.borderRadius = "10px";

  header.appendChild(title);
  header.appendChild(hudStageChip);
  hud.appendChild(header);

  const moneyRow = buildMoneyRow();
  hud.appendChild(moneyRow);

  const growthRow = makeHudMeter("Financial Growth", METER_GROWTH_COLOR, TEXT_GREEN);
  const securityRow = makeHudMeter("Financial Security", METER_SECURITY_COLOR, TEXT_BLUE);
  const smartsRow = makeHudMeter("Money Smarts", METER_SMARTS_COLOR, TEXT_GOLD);

  hudGrowthValue = growthRow.value;
  hudSecurityValue = securityRow.value;
  hudSmartsValue = smartsRow.value;
  hudGrowthFill = growthRow.fill;
  hudSecurityFill = securityRow.fill;
  hudSmartsFill = smartsRow.fill;

  hud.appendChild(growthRow.row);
  hud.appendChild(securityRow.row);
  hud.appendChild(smartsRow.row);

  hudObjective = document.createElement("div");
  hudObjective.textContent = "";
  hudObjective.style.marginTop = "8px";
  hudObjective.style.background = TEXT_GOLD;
  hudObjective.style.color = "#ffffff";
  hudObjective.style.fontWeight = "800";
  hudObjective.style.fontSize = "13px";
  hudObjective.style.padding = "6px 10px";
  hudObjective.style.borderRadius = "10px";
  hudObjective.style.maxWidth = "260px";
  hudObjective.style.display = "none";
  hud.appendChild(hudObjective);

  document.body.appendChild(hud);
  refreshHUD();
}

// Push the current numbers and bar widths into the HUD.
function refreshHUD() {
  if (hudGrowthValue) hudGrowthValue.textContent = String(Math.round(scoreGrowth));
  if (hudSecurityValue) hudSecurityValue.textContent = String(Math.round(scoreSecurity));
  if (hudSmartsValue) hudSmartsValue.textContent = String(Math.round(scoreSmarts));
  if (hudGrowthFill) hudGrowthFill.style.width = scoreGrowth + "%";
  if (hudSecurityFill) hudSecurityFill.style.width = scoreSecurity + "%";
  if (hudSmartsFill) hudSmartsFill.style.width = scoreSmarts + "%";
  updateScoreboard();
}

// ============================================================================
// 3D SCOREBOARD (the headset dashboard)
// The HUD above is a plain DOM overlay: the browser draws it, but an immersive
// headset only renders the WebGL scene, so the DOM dashboard is invisible in VR.
// This mirrors the same money + three meters onto a uikit panel (ui/scoreboard)
// that softly follows the player's view. updateScoreboard() writes the live
// values; the follow loop in World.create keeps it in front of the player.
// ============================================================================
let sbDoc: any = null;
let sbMoneyEl: any = null;
let sbGrowthVal: any = null;
let sbSecurityVal: any = null;
let sbSmartsVal: any = null;
let sbGrowthFill: any = null;
let sbSecurityFill: any = null;
let sbSmartsFill: any = null;
const METER_TRACK_WIDTH = 24; // MUST match .track width in ui/scoreboard.uikitml
// Last values pushed to the panel, so setProperties only runs on an actual change.
let sbLastMoney = Number.NaN;
let sbLastGrowth = Number.NaN;
let sbLastSecurity = Number.NaN;
let sbLastSmarts = Number.NaN;

function updateScoreboard() {
  if (!sbDoc) return;
  if (currentMoney !== sbLastMoney) {
    sbMoneyEl?.setProperties({ text: "$" + currentMoney });
    sbLastMoney = currentMoney;
  }
  const g = Math.round(scoreGrowth);
  if (g !== sbLastGrowth) {
    sbGrowthVal?.setProperties({ text: String(g) });
    sbGrowthFill?.setProperties({ width: (g / 100) * METER_TRACK_WIDTH });
    sbLastGrowth = g;
  }
  const s = Math.round(scoreSecurity);
  if (s !== sbLastSecurity) {
    sbSecurityVal?.setProperties({ text: String(s) });
    sbSecurityFill?.setProperties({ width: (s / 100) * METER_TRACK_WIDTH });
    sbLastSecurity = s;
  }
  const m = Math.round(scoreSmarts);
  if (m !== sbLastSmarts) {
    sbSmartsVal?.setProperties({ text: String(m) });
    sbSmartsFill?.setProperties({ width: (m / 100) * METER_TRACK_WIDTH });
    sbLastSmarts = m;
  }
}

// A quick pop on a number that just changed.
function bumpHudValue(el: HTMLElement | null) {
  if (!el) return;
  el.style.transform = "scale(1.25)";
  setTimeout(function () { if (el) el.style.transform = "scale(1)"; }, 180);
}

// One short line telling the student what to do right now.
function setObjective(text: string) {
  if (hudObjective) {
    hudObjective.textContent = text ? "Goal: " + text : "";
    hudObjective.style.display = text ? "block" : "none";
  }
  console.log("[OBJECTIVE] " + text);
}

// Update the little stage label in the HUD header for each phase.
function setHudStage(phase: string) {
  if (!hudStageChip) return;
  let label = "Getting Ready";
  if (phase === PHASE_S1) label = "Stage 1";
  else if (phase === PHASE_S2) label = "Stage 2";
  else if (phase === PHASE_S3) label = "Stage 3";
  else if (phase === PHASE_REPORT) label = "Report";
  hudStageChip.textContent = label;
}

// ============================================================================
// MONEY READOUT  (a live "Your Money" number on the dashboard)
// A fresh amount each stage. setMoney() sets it when a stage begins. changeMoney()
// nudges it up or down as the student spends, saves, earns, or invests, counting
// to the new value and flashing green for a gain or red for a loss. The number
// lives in the HUD (a screen overlay), so it shows on a laptop. In the headset,
// the stage panels show the money where it changes.
// ============================================================================
let currentMoney = 0;
let moneyRowEl: HTMLElement | null = null;
let moneyValueEl: HTMLElement | null = null;
const MONEY_DOWN = "#a33b2a"; // rust red for a loss (green and gold reuse the palette)

// Build the "Your Money" row. createHUD() drops it in at the top of the panel.
function buildMoneyRow(): HTMLElement {
  const row = document.createElement("div");
  row.style.display = "none"; // hidden until a stage sets an amount
  row.style.alignItems = "center";
  row.style.justifyContent = "space-between";
  row.style.gap = "10px";
  row.style.margin = "2px 0 10px";
  row.style.padding = "7px 11px";
  row.style.background = "#fbf3dd";
  row.style.border = "1px solid #e8d6a8";
  row.style.borderRadius = "10px";

  const label = document.createElement("span");
  label.textContent = "Your Money";
  label.style.color = COLOR_NAVY;
  label.style.fontWeight = "800";
  label.style.fontSize = "13px";

  moneyValueEl = document.createElement("span");
  moneyValueEl.textContent = "$0";
  moneyValueEl.style.color = TEXT_GOLD;
  moneyValueEl.style.fontWeight = "800";
  moneyValueEl.style.fontSize = "20px";
  moneyValueEl.style.transition = "transform 0.16s ease, color 0.2s ease";

  row.appendChild(label);
  row.appendChild(moneyValueEl);
  moneyRowEl = row;
  return row;
}

function showMoneyRow() {
  if (moneyRowEl) moneyRowEl.style.display = "flex";
}
function hideMoneyRow() {
  if (moneyRowEl) moneyRowEl.style.display = "none";
}

// Set the money to a fresh amount (used when each stage begins). Instant, with a pop.
function setMoney(amount: number) {
  currentMoney = Math.max(0, Math.round(amount));
  showMoneyRow();
  if (moneyValueEl) {
    moneyValueEl.style.color = TEXT_GOLD;
    moneyValueEl.textContent = "$" + currentMoney;
    moneyValueEl.style.transform = "scale(1.18)";
    setTimeout(function () {
      if (moneyValueEl) moneyValueEl.style.transform = "scale(1)";
    }, 170);
  }
  console.log("[MONEY] set to " + currentMoney);
}

// Count the money up or down by delta, flashing green for a gain, red for a loss.
// (Used by the coin budgeting and the investing result in the next prompts.)
function changeMoney(delta: number) {
  const target = Math.max(0, Math.round(currentMoney + delta));
  if (delta === 0) {
    if (moneyValueEl) {
      moneyValueEl.style.transform = "scale(1.12)";
      setTimeout(function () {
        if (moneyValueEl) moneyValueEl.style.transform = "scale(1)";
      }, 160);
    }
    currentMoney = target;
    console.log("[MONEY] unchanged at " + currentMoney);
    return;
  }
  animateMoneyTo(target, delta > 0);
  console.log("[MONEY] change " + delta + " to " + target);
}
void changeMoney; // used by the stages in the next prompts

// The little counting animation behind changeMoney().
function animateMoneyTo(target: number, isGain: boolean) {
  if (!moneyValueEl) {
    currentMoney = target;
    return;
  }
  const start = currentMoney;
  const steps = 14;
  let i = 0;
  moneyValueEl.style.color = isGain ? TEXT_GREEN : MONEY_DOWN;
  moneyValueEl.style.transform = "scale(1.28)";
  const timer = setInterval(function () {
    i = i + 1;
    const t = i / steps;
    const val = Math.round(start + (target - start) * t);
    if (moneyValueEl) moneyValueEl.textContent = "$" + val;
    if (i >= steps) {
      clearInterval(timer);
      if (moneyValueEl) {
        moneyValueEl.textContent = "$" + target;
        moneyValueEl.style.transform = "scale(1)";
      }
      setTimeout(function () {
        if (moneyValueEl) moneyValueEl.style.color = TEXT_GOLD;
      }, 280);
    }
  }, 26);
  currentMoney = target;
}

// ============================================================================
// PHASE MACHINE  (the master flow; panels get attached in a later prompt)
// ============================================================================
const PHASE_SETUP = "setup";
const PHASE_S1 = "stage1";
const PHASE_S2 = "stage2";
const PHASE_S3 = "stage3";
const PHASE_REPORT = "report";
const PHASE_ORDER = [PHASE_SETUP, PHASE_S1, PHASE_S2, PHASE_S3, PHASE_REPORT];
let currentPhase = PHASE_SETUP;

// Panels registered per phase. showPhase shows the active one and hides the rest.
const phasePanels: any = {};

function showPhase(phase: string) {
  currentPhase = phase;
  setHudStage(phase);
  if (phase === PHASE_SETUP) setMoney(ECON.STARTING_MONEY);
  else if (phase === PHASE_S1) setMoney(ECON.STARTING_MONEY + ECON.ALLOWANCE_PER_WEEK);
  else if (phase === PHASE_S2) setMoney(ECON.PAYCHECK_STAGE2);
  else if (phase === PHASE_S3) setMoney(ECON.BIG_DECISION_FUNDS);
  else hideMoneyRow();
  for (const key in phasePanels) {
    const panel = phasePanels[key];
    if (panel && panel.object3D) panel.object3D.visible = false;
  }
  const active = phasePanels[phase];
  if (active && active.object3D) active.object3D.visible = true;
  console.log("[PHASE] now in " + phase);
}

function nextPhase() {
  const i = PHASE_ORDER.indexOf(currentPhase);
  const next = PHASE_ORDER[i + 1];
  if (next) {
    sfxStage();
    showPhase(next);
  }
}
void nextPhase; // called by the panels in later prompts

// ============================================================================
// THE WORLD
// ============================================================================
World.create(document.getElementById("scene-container") as HTMLDivElement, {
  assets: {},
  xr: {
    sessionMode: SessionMode.ImmersiveVR,
    offer: "always",
    features: { handTracking: { required: false }, layers: { required: false } },
  },
  features: {
    // initialPlayerPosition spawns the player RIG (the locomotion collision
    // capsule) on the entrance side of the plaza. The camera below sits at
    // local z 0, so the capsule lines up with where you actually appear to
    // stand — that is what makes the hedge boundary stop you in the right place.
    // useWorker is OFF on purpose: the worker only syncs world.player back to the
    // app after the first move, so with it on the spawn would sit at the origin
    // and snap forward on the first keypress. On the main thread the initial
    // position applies immediately. The scene is light, so there is no cost.
    locomotion: { useWorker: false, browserControls: true, initialPlayerPosition: [0, 0, 7] },
    grabbing: true,
    physics: true,
    sceneUnderstanding: false,
    environmentRaycast: false,
  },
}).then(function (world) {
  const scene = world.scene;
  const camera = world.camera;

  // Eye height only — no z offset. The player rig is spawned back on the
  // entrance side via locomotion's initialPlayerPosition, so keeping the camera
  // at local z 0 means the collision capsule sits exactly under the viewer
  // (otherwise walls would block you metres away from where they look).
  camera.position.set(0, 1.6, 0);

  // --------------------------------------------------------------------------
  // BROWSER MOUSE LOOK (right button looks; left button stays for clicks).
  // In the headset the headset owns the view, so this only runs in the browser.
  // --------------------------------------------------------------------------
  const lookContainer = document.getElementById("scene-container") as HTMLDivElement;
  const LOOK_BUTTON = 2; // right mouse button
  let lookDragging = false;
  let lookHasLooked = false;
  let lookLastX = 0;
  let lookLastY = 0;
  let lookYaw = 0;
  let lookPitch = 0;
  const LOOK_SENSITIVITY = 0.0025;
  const LOOK_PITCH_LIMIT = 1.4;

  lookContainer.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  lookContainer.addEventListener("pointerdown", function (e) {
    if (e.button !== LOOK_BUTTON) return;
    lookDragging = true;
    lookHasLooked = true;
    lookLastX = e.clientX;
    lookLastY = e.clientY;
    lookContainer.style.cursor = "grabbing";
  });
  window.addEventListener("pointermove", function (e) {
    if (!lookDragging) return;
    const dx = e.clientX - lookLastX;
    const dy = e.clientY - lookLastY;
    lookLastX = e.clientX;
    lookLastY = e.clientY;
    lookYaw = lookYaw - dx * LOOK_SENSITIVITY;
    lookPitch = lookPitch - dy * LOOK_SENSITIVITY;
    lookPitch = Math.max(-LOOK_PITCH_LIMIT, Math.min(LOOK_PITCH_LIMIT, lookPitch));
  });
  window.addEventListener("pointerup", function (e) {
    if (e.button !== LOOK_BUTTON) return;
    lookDragging = false;
    lookContainer.style.cursor = "";
  });

  function browserLookLoop() {
    if (lookHasLooked) {
      if (world.visibilityState.peek() === VisibilityState.NonImmersive) {
        camera.rotation.set(lookPitch, lookYaw, 0, "YXZ");
      }
    }
    requestAnimationFrame(browserLookLoop);
  }
  browserLookLoop();

  // --------------------------------------------------------------------------
  // HIDDEN-PANEL CLICK GUARD
  // IWSDK keeps every panel alive and just toggles visibility. Pointer ray tests
  // do NOT skip invisible meshes, so a hidden button can sit in front of a real
  // one and silently swallow the click. Each tick we mark effectively-hidden ray
  // targets pointerEvents = "none" so they are skipped, and restore them when
  // shown. setInterval (not requestAnimationFrame) because rAF pauses in a headset.
  // --------------------------------------------------------------------------
  function hitTestVisibilityLoop() {
    const targets = (scene as any).rayDescendants as any[] | undefined;
    if (!targets) return;
    for (const obj of targets) {
      let visible = obj.visible;
      let p = obj.parent;
      while (visible) {
        if (!p) break;
        visible = p.visible;
        p = p.parent;
      }
      if (!visible) {
        if (!obj.__guardHidden) {
          obj.__savedPointerEvents = obj.pointerEvents;
          obj.__guardHidden = true;
        }
        obj.pointerEvents = "none";
      } else if (obj.__guardHidden) {
        obj.pointerEvents = obj.__savedPointerEvents;
        obj.__guardHidden = false;
      }
    }
  }
  setInterval(hitTestVisibilityLoop, 33);

  // --------------------------------------------------------------------------
  // PANEL PRESENTATION
  // The story panels are anchored in the world, near Gus or a building. But the
  // player almost always walks RIGHT UP to that anchor, ending up far too close
  // to read the panel — the cards and buttons at the bottom fall off the screen.
  // presentPanel snaps a panel to a comfortable distance directly in front of
  // the player, sized from the panel's real bounds and the live camera so the
  // WHOLE panel fits in view, then turns it to face the player. It is called
  // once each time a panel first appears (showPanel), so a panel you are reading
  // or clicking stays put. Works the same on desktop and in a headset.
  // --------------------------------------------------------------------------
  const _presEye = new Vector3();
  const _presFwd = new Vector3();
  const _presSize = new Vector3();
  const _presBox = new Box3();
  const PRESENT_MARGIN = 1.18;  // breathing room so the panel is not edge-to-edge
  const PRESENT_MIN_DIST = 2.4; // never closer than this, however small the panel
  const PRESENT_MAX_DIST = 6.0; // never farther than this, however large the panel

  function presentPanel(entity: any) {
    const cam: any = world.camera;
    const o3d = entity.object3D;
    if (!cam || !o3d) return;

    // Measure the panel's real size. For a flat panel turned only on its Y axis,
    // the width lives in the X/Z plane and the height is always Y, so this stays
    // correct no matter which way the panel is currently facing.
    _presBox.setFromObject(o3d);
    _presBox.getSize(_presSize);
    const w = Math.hypot(_presSize.x, _presSize.z) || 2.6;
    const h = _presSize.y > 0.01 ? _presSize.y : 2.2;

    // Distance that fits the height (vertical FOV) and the width (FOV * aspect).
    const tanV = Math.tan((cam.fov * Math.PI) / 360); // tan(halfFov)
    const aspect = cam.aspect || 1;
    const distH = h / 2 / tanV;
    const distW = w / 2 / (tanV * aspect);
    let dist = Math.max(distH, distW) * PRESENT_MARGIN;
    dist = Math.max(PRESENT_MIN_DIST, Math.min(PRESENT_MAX_DIST, dist));

    // Place it straight ahead of the camera, level, at the player's eye height.
    cam.getWorldPosition(_presEye);
    cam.getWorldDirection(_presFwd);
    _presFwd.y = 0;
    if (_presFwd.lengthSq() < 1e-6) _presFwd.set(0, 0, -1);
    _presFwd.normalize();
    const px = _presEye.x + _presFwd.x * dist;
    const pz = _presEye.z + _presFwd.z * dist;
    o3d.position.set(px, _presEye.y, pz);
    // Turn to face the player (a panel's front is its +Z side).
    o3d.rotation.set(0, Math.atan2(_presEye.x - px, _presEye.z - pz), 0, "YXZ");
    applyPanelOnTop(entity);
  }

  // Draw a panel OVER the 3D world so Gus, his cart, or a building can never sit
  // in front of it and hide the cards. The player walks right up to these spots,
  // so a readable (far enough) panel often lands at or behind the thing it
  // belongs to; turning off depth testing and lifting the render order keeps the
  // whole panel visible while preserving UIKit's own internal layering.
  function applyPanelOnTop(entity: any) {
    const o3d = entity.object3D;
    if (!o3d) return;
    o3d.traverse(function (child: any) {
      if (!child.isMesh || !child.material) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) {
        m.depthTest = false;
        m.depthWrite = false;
      }
      // Lift above the scene (renderOrder 0) once, keeping relative UIKit order.
      if (!child.__onTop) {
        child.renderOrder = (child.renderOrder || 0) + 2000;
        child.__onTop = true;
      }
    });
  }

  // Make a panel visible, snapping it in front of the player the first time it
  // appears. Idempotent while already shown, so reading/clicking it is stable.
  // The on-top maintenance loop (below) keeps it drawing over the world, even as
  // UIKit builds later content (a reply, a result) into the panel.
  function showPanel(entity: any) {
    const o3d = entity.object3D;
    if (!o3d) return;
    if (!o3d.visible) presentPanel(entity);
    o3d.visible = true;
  }

  // Every story panel, watched by one loop that re-applies applyPanelOnTop to
  // whichever is visible. UIKit creates text/glyph meshes lazily and only after
  // a panel's content is set, so a one-time pass misses them — a panel placed
  // behind Gus or a building would then show its boxes but hide its words. This
  // keeps the WHOLE visible panel on top, frame after frame.
  const storyPanels: any[] = [];
  setInterval(function () {
    for (const p of storyPanels) {
      if (p.object3D && p.object3D.visible) applyPanelOnTop(p);
    }
  }, 33);

  // --------------------------------------------------------------------------
  // The walkable world (sky, light, ground). See src/environment.ts.
  // --------------------------------------------------------------------------
  const built = buildEnvironment(world);
  const ground = built.ground;
  ground.addComponent(LocomotionEnvironment, { type: EnvironmentType.STATIC });
  // The hedge ring is collision too: the locomotion engine bakes its meshes into
  // the walkable BVH, so the player's capsule bumps into it and can no longer
  // walk off the edge of the world and fall.
  built.boundary.addComponent(LocomotionEnvironment, { type: EnvironmentType.STATIC });
  setStageLook(world, PHASE_SETUP);

  // Build the HUD and show the opening goal.
  createHUD();
  setObjective("Look around by holding the right mouse button, and walk with W A S D.");

  // --------------------------------------------------------------------------
  // 3D SCOREBOARD (the headset dashboard)
  // The top-left HUD is a DOM overlay, which a headset cannot render. This panel
  // mirrors money + the three meters onto a card that softly follows the player's
  // gaze, so the dashboard stays visible in VR. It is hidden in the browser (the
  // DOM HUD already covers that) and shown whenever a headset is presenting.
  // --------------------------------------------------------------------------
  const scoreboardPanel = world
    .createTransformEntity()
    .addComponent(PanelUI, { config: "./ui/scoreboard.json", maxWidth: 0.8, maxHeight: 1.0 });
  scoreboardPanel.object3D!.visible = false;

  whenPanelReady(scoreboardPanel, function (doc) {
    sbDoc = doc;
    sbMoneyEl = doc.getElementById("money-total");
    sbGrowthVal = doc.getElementById("val-growth");
    sbSecurityVal = doc.getElementById("val-security");
    sbSmartsVal = doc.getElementById("val-smarts");
    sbGrowthFill = doc.getElementById("fill-growth");
    sbSecurityFill = doc.getElementById("fill-security");
    sbSmartsFill = doc.getElementById("fill-smarts");
    sbLastMoney = sbLastGrowth = sbLastSecurity = sbLastSmarts = Number.NaN; // force first write
    updateScoreboard();
  });

  // Only show the floating scoreboard in a headset; the DOM HUD owns the browser.
  world.visibilityState.subscribe(function (state) {
    scoreboardPanel.object3D!.visible = state !== VisibilityState.NonImmersive;
  });

  // Keep the scoreboard parked just below and left of the eye line, billboarded
  // to face the player. setInterval (not rAF, which pauses in a headset), and all
  // temporaries are allocated once so the loop makes no per-frame garbage.
  const _sbPos = new Vector3();
  const _sbQuat = new Quaternion();
  const _sbOffset = new Vector3();
  const SB_OFFSET = new Vector3(-0.52, -0.40, -1.25); // left, down, forward of the eye
  function scoreboardFollowLoop() {
    const o3d = scoreboardPanel.object3D;
    if (!o3d || !o3d.visible) return;
    const cam: any = world.camera;
    cam.getWorldQuaternion(_sbQuat);
    _sbOffset.copy(SB_OFFSET).applyQuaternion(_sbQuat);
    cam.getWorldPosition(_sbPos).add(_sbOffset);
    o3d.position.copy(_sbPos);
    o3d.quaternion.copy(_sbQuat); // face the player (panel front is +Z)
    updateScoreboard();
    applyPanelOnTop(scoreboardPanel);
  }
  setInterval(scoreboardFollowLoop, 33);

  // Start the flow at Setup.
  // ==========================================================================
  // OPENING PANELS  —  title -> how to play -> into Main Street.
  // Built from ui/title.uikitml and ui/welcome.uikitml (compiled to public/ui).
  // ==========================================================================

  // A panel's UI document loads over a frame or two. Run wiring once it is ready.
  function whenPanelReady(entity: any, callback: (doc: any) => void) {
    const check = function () {
      if (entity.hasComponent(PanelDocument)) {
        const doc = entity.getValue(PanelDocument, "document");
        if (doc) {
          callback(doc);
          return;
        }
      }
      requestAnimationFrame(check);
    };
    check();
  }

  // The title card, floating in front of where you start.
  const titlePanel = world
    .createTransformEntity()
    .addComponent(PanelUI, { config: "./ui/title.json", maxWidth: 2.4, maxHeight: 1.6 })
    .addComponent(Interactable);
  titlePanel.object3D!.position.set(0, 1.6, 4);
  titlePanel.object3D!.visible = false;

  // The how-to-play card, in the same spot.
  const welcomePanel = world
    .createTransformEntity()
    .addComponent(PanelUI, { config: "./ui/welcome.json", maxWidth: 2.4, maxHeight: 2.0 })
    .addComponent(Interactable);
  welcomePanel.object3D!.position.set(0, 1.6, 4);
  welcomePanel.object3D!.visible = false;

  // Show the title first.
  function startOpening() {
    titlePanel.object3D!.visible = true;
    welcomePanel.object3D!.visible = false;
  }

  // Title: Start reveals the how-to-play.
  whenPanelReady(titlePanel, function (doc) {
    doc.getElementById("start-button")?.setProperties({
      onClick: function () {
        sfxClick();
        titlePanel.object3D!.visible = false;
        welcomePanel.object3D!.visible = true;
      },
    });
  });

  // How to play: five steps, Back / Next, ending by entering Main Street.
  const WELCOME_STEPS = 5;
  let welcomeStep = 1;
  whenPanelReady(welcomePanel, function (doc) {
    const GOLD = "#c8962a";
    const DISABLED_BG = "#c9c2b5";
    const DISABLED_TEXT = "#7a7a7a";
    const NAVY = "#1F3A5F";

    const backButton = doc.getElementById("back-button");
    const backLabel = doc.getElementById("back-label");
    const nextButton = doc.getElementById("next-button");
    const nextLabel = doc.getElementById("next-label");
    const indicator = doc.getElementById("step-indicator");

    function showWelcomeStep(n: number) {
      welcomeStep = n;
      for (let i = 1; WELCOME_STEPS >= i; i = i + 1) {
        doc.getElementById("step-" + i)?.setProperties({ display: i === n ? "flex" : "none" });
      }
      indicator?.setProperties({ text: "Step " + n + " of " + WELCOME_STEPS });
      const onFirst = n === 1;
      backButton?.setProperties({ backgroundColor: onFirst ? DISABLED_BG : GOLD });
      backLabel?.setProperties({ color: onFirst ? DISABLED_TEXT : NAVY });
      const onLast = n === WELCOME_STEPS;
      nextLabel?.setProperties({ text: onLast ? "Start Playing" : "Next" });
    }

    backButton?.setProperties({
      onClick: function () {
        if (welcomeStep > 1) {
          sfxClick();
          showWelcomeStep(welcomeStep - 1);
        }
      },
    });
    nextButton?.setProperties({
      onClick: function () {
        if (WELCOME_STEPS > welcomeStep) {
          sfxClick();
          showWelcomeStep(welcomeStep + 1);
        } else {
          sfxClick();
          welcomePanel.object3D!.visible = false;
          showPhase(PHASE_SETUP);
          presentPanel(setupPanel); // place it in front, in case you wandered off
          setObjective("Pick your explorer, then tap Begin.");
        }
      },
    });

    showWelcomeStep(1);
  });

  // ==========================================================================
  // SETUP  —  choose your character, then step onto Main Street.
  // ==========================================================================
  const setupPanel = world
    .createTransformEntity()
    .addComponent(PanelUI, { config: "./ui/setup.json", maxWidth: 2.6, maxHeight: 2.0 })
    .addComponent(Interactable);
  setupPanel.object3D!.position.set(0, 1.6, 7.2);
  setupPanel.object3D!.visible = false;
  phasePanels[PHASE_SETUP] = setupPanel;

  // The four characters. Only the name is used in code (for the final report);
  // the words on the cards live in ui/setup.uikitml.
  const CHARACTERS = [
    { id: "ada", name: "Ada" },
    { id: "leo", name: "Leo" },
    { id: "mia", name: "Mia" },
    { id: "sam", name: "Sam" },
  ];
  let chosenCharacter: any = null;

  whenPanelReady(setupPanel, function (doc) {
    const GOLD = "#c8962a";
    const NAVY = "#1F3A5F";

    const beginButton = doc.getElementById("begin-button");
    const beginLabel = doc.getElementById("begin-label");
    const cards: any = {};

    // Highlight the chosen card in gold, clear the rest, and switch Begin on.
    function selectCharacter(ch: any) {
      chosenCharacter = ch;
      for (const c of CHARACTERS) {
        const card = cards[c.id];
        if (card) card.setProperties({ borderColor: c.id === ch.id ? GOLD : NAVY });
      }
      beginButton?.setProperties({ backgroundColor: GOLD });
      beginLabel?.setProperties({ color: NAVY });
    }

    for (const c of CHARACTERS) {
      const card = doc.getElementById("card-" + c.id);
      cards[c.id] = card;
      card?.setProperties({ onClick: function () { sfxClick(); selectCharacter(c); } });
    }

    beginButton?.setProperties({
      onClick: function () {
        if (!chosenCharacter) return; // must pick someone first
        sfxClick();
        setupPanel.object3D!.visible = false;
        showPhase(PHASE_S1);
        setObjective("Stroll Main Street and go say hi to Gus.");
      },
    });
  });

  // ==========================================================================
  // GUS'S STAGE 1 QUESTION  —  opens when you walk up to Gus in Stage 1.
  // The best answer grows Money Smarts more; any answer earns some, because
  // thinking it through is the point. Gus explains, then you carry on.
  // ==========================================================================
  const GUSQ1_RADIUS = 3.0; // how close you must be for the question to open
  const SMARTS_BEST = 10;   // Money Smarts for the best answer
  const SMARTS_OK = 0;      // a wrong answer earns no Money Smarts, so the
                            // meter actually reflects getting answers right
                            // (used by all three of Gus's questions)

  const gusQ1Panel = world
    .createTransformEntity()
    .addComponent(PanelUI, { config: "./ui/gus-stage1.json", maxWidth: 2.4, maxHeight: 1.9 })
    .addComponent(Interactable);
  gusQ1Panel.object3D!.position.set(GUS_SPOT.x, 1.7, GUS_SPOT.z + 1.5);
  gusQ1Panel.object3D!.visible = false;

  let gusQ1Done = false;     // true once the player has read Gus's reply
  let gusQ1Replying = false; // true while the reply is on screen (keep it up)

  whenPanelReady(gusQ1Panel, function (doc) {
    const beatQ = doc.getElementById("beat-q");
    const beatReply = doc.getElementById("beat-reply");
    const replyText = doc.getElementById("reply-text");

    // Start on the question; hide the reply.
    beatQ?.setProperties({ display: "flex" });
    beatReply?.setProperties({ display: "none" });

    let answered = false; // only the first tap counts
    function answer(isBest: boolean, opener: string) {
      if (answered) return;
      answered = true;
      sfxCoin();
      updateScore("smarts", isBest ? SMARTS_BEST : SMARTS_OK);
      const lesson = "If you spend it all at once, you have nothing left for later or for a surprise. Saving even a little keeps you ready. Let's see how you do!";
      replyText?.setProperties({ text: opener + " " + lesson });
      beatQ?.setProperties({ display: "none" });
      beatReply?.setProperties({ display: "flex" });
      gusQ1Replying = true;
    }

    doc.getElementById("answer-a")?.setProperties({ onClick: function () { answer(true, "Exactly right!"); } });
    doc.getElementById("answer-b")?.setProperties({ onClick: function () { answer(false, "Good guess! Here is the thing."); } });
    doc.getElementById("answer-c")?.setProperties({ onClick: function () { answer(false, "Good guess! Here is the thing."); } });

    doc.getElementById("got-it-button")?.setProperties({
      onClick: function () {
        sfxClick();
        gusQ1Done = true;
        gusQ1Replying = false;
        gusQ1Panel.object3D!.visible = false;
        setObjective("Now head to the Bank to make your money plan.");
      },
    });
  });

  // Watch how close the player is to Gus, and open the question in Stage 1.
  const gusCamPos = new Vector3();
  setInterval(function () {
    if (gusQ1Done) {
      gusQ1Panel.object3D!.visible = false;
      return;
    }
    if (currentPhase !== PHASE_S1) {
      gusQ1Panel.object3D!.visible = false;
      return;
    }
    if (gusQ1Replying) {
      showPanel(gusQ1Panel); // keep the reply up until Got It
      return;
    }
    const cam = world.camera;
    if (!cam) return;
    cam.getWorldPosition(gusCamPos);
    const dx = gusCamPos.x - GUS_SPOT.x;
    const dz = gusCamPos.z - GUS_SPOT.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (GUSQ1_RADIUS >= dist) showPanel(gusQ1Panel);
    else gusQ1Panel.object3D!.visible = false;
  }, 33);

  // Begin the opening sequence.
  // ==========================================================================
  // STAGE 1 MONEY PLAN  —  opens at the Bank, after you have talked with Gus.
  // Each plan splits the same $30 a different way and moves the three meters
  // to match. Saving builds Security; the bank also grows your money.
  // ==========================================================================
  const stage1MoneyPanel = world
    .createTransformEntity()
    .addComponent(PanelUI, { config: "./ui/stage1-money.json", maxWidth: 2.6, maxHeight: 2.0 })
    .addComponent(Interactable);
  stage1MoneyPanel.object3D!.position.set(STATIONS.bank.x, 1.6, STATIONS.bank.z + 2.2);
  stage1MoneyPanel.object3D!.visible = false;

  let stage1MoneyDone = false;      // true once the plan is chosen and reviewed
  let stage1ShowingOutcome = false; // true while the result is on screen
  let stage1PlanChosen = false;     // guards against a fast double-tap re-scoring

  whenPanelReady(stage1MoneyPanel, function (doc) {
    const beatPlan = doc.getElementById("beat-plan");
    const beatOutcome = doc.getElementById("beat-outcome");
    const resultSpend = doc.getElementById("result-spend");
    const resultPiggy = doc.getElementById("result-piggy");
    const resultBank = doc.getElementById("result-bank");
    const resultTakeaway = doc.getElementById("result-takeaway");

    // Start on the plan choice; hide the result.
    beatPlan?.setProperties({ display: "flex" });
    beatOutcome?.setProperties({ display: "none" });

    // ---- Tap-the-jar budgeting: drop $5 at a time into Spend, Save, or Bank ----
    const COIN = 5; // each tap is $5
    let coinsLeft = ECON.STARTING_MONEY + ECON.ALLOWANCE_PER_WEEK; // $30 to split
    let spent = 0;
    let piggy = 0;
    let banked = 0;

    const coinsLeftEl = doc.getElementById("coins-left");
    const jarSpendEl = doc.getElementById("jar-spend-amt");
    const jarSaveEl = doc.getElementById("jar-save-amt");
    const jarBankEl = doc.getElementById("jar-bank-amt");
    const doneBtn = doc.getElementById("jars-done");

    function refreshJars() {
      coinsLeftEl?.setProperties({ text: "Money left to split: $" + coinsLeft });
      jarSpendEl?.setProperties({ text: "$" + spent });
      jarSaveEl?.setProperties({ text: "$" + piggy });
      jarBankEl?.setProperties({ text: "$" + banked });
      // Light up Done only once every coin is placed.
      if (coinsLeft === 0) doneBtn?.setProperties({ backgroundColor: "#c8962a" });
      else doneBtn?.setProperties({ backgroundColor: "#c9c2b5" });
    }
    refreshJars();

    // Drop one $5 coin. Spending lowers Your Money now; saving and banking keep it.
    function dropCoin(where: string) {
      if (coinsLeft === 0) return;
      coinsLeft = coinsLeft - COIN;
      if (where === "spend") {
        spent = spent + COIN;
        changeMoney(-COIN); // the money you spend leaves your pocket
      } else if (where === "save") {
        piggy = piggy + COIN; // safe at home, you still have it
      } else {
        banked = banked + COIN; // safe in the bank, and it will grow
      }
      sfxCoin();
      refreshJars();
    }

    doc.getElementById("jar-spend")?.setProperties({ onClick: function () { dropCoin("spend"); } });
    doc.getElementById("jar-save")?.setProperties({ onClick: function () { dropCoin("save"); } });
    doc.getElementById("jar-bank")?.setProperties({ onClick: function () { dropCoin("bank"); } });

    // Done: only after every coin is placed. Reveal the week, move the meters,
    // and let the bank money grow with interest.
    doneBtn?.setProperties({
      onClick: function () {
        if (coinsLeft !== 0) return; // still coins to place
        sfxStage();

        // Banking drives growth; saved money builds security; balance is smart.
        const growthGain = Math.round(banked * 1.1);
        const securityGain = Math.round((piggy + banked) * 0.55);
        let smartsGain = 4;
        if (banked > 0) smartsGain = smartsGain + 6;
        if (piggy + banked >= 20) smartsGain = smartsGain + 4;
        updateScore("growth", growthGain);
        updateScore("security", securityGain);
        updateScore("smarts", smartsGain);

        // The bank money grows with interest (Your Money ticks up).
        const interest = Math.round(banked * ECON.SAVINGS_INTEREST_RATE);
        if (interest > 0) changeMoney(interest);

        resultSpend?.setProperties({ text: "You spent $" + spent + " on things you wanted." });
        resultPiggy?.setProperties({ text: "Your piggy bank holds $" + piggy + ", safe at home." });
        if (banked > 0) {
          resultBank?.setProperties({ text: "Your $" + banked + " in the bank grew to $" + (banked + interest) + ". The extra is interest, money you earn just for saving." });
        } else {
          resultBank?.setProperties({ text: "You put nothing in the bank, so nothing grew this week." });
        }

        let take = "Spending is fun! Saving a bit more would help your money grow.";
        if (piggy + banked >= 20) take = "Very safe! Putting some money in the bank grows it, too.";
        if (banked >= 5) {
          if (spent >= 5) take = "Great balance. You spent a little, saved a little, and grew a little.";
        }
        resultTakeaway?.setProperties({ text: take });

        // Swap to the result view (the Continue button below takes it from here).
        beatPlan?.setProperties({ display: "none" });
        beatOutcome?.setProperties({ display: "flex" });
        stage1ShowingOutcome = true;
      },
    });

    doc.getElementById("continue-button")?.setProperties({
      onClick: function () {
        sfxStage();
        stage1MoneyDone = true;
        stage1ShowingOutcome = false;
        stage1MoneyPanel.object3D!.visible = false;
        showPhase(PHASE_S2);
        setStageLook(world, "stage2");
        setObjective("You are older now! Go find Gus to talk about your first paycheck.");
      },
    });
  });

  // Open the money plan at the Bank, once you have talked with Gus.
  const bankCamPos = new Vector3();
  const STAGE1_BANK_RADIUS = 3.0;
  setInterval(function () {
    if (stage1MoneyDone) {
      stage1MoneyPanel.object3D!.visible = false;
      return;
    }
    if (currentPhase !== PHASE_S1) {
      stage1MoneyPanel.object3D!.visible = false;
      return;
    }
    if (!gusQ1Done) {
      stage1MoneyPanel.object3D!.visible = false; // talk to Gus first
      return;
    }
    if (stage1ShowingOutcome) {
      showPanel(stage1MoneyPanel); // keep the result up until Continue
      return;
    }
    const cam = world.camera;
    if (!cam) return;
    cam.getWorldPosition(bankCamPos);
    const dx = bankCamPos.x - STATIONS.bank.x;
    const dz = bankCamPos.z - STATIONS.bank.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (STAGE1_BANK_RADIUS >= dist) showPanel(stage1MoneyPanel);
    else stage1MoneyPanel.object3D!.visible = false;
  }, 33);

  // ==========================================================================
  // GUS'S STAGE 2 QUESTION  —  about investing. Opens near Gus in Stage 2.
  // ==========================================================================
  const gusQ2Panel = world
    .createTransformEntity()
    .addComponent(PanelUI, { config: "./ui/gus-stage2.json", maxWidth: 2.4, maxHeight: 1.9 })
    .addComponent(Interactable);
  gusQ2Panel.object3D!.position.set(GUS_SPOT.x, 1.7, GUS_SPOT.z + 1.5);
  gusQ2Panel.object3D!.visible = false;

  let gusQ2Done = false;
  let gusQ2Replying = false;

  whenPanelReady(gusQ2Panel, function (doc) {
    const beatQ = doc.getElementById("beat-q");
    const beatReply = doc.getElementById("beat-reply");
    const replyText = doc.getElementById("reply-text");
    beatQ?.setProperties({ display: "flex" });
    beatReply?.setProperties({ display: "none" });

    let answered = false; // only the first tap counts
    function answer(isBest: boolean, opener: string) {
      if (answered) return;
      answered = true;
      sfxCoin();
      updateScore("smarts", isBest ? SMARTS_BEST : SMARTS_OK);
      const lesson = "Smart investors put in some money, not all of it. If an investment drops, you still have savings to fall back on. Let's see how you do!";
      replyText?.setProperties({ text: opener + " " + lesson });
      beatQ?.setProperties({ display: "none" });
      beatReply?.setProperties({ display: "flex" });
      gusQ2Replying = true;
    }

    doc.getElementById("answer-a")?.setProperties({ onClick: function () { answer(true, "Exactly right!"); } });
    doc.getElementById("answer-b")?.setProperties({ onClick: function () { answer(false, "Good guess! Here is the thing."); } });
    doc.getElementById("answer-c")?.setProperties({ onClick: function () { answer(false, "Good guess! Here is the thing."); } });

    doc.getElementById("got-it-button")?.setProperties({
      onClick: function () {
        sfxClick();
        gusQ2Done = true;
        gusQ2Replying = false;
        gusQ2Panel.object3D!.visible = false;
        setObjective("Now head to the Business lot to invest your paycheck.");
      },
    });
  });

  const gusQ2CamPos = new Vector3();
  setInterval(function () {
    if (gusQ2Done) { gusQ2Panel.object3D!.visible = false; return; }
    if (currentPhase !== PHASE_S2) { gusQ2Panel.object3D!.visible = false; return; }
    if (gusQ2Replying) { showPanel(gusQ2Panel); return; }
    const cam = world.camera;
    if (!cam) return;
    cam.getWorldPosition(gusQ2CamPos);
    const dx = gusQ2CamPos.x - GUS_SPOT.x;
    const dz = gusQ2CamPos.z - GUS_SPOT.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (3.0 >= dist) showPanel(gusQ2Panel);
    else gusQ2Panel.object3D!.visible = false;
  }, 33);

  // ==========================================================================
  // STAGE 2 INVEST BOARD  —  opens at the Business lot, after Gus's Stage 2
  // question. The decision sets Security and Smarts. The random good or bad
  // outcome sets Growth, and only the all-in plan can lose ground.
  // ==========================================================================
  const STAGE2_PLANS: any = {
    safe: {
      key: "safe",
      invest: 0, save: 100,
      security: 12, smarts: 6, growthGood: 0, growthBad: 0,
      takeawaySafe: "Saving keeps you secure! Investing a little could help your money grow more.",
    },
    some: {
      key: "some",
      invest: 40, save: 60,
      security: 10, smarts: 14, growthGood: 14, growthBad: 0,
      takeawayGood: "Smart move! You grew some money and kept plenty safe.",
      takeawayBad: "Investing has ups and downs. Risking only a little kept you safe.",
    },
    lots: {
      key: "lots",
      invest: 80, save: 20,
      security: 3, smarts: 6, growthGood: 18, growthBad: -5,
      takeawayGood: "Big reward this time! But investing almost everything is a gamble.",
      takeawayBad: "Risking almost everything can really hurt. Keep more money safe next time.",
    },
  };

  const stage2Panel = world
    .createTransformEntity()
    .addComponent(PanelUI, { config: "./ui/stage2-invest.json", maxWidth: 2.6, maxHeight: 2.0 })
    .addComponent(Interactable);
  stage2Panel.object3D!.position.set(STATIONS.business.x, 1.6, STATIONS.business.z + 2.2);
  stage2Panel.object3D!.visible = false;

  let stage2Done = false;
  let stage2ShowingOutcome = false;
  let stage2PlanChosen = false;     // guards against a fast double-tap re-scoring

  whenPanelReady(stage2Panel, function (doc) {
    const beatPlan = doc.getElementById("beat-plan");
    const beatOutcome = doc.getElementById("beat-outcome");
    const resultInvest = doc.getElementById("result-invest");
    const resultSave = doc.getElementById("result-save");
    const resultTakeaway = doc.getElementById("result-takeaway");

    beatPlan?.setProperties({ display: "flex" });
    beatOutcome?.setProperties({ display: "none" });

    function choosePlan(plan: any) {
      if (stage2PlanChosen) return; // a second tap must not score twice
      stage2PlanChosen = true;
      stage2Choice = plan.key;      // remembered for the final money personality
      sfxCoin();
      // Decide the outcome by chance, then apply the meters.
      const isGood = ECON.INVEST_GOOD_PROBABILITY > Math.random();
      updateScore("security", plan.security);
      updateScore("smarts", plan.smarts);
      updateScore("growth", isGood ? plan.growthGood : plan.growthBad);

      if (plan.invest > 0) {
        const mult = isGood ? ECON.INVEST_GOOD_MULTIPLIER : ECON.INVEST_BAD_MULTIPLIER;
        const result = Math.round(plan.invest * mult);
        const diff = Math.abs(result - plan.invest);
        changeMoney(result - plan.invest); // Your Money rises on a gain, falls on a loss
        if (isGood) {
          resultInvest?.setProperties({ text: "You invested $" + plan.invest + ", and it grew to $" + result + "! You earned $" + diff + "." });
          resultTakeaway?.setProperties({ text: plan.takeawayGood });
        } else {
          resultInvest?.setProperties({ text: "You invested $" + plan.invest + ", and it dropped to $" + result + ". You lost $" + diff + " this time." });
          resultTakeaway?.setProperties({ text: plan.takeawayBad });
        }
        resultSave?.setProperties({ text: "You kept $" + plan.save + " safe in savings." });
      } else {
        resultInvest?.setProperties({ text: "You did not invest this time." });
        resultSave?.setProperties({ text: "You saved all $" + plan.save + ". It is safe, but it did not grow much." });
        resultTakeaway?.setProperties({ text: plan.takeawaySafe });
      }

      beatPlan?.setProperties({ display: "none" });
      beatOutcome?.setProperties({ display: "flex" });
      stage2ShowingOutcome = true;
    }

    doc.getElementById("card-safe")?.setProperties({ onClick: function () { choosePlan(STAGE2_PLANS.safe); } });
    doc.getElementById("card-some")?.setProperties({ onClick: function () { choosePlan(STAGE2_PLANS.some); } });
    doc.getElementById("card-lots")?.setProperties({ onClick: function () { choosePlan(STAGE2_PLANS.lots); } });

    doc.getElementById("continue-button")?.setProperties({
      onClick: function () {
        sfxStage();
        stage2Done = true;
        stage2ShowingOutcome = false;
        stage2Panel.object3D!.visible = false;
        showPhase(PHASE_S3);
        setStageLook(world, "stage3");
        setObjective("You have saved up a lot! Find Gus for one last big lesson.");
      },
    });
  });

  // Open the invest board at the Business lot, once you have talked with Gus.
  const bizCamPos = new Vector3();
  setInterval(function () {
    if (stage2Done) { stage2Panel.object3D!.visible = false; return; }
    if (currentPhase !== PHASE_S2) { stage2Panel.object3D!.visible = false; return; }
    if (!gusQ2Done) { stage2Panel.object3D!.visible = false; return; }
    if (stage2ShowingOutcome) { showPanel(stage2Panel); return; }
    const cam = world.camera;
    if (!cam) return;
    cam.getWorldPosition(bizCamPos);
    const dx = bizCamPos.x - STATIONS.business.x;
    const dz = bizCamPos.z - STATIONS.business.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (3.0 >= dist) showPanel(stage2Panel);
    else stage2Panel.object3D!.visible = false;
  }, 33);

  // ==========================================================================
  // GUS'S STAGE 3 QUESTION  —  about diversifying. Opens near Gus in Stage 3.
  // ==========================================================================
  const gusQ3Panel = world
    .createTransformEntity()
    .addComponent(PanelUI, { config: "./ui/gus-stage3.json", maxWidth: 2.4, maxHeight: 1.9 })
    .addComponent(Interactable);
  gusQ3Panel.object3D!.position.set(GUS_SPOT.x, 1.7, GUS_SPOT.z + 1.5);
  gusQ3Panel.object3D!.visible = false;

  let gusQ3Done = false;
  let gusQ3Replying = false;

  whenPanelReady(gusQ3Panel, function (doc) {
    const beatQ = doc.getElementById("beat-q");
    const beatReply = doc.getElementById("beat-reply");
    const replyText = doc.getElementById("reply-text");
    beatQ?.setProperties({ display: "flex" });
    beatReply?.setProperties({ display: "none" });

    let answered = false; // only the first tap counts
    function answer(isBest: boolean, opener: string) {
      if (answered) return;
      answered = true;
      sfxCoin();
      updateScore("smarts", isBest ? SMARTS_BEST : SMARTS_OK);
      const lesson = "Spreading your money across different places is called diversifying. If one place has a problem, the others keep you safe. Let's see how you do!";
      replyText?.setProperties({ text: opener + " " + lesson });
      beatQ?.setProperties({ display: "none" });
      beatReply?.setProperties({ display: "flex" });
      gusQ3Replying = true;
    }

    doc.getElementById("answer-a")?.setProperties({ onClick: function () { answer(true, "Exactly right!"); } });
    doc.getElementById("answer-b")?.setProperties({ onClick: function () { answer(false, "Good guess! Here is the thing."); } });
    doc.getElementById("answer-c")?.setProperties({ onClick: function () { answer(false, "Good guess! Here is the thing."); } });

    doc.getElementById("got-it-button")?.setProperties({
      onClick: function () {
        sfxClick();
        gusQ3Done = true;
        gusQ3Replying = false;
        gusQ3Panel.object3D!.visible = false;
        setObjective("Now go to the Bank to make your final plan.");
      },
    });
  });

  const gusQ3CamPos = new Vector3();
  setInterval(function () {
    if (gusQ3Done) { gusQ3Panel.object3D!.visible = false; return; }
    if (currentPhase !== PHASE_S3) { gusQ3Panel.object3D!.visible = false; return; }
    if (gusQ3Replying) { showPanel(gusQ3Panel); return; }
    const cam = world.camera;
    if (!cam) return;
    cam.getWorldPosition(gusQ3CamPos);
    const dx = gusQ3CamPos.x - GUS_SPOT.x;
    const dz = gusQ3CamPos.z - GUS_SPOT.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (3.0 >= dist) showPanel(gusQ3Panel);
    else gusQ3Panel.object3D!.visible = false;
  }, 33);

  // ==========================================================================
  // STAGE 3 SPREAD BOARD  —  opens at the Bank, after Gus's Stage 3 question.
  // Spreading money across more places keeps you secure when the surprise
  // expense hits. The choice sets all three meters. The all-in plan, with
  // nowhere safe to turn, actually loses Security.
  // ==========================================================================
  const STAGE3_PLANS: any = {
    one: {
      key: "one",
      security: -3, growth: 3, smarts: 0,
      surprise: "Ouch! All your money was in one place. To pay the $30, you had to pull from your only investment at a bad time.",
      takeaway: "Keeping everything in one place is risky. Spreading it out protects you.",
    },
    two: {
      key: "two",
      security: 8, growth: 8, smarts: 9,
      surprise: "Not bad! With your money in two places, you covered the $30 without much trouble.",
      takeaway: "Two places is safer than one. Even more places would protect you better.",
    },
    three: {
      key: "three",
      security: 14, growth: 12, smarts: 14,
      surprise: "Perfect! Your money was spread across three places, so paying the $30 was easy. One small dip did not hurt the rest.",
      takeaway: "Spreading your money out kept you safe and growing. That is diversifying!",
    },
  };

  const stage3Panel = world
    .createTransformEntity()
    .addComponent(PanelUI, { config: "./ui/stage3-spread.json", maxWidth: 2.6, maxHeight: 2.0 })
    .addComponent(Interactable);
  stage3Panel.object3D!.position.set(STATIONS.bank.x, 1.6, STATIONS.bank.z + 2.2);
  stage3Panel.object3D!.visible = false;

  let stage3Done = false;
  let stage3Engaged = false; // true from choosing a plan through the result
  let stage3Plan: any = null;
  let stage3Scored = false;  // guards against a fast double-tap re-scoring

  whenPanelReady(stage3Panel, function (doc) {
    const beatPlan = doc.getElementById("beat-plan");
    const beatSurprise = doc.getElementById("beat-surprise");
    const beatOutcome = doc.getElementById("beat-outcome");
    const resultSurprise = doc.getElementById("result-surprise");
    const resultTakeaway = doc.getElementById("result-takeaway");

    beatPlan?.setProperties({ display: "flex" });
    beatSurprise?.setProperties({ display: "none" });
    beatOutcome?.setProperties({ display: "none" });

    // Pick a plan, then the surprise lands.
    function choosePlan(plan: any) {
      sfxClick();
      stage3Plan = plan;
      stage3Choice = plan.key;   // remembered for the final money personality
      stage3Engaged = true;
      beatPlan?.setProperties({ display: "none" });
      beatSurprise?.setProperties({ display: "flex" });
    }

    doc.getElementById("card-one")?.setProperties({ onClick: function () { choosePlan(STAGE3_PLANS.one); } });
    doc.getElementById("card-two")?.setProperties({ onClick: function () { choosePlan(STAGE3_PLANS.two); } });
    doc.getElementById("card-three")?.setProperties({ onClick: function () { choosePlan(STAGE3_PLANS.three); } });

    // Reveal how the plan handled the surprise, and move the meters.
    doc.getElementById("see-button")?.setProperties({
      onClick: function () {
        if (!stage3Plan || stage3Scored) return; // a second tap must not score twice
        stage3Scored = true;
        sfxCoin();
        updateScore("security", stage3Plan.security);
        updateScore("growth", stage3Plan.growth);
        updateScore("smarts", stage3Plan.smarts);
        resultSurprise?.setProperties({ text: stage3Plan.surprise });
        resultTakeaway?.setProperties({ text: stage3Plan.takeaway });
        beatSurprise?.setProperties({ display: "none" });
        beatOutcome?.setProperties({ display: "flex" });
      },
    });

    doc.getElementById("continue-button")?.setProperties({
      onClick: function () {
        sfxStage();
        stage3Done = true;
        stage3Engaged = false;
        stage3Panel.object3D!.visible = false;
        showReport();
      },
    });
  });

  // Open the spread board at the Bank, once you have talked with Gus.
  const bank3CamPos = new Vector3();
  setInterval(function () {
    if (stage3Done) { stage3Panel.object3D!.visible = false; return; }
    if (currentPhase !== PHASE_S3) { stage3Panel.object3D!.visible = false; return; }
    if (!gusQ3Done) { stage3Panel.object3D!.visible = false; return; }
    if (stage3Engaged) { showPanel(stage3Panel); return; }
    const cam = world.camera;
    if (!cam) return;
    cam.getWorldPosition(bank3CamPos);
    const dx = bank3CamPos.x - STATIONS.bank.x;
    const dz = bank3CamPos.z - STATIONS.bank.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (3.0 >= dist) showPanel(stage3Panel);
    else stage3Panel.object3D!.visible = false;
  }, 33);

  // ==========================================================================
  // MONEY REPORT  —  the finale. Reads the three meters, names the money
  // personality, greets the chosen explorer, and offers Play Again.
  // ==========================================================================
  const PERSONALITIES: any = {
    bold: {
      name: "Bold Investor",
      blurb: "You love to grow your money and you are not afraid to take a chance. Just remember to keep some savings safe, too!",
    },
    saver: {
      name: "Careful Saver",
      blurb: "You keep your money safe and steady. Saving is a real strength! Try investing a little to help it grow even more.",
    },
    diversifier: {
      name: "Smart Diversifier",
      blurb: "You make smart choices and spread your money around. That is a great way to stay safe and keep growing!",
    },
    balanced: {
      name: "Balanced Builder",
      blurb: "You did a little of everything: spending, saving, and growing. Mixing it up is a great way to learn what works best for you!",
    },
    spender: {
      name: "Free Spender",
      blurb: "You love to enjoy your money right now, and that is okay! Try saving a little for later, too, so you are ready for a surprise.",
    },
  };

  const reportPanel = world
    .createTransformEntity()
    .addComponent(PanelUI, { config: "./ui/report.json", maxWidth: 2.6, maxHeight: 2.2 })
    .addComponent(Interactable);
  reportPanel.object3D!.position.set(STATIONS.bank.x, 1.6, STATIONS.bank.z + 2.2);
  reportPanel.object3D!.visible = false;
  phasePanels[PHASE_REPORT] = reportPanel;

  let reportDoc: any = null;
  whenPanelReady(reportPanel, function (doc) {
    reportDoc = doc;
    doc.getElementById("play-again-button")?.setProperties({
      onClick: function () {
        sfxClick();
        window.location.reload(); // a clean, full restart back to the title
      },
    });
  });

  // Decide the money personality from the final meters, fill the card, show it.
  function showReport() {
    const g = scoreGrowth;
    const s = scoreSecurity;
    const m = scoreSmarts;

    // The money personality reflects the CHOICES the player actually made, in
    // order from the most distinctive choice to the most general. This is why a
    // player who spends can never be called a saver: each archetype is gated on
    // a real decision, not on which meter bar happens to be taller.
    let key = "balanced";
    if (stage3Choice === "three") {
      key = "diversifier";          // you spread your money out in the big decision
    } else if (stage2Choice === "lots") {
      key = "bold";                 // you invested almost all of your paycheck
    } else if (stage1Choice === "spend") {
      key = "spender";              // you chose to spend most of your money
    } else if (stage1Choice === "safe" || stage2Choice === "safe") {
      key = "saver";                // you kept your money safe instead of investing
    } else {
      key = "balanced";             // a steady little of everything (grow + some)
    }

    const p = PERSONALITIES[key];
    const name = chosenCharacter ? chosenCharacter.name : "explorer";

    if (reportDoc) {
      reportDoc.getElementById("greeting")?.setProperties({ text: "Great job, " + name + "!" });
      reportDoc.getElementById("personality-name")?.setProperties({ text: p.name });
      reportDoc.getElementById("personality-blurb")?.setProperties({ text: p.blurb });
      reportDoc.getElementById("value-growth")?.setProperties({ text: String(g) });
      reportDoc.getElementById("value-security")?.setProperties({ text: String(s) });
      reportDoc.getElementById("value-smarts")?.setProperties({ text: String(m) });
      reportDoc.getElementById("fill-growth")?.setProperties({ width: Math.round(g * 0.4) });
      reportDoc.getElementById("fill-security")?.setProperties({ width: Math.round(s * 0.4) });
      reportDoc.getElementById("fill-smarts")?.setProperties({ width: Math.round(m * 0.4) });
    }

    sfxFanfare();
    showPhase(PHASE_REPORT);
    presentPanel(reportPanel); // place it comfortably in front, wherever you stand
    setObjective("You did it! Here is your money report.");
  }

  // Watch all the story panels so the on-top loop keeps whichever is showing
  // fully drawn over Gus, his cart, or a building.
  storyPanels.push(
    setupPanel,
    gusQ1Panel,
    stage1MoneyPanel,
    gusQ2Panel,
    stage2Panel,
    gusQ3Panel,
    stage3Panel,
    reportPanel,
  );

  startOpening();

  // Log the economic constants once so we can confirm they loaded.
  console.log("[Money Moves] economic constants loaded", ECON);

  // consumePress: clear a stuck "Pressed" tag so 3D buttons stay reliable.
  // Used once the panels and 3D buttons arrive in later prompts.
  function consumePress(entity: any) {
    if (entity && entity.hasComponent(Pressed)) {
      entity.removeComponent(Pressed);
    }
  }
  void consumePress;
});
