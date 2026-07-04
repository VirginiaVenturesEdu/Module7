// ============================================================================
// Money Moves: Your Financial Literacy  —  composition root.
// The game is split into focused modules under src/game/:
//   state      the numbers (meters, money, phase, choices) + change events
//   hud        the top-left DOM dashboard
//   scoreboard the headset dashboard (mirrors the HUD in VR)
//   ticker     ONE 33ms loop for every proximity/visibility/follow update
//   panels     showing, placing, and drawing panels over the world
//   phase      the master Setup -> Stage 1 -> 2 -> 3 -> Report flow
//   stages/*   the opening, the three stages, Gus's shared quiz, the report
// This file builds the world, wires the browser mouse-look, and assembles the
// modules above; the environment (street, sky, Gus, plant) lives in
// environment.ts.
// ============================================================================

import {
  World,
  SessionMode,
  LocomotionEnvironment,
  EnvironmentType,
  VisibilityState,
} from "@iwsdk/core";

import { buildEnvironment, setStageLook, setPlantGrowth } from "./environment";
import { getScores, onScore } from "./game/state";
import { initHud, setObjective } from "./game/hud";
import { createTicker } from "./game/ticker";
import { createPanelManager } from "./game/panels";
import { initScoreboard } from "./game/scoreboard";
import type { Ctx } from "./game/context";
import { setupOpening } from "./game/stages/opening";
import { setupStage1 } from "./game/stages/stage1";
import { setupStage2 } from "./game/stages/stage2";
import { setupStage3 } from "./game/stages/stage3";
import { setupReport } from "./game/stages/report";

World.create(document.getElementById("scene-container") as HTMLDivElement, {
  assets: {},
  xr: {
    sessionMode: SessionMode.ImmersiveVR,
    offer: "always",
    features: { handTracking: { required: false }, layers: { required: false } },
  },
  features: {
    // initialPlayerPosition spawns the player RIG (the locomotion collision
    // capsule) on the entrance side of the plaza. The camera below sits at local
    // z 0, so the capsule lines up with where you actually appear to stand.
    // useWorker is OFF on purpose: with it on the spawn would sit at the origin
    // and snap forward on the first keypress; on the main thread the initial
    // position applies immediately, and the scene is light so there is no cost.
    // comfortAssist adds a peripheral vignette while sliding in the headset,
    // which cuts motion sickness for a classroom of first-time VR users.
    locomotion: {
      useWorker: false,
      browserControls: true,
      initialPlayerPosition: [0, 0, 7],
      comfortAssistLevel: 0.7,
    },
    grabbing: true,
    physics: true,
    sceneUnderstanding: false,
    environmentRaycast: false,
  },
}).then(function (world) {
  const camera = world.camera;

  // Eye height only — no z offset. The player rig is spawned back on the
  // entrance side via locomotion's initialPlayerPosition, so keeping the camera
  // at local z 0 means the collision capsule sits exactly under the viewer.
  camera.position.set(0, 1.6, 0);

  // --------------------------------------------------------------------------
  // BROWSER MOUSE LOOK (right button looks; left button stays for clicks).
  // In the headset the headset owns the view, so this only runs in the browser.
  // --------------------------------------------------------------------------
  const lookContainer = document.getElementById("scene-container") as HTMLDivElement;
  // Either mouse button drags to look. LEFT works too (kids on Chromebooks find
  // right-drag unusual) — a plain click still clicks a panel button, since a
  // click barely moves the pointer, so the view does not visibly rotate.
  const isLookButton = (b: number) => b === 0 || b === 2;
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
    if (!isLookButton(e.button)) return;
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
    if (!isLookButton(e.button)) return;
    lookDragging = false;
    lookContainer.style.cursor = "";
  });

  // A persistent controls hint at the bottom (browser only), so kids always
  // know how to move and look, not just during the opening objective line.
  const controlsHint = document.createElement("div");
  controlsHint.textContent = "Move: W A S D    ·    Look: click and drag";
  controlsHint.style.position = "fixed";
  controlsHint.style.bottom = "14px";
  controlsHint.style.left = "50%";
  controlsHint.style.transform = "translateX(-50%)";
  controlsHint.style.zIndex = "1000";
  controlsHint.style.background = "rgba(31, 58, 95, 0.82)";
  controlsHint.style.color = "#fffbf0";
  controlsHint.style.fontFamily = "system-ui, sans-serif";
  controlsHint.style.fontSize = "13px";
  controlsHint.style.fontWeight = "700";
  controlsHint.style.padding = "6px 14px";
  controlsHint.style.borderRadius = "12px";
  controlsHint.style.pointerEvents = "none";
  document.body.appendChild(controlsHint);
  // It only makes sense in the flat browser view; hide it inside a headset.
  world.visibilityState.subscribe(function (state) {
    controlsHint.style.display = state === VisibilityState.NonImmersive ? "block" : "none";
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
  // The walkable world (sky, light, ground). See src/environment.ts.
  // --------------------------------------------------------------------------
  const built = buildEnvironment(world);
  built.ground.addComponent(LocomotionEnvironment, { type: EnvironmentType.STATIC });
  // The hedge ring is collision too, so the player cannot walk off the edge.
  built.boundary.addComponent(LocomotionEnvironment, { type: EnvironmentType.STATIC });
  setStageLook(world, "setup");

  // --------------------------------------------------------------------------
  // Dashboards. The DOM HUD subscribes to state changes itself; here we add the
  // one extra reaction that lives outside the HUD: the growth meter feeds the
  // growing plant in the world.
  // --------------------------------------------------------------------------
  initHud();
  onScore(function (meter) {
    if (meter === "growth") setPlantGrowth(getScores().growth / 100);
  });
  setObjective("Walk with W A S D, and click and drag to look around.");

  // --------------------------------------------------------------------------
  // The one shared ticker, the panel manager, and the headset scoreboard.
  // --------------------------------------------------------------------------
  const ticker = createTicker(world);
  const panels = createPanelManager(world, ticker);
  initScoreboard(world, panels, ticker);

  // --------------------------------------------------------------------------
  // The flow: opening -> stages -> report. Report is built first so Stage 3 can
  // hand off to it; each stage gates its own panels by phase and proximity.
  // --------------------------------------------------------------------------
  const ctx: Ctx = { world, panels };
  const report = setupReport(ctx);
  setupStage1(ctx);
  setupStage2(ctx);
  setupStage3(ctx, report.showReport);
  const opening = setupOpening(ctx);
  opening.start();

  console.log("[Money Moves] ready");
});
