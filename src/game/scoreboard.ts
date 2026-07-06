// ============================================================================
// scoreboard.ts  —  the headset dashboard.
// The top-left HUD is a DOM overlay, which a headset cannot render, so this
// mirrors the money + three meters onto a uikit panel (ui/scoreboard) mounted
// at a FIXED world spot: a menu board standing beside Gus's cart, the one
// place the player returns to every stage. A head-locked HUD that follows
// every head turn causes motion sickness, so like the fixed desktop HUD this
// one never moves — it is simply part of the street. It reads live values
// from the state module, pushes them on change (and once per tick), and is
// hidden in the browser where the DOM HUD already covers things.
// ============================================================================

import { PanelUI, VisibilityState } from "@iwsdk/core";
import type { World } from "@iwsdk/core";
import { GUS_SPOT } from "../environment";
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

  // Mount it once, permanently, beside Gus's cart — the mentor's menu board.
  // It stands to the cart's left (clear of the cart, Gus's question panel at
  // z + 1.5, and the tree at x -12), centered at eye height, and yawed so its
  // face (+Z) splits the difference between the street you approach from and
  // the spot right in front of the cart where you stand to talk to Gus.
  // Doubled in size so it stays readable from a few meters out (the panel is
  // ~0.8m wide at scale 1).
  const SB_SCALE = 2;
  const SB_YAW = 0.9; // rad; swing the face toward the street center
  {
    const o3d = panel.object3D!;
    o3d.position.set(GUS_SPOT.x - 2.2, 1.7, GUS_SPOT.z - 0.3);
    o3d.rotation.y = SB_YAW;
    o3d.scale.setScalar(SB_SCALE);
  }

  ticker.add(function () {
    const o3d = panel.object3D;
    if (!o3d || !o3d.visible) return;
    update();
    panels.applyPanelOnTop(panel);
  });
}
