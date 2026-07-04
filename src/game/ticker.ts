// ============================================================================
// ticker.ts  —  ONE 33ms loop for the whole app.
// This used to be seven-plus separate setInterval(33) loops: one per
// proximity-gated panel, plus the hidden-panel guard, the draw-on-top pass, and
// the scoreboard follow. They are now a single master ticker with a registry.
// Plain callbacks (guard, on-top, follow) go through add(); the panels that
// open when you walk up to a station go through addProximity() with a small
// gate() that says whether to hide it, force it open, or run the distance test.
// setInterval (not requestAnimationFrame) because rAF pauses inside a headset.
// One loop also means one place to pause everything when a modal beat is up.
// ============================================================================

import { Vector3 } from "@iwsdk/core";
import type { PanelEntity } from "./types";

// What a proximity gate wants to happen this tick:
//   "hide"      -> the panel is not relevant now (wrong phase, already done)
//   "show"      -> keep it open no matter where you stand (a reply/result beat)
//   "proximity" -> open it only while the player is within radius of the anchor
export type ProximityGate = "hide" | "show" | "proximity";

export interface ProximityEntry {
  panel: PanelEntity;
  anchor: { x: number; z: number };
  radius: number;
  gate: () => ProximityGate;
  show: (panel: PanelEntity) => void; // panel manager's showPanel
}

export interface Ticker {
  add(fn: () => void): void;
  addProximity(entry: ProximityEntry): void;
  setPaused(paused: boolean): void;
}

// world is passed in so the proximity test can read the live camera each tick.
export function createTicker(world: { camera?: { getWorldPosition(v: Vector3): Vector3 } }): Ticker {
  const callbacks: Array<() => void> = [];
  const proximity: ProximityEntry[] = [];
  const camPos = new Vector3(); // reused; the loop makes no per-frame garbage
  let paused = false;

  function setVisible(panel: PanelEntity, visible: boolean) {
    if (panel.object3D) panel.object3D.visible = visible;
  }

  function runProximity(e: ProximityEntry) {
    const g = e.gate();
    if (g === "hide") {
      setVisible(e.panel, false);
      return;
    }
    if (g === "show") {
      e.show(e.panel);
      return;
    }
    const cam = world.camera;
    if (!cam) return;
    cam.getWorldPosition(camPos);
    const dx = camPos.x - e.anchor.x;
    const dz = camPos.z - e.anchor.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist <= e.radius) e.show(e.panel);
    else setVisible(e.panel, false);
  }

  setInterval(function () {
    if (paused) return;
    for (const fn of callbacks) fn();
    for (const e of proximity) runProximity(e);
  }, 33);

  return {
    add(fn) {
      callbacks.push(fn);
    },
    addProximity(entry) {
      proximity.push(entry);
    },
    setPaused(value) {
      paused = value;
    },
  };
}
