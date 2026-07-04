// ============================================================================
// scoreboard.ts  —  the headset dashboard.
// The top-left HUD is a DOM overlay, which a headset cannot render, so this
// mirrors the money + three meters onto a uikit panel (ui/scoreboard) that
// softly follows the player's gaze. It reads live values from the state module,
// pushes them on change (and once per follow tick), and is hidden in the
// browser where the DOM HUD already covers things.
// ============================================================================

import { PanelUI, Quaternion, Vector3, VisibilityState } from "@iwsdk/core";
import type { World } from "@iwsdk/core";
import { getMoney, getScores, onMoney, onScore } from "./state";
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
    lastMoney = lastGrowth = lastSecurity = lastSmarts = Number.NaN; // force first write
    update();
  });

  // Push updates on every state change too (not only in the follow loop).
  onScore(update);
  onMoney(update);

  // Only show the floating scoreboard in a headset; the DOM HUD owns the browser.
  world.visibilityState.subscribe(function (state: VisibilityState) {
    panel.object3D!.visible = state !== VisibilityState.NonImmersive;
  });

  // Park it just below and left of the eye line, billboarded to face the player.
  const _pos = new Vector3();
  const _quat = new Quaternion();
  const _offset = new Vector3();
  const SB_OFFSET = new Vector3(-0.52, -0.4, -1.25); // left, down, forward of the eye
  ticker.add(function () {
    const o3d = panel.object3D;
    if (!o3d || !o3d.visible) return;
    const cam: any = world.camera;
    cam.getWorldQuaternion(_quat);
    _offset.copy(SB_OFFSET).applyQuaternion(_quat);
    cam.getWorldPosition(_pos).add(_offset);
    o3d.position.copy(_pos);
    o3d.quaternion.copy(_quat); // face the player (panel front is +Z)
    update();
    panels.applyPanelOnTop(panel);
  });
}
