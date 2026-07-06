// ============================================================================
// scoreboard.ts  —  the headset dashboard.
// The top-left HUD is a DOM overlay, which a headset cannot render, so this
// mirrors the money + three meters onto a uikit panel (ui/scoreboard) mounted
// at a FIXED world spot: billboard-sized above the "Main Street" banner. A
// head-locked HUD that follows every head turn causes motion sickness, so
// like the fixed desktop HUD this one never moves — it is simply part of the
// street. It reads live values from the state module, pushes them on change
// (and once per tick), and is hidden in the browser where the DOM HUD already
// covers things.
// ============================================================================

import { PanelUI, VisibilityState } from "@iwsdk/core";
import type { World } from "@iwsdk/core";
import { MAIN_STREET_SIGN } from "../environment";
import { getMoney, getObjective, getScores, onMoney, onObjective, onScore } from "./state";
import type { PanelManager } from "./panels";
import type { PanelDoc, PanelElement } from "./types";
import type { Ticker } from "./ticker";

// MUST match the .track width in ui/scoreboard.uikitml.
export const METER_TRACK_WIDTH = 24;

export function initScoreboard(world: World, panels: PanelManager, ticker: Ticker) {
  const panel = world
    .createTransformEntity()
    .addComponent(PanelUI, { config: "./ui/scoreboard.json", maxWidth: 0.8, maxHeight: 1.0 });
  panel.object3D!.visible = false;

  let doc: PanelDoc | null = null;
  let moneyEl: PanelElement | null = null;
  let growthVal: PanelElement | null = null;
  let securityVal: PanelElement | null = null;
  let smartsVal: PanelElement | null = null;
  let growthFill: PanelElement | null = null;
  let securityFill: PanelElement | null = null;
  let smartsFill: PanelElement | null = null;
  let objectiveEl: PanelElement | null = null;

  function paintObjective(text: string) {
    objectiveEl?.setProperties({ text: text ? "Goal: " + text : "", display: text ? "flex" : "none" });
  }

  // Only push a property when it actually changed, so we are not spamming UIKit.
  let lastMoney = Number.NaN;
  let lastGrowth = Number.NaN;
  let lastSecurity = Number.NaN;
  let lastSmarts = Number.NaN;

  function update() {
    if (!doc) return;
    const money = getMoney();
    if (money !== lastMoney) {
      moneyEl?.setProperties({ text: "$" + money });
      lastMoney = money;
    }
    const s = getScores();
    const g = Math.round(s.growth);
    if (g !== lastGrowth) {
      growthVal?.setProperties({ text: String(g) });
      growthFill?.setProperties({ width: (g / 100) * METER_TRACK_WIDTH });
      lastGrowth = g;
    }
    const sec = Math.round(s.security);
    if (sec !== lastSecurity) {
      securityVal?.setProperties({ text: String(sec) });
      securityFill?.setProperties({ width: (sec / 100) * METER_TRACK_WIDTH });
      lastSecurity = sec;
    }
    const m = Math.round(s.smarts);
    if (m !== lastSmarts) {
      smartsVal?.setProperties({ text: String(m) });
      smartsFill?.setProperties({ width: (m / 100) * METER_TRACK_WIDTH });
      lastSmarts = m;
    }
  }

  panels.whenPanelReady(panel, function (d) {
    doc = d;
    moneyEl = d.getElementById("money-total");
    growthVal = d.getElementById("val-growth");
    securityVal = d.getElementById("val-security");
    smartsVal = d.getElementById("val-smarts");
    growthFill = d.getElementById("fill-growth");
    securityFill = d.getElementById("fill-security");
    smartsFill = d.getElementById("fill-smarts");
    objectiveEl = d.getElementById("objective");
    lastMoney = lastGrowth = lastSecurity = lastSmarts = Number.NaN; // force first write
    update();
    paintObjective(getObjective()); // catch up to any goal set before the panel loaded
  });

  // Push updates on every state change too (not only in the follow loop).
  onScore(update);
  onMoney(update);
  onObjective(paintObjective);

  // Only show the scoreboard in a headset; the DOM HUD owns the browser.
  world.visibilityState.subscribe(function (state: VisibilityState) {
    panel.object3D!.visible = state !== VisibilityState.NonImmersive;
  });

  // Mount it once, permanently, above the "Main Street" sign board — a fixed
  // landmark that never follows the head. Scaled up to billboard size so it
  // reads from street level (the panel itself is ~0.8m wide), and pitched a
  // few degrees down toward the players below it (panel front is +Z, which
  // already faces the street).
  const SB_SCALE = 4; // ~3.2m wide, a touch narrower than the 4.2m sign board
  const SB_TILT = 0.28; // rad; nod the face down toward eye level on the street
  const SB_HALF_HEIGHT = (0.85 * SB_SCALE) / 2; // panel is roughly 0.85m tall
  {
    const o3d = panel.object3D!;
    o3d.position.set(
      MAIN_STREET_SIGN.x,
      MAIN_STREET_SIGN.topY + 0.15 + SB_HALF_HEIGHT, // clear the board's top edge
      MAIN_STREET_SIGN.z + 0.3, // in front of the beam, in line with the board
    );
    o3d.rotation.x = SB_TILT;
    o3d.scale.setScalar(SB_SCALE);
  }

  ticker.add(function () {
    const o3d = panel.object3D;
    if (!o3d || !o3d.visible) return;
    update();
    panels.applyPanelOnTop(panel);
  });
}
