// ============================================================================
// scoreboard.ts  —  the headset dashboard.
// The top-left HUD is a DOM overlay, which a headset cannot render, so this
// mirrors the money + three meters onto a uikit panel (ui/scoreboard). The
// panel is parked ONCE at a fixed world spot when the player enters the
// headset — head-locked UI that follows every head turn causes motion
// sickness — and stays put, like the fixed desktop HUD. It reads live values
// from the state module, pushes them on change (and once per tick), and is
// hidden in the browser where the DOM HUD already covers things.
// ============================================================================

import { PanelUI, Quaternion, Vector3, VisibilityState } from "@iwsdk/core";
import type { World } from "@iwsdk/core";
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
  // Re-arm placement whenever the player leaves VR, so the next session
  // parks the panel where they are looking then.
  let needsPlacement = true;
  world.visibilityState.subscribe(function (state: VisibilityState) {
    const immersive = state !== VisibilityState.NonImmersive;
    panel.object3D!.visible = immersive;
    if (!immersive) needsPlacement = true;
  });

  // Park it ONCE just below and left of the eye line, upright and facing the
  // player, then leave it alone — a fixed landmark in the world, not a
  // head-locked follower. Placement runs on the first tick the panel is
  // visible so the headset pose is already live.
  const _eye = new Vector3();
  const _fwd = new Vector3();
  const _offset = new Vector3();
  const _yaw = new Quaternion();
  const UP = new Vector3(0, 1, 0);
  const SB_OFFSET = new Vector3(-0.52, -0.4, -1.25); // left, down, forward of the eye

  function placeScoreboard(o3d: NonNullable<typeof panel.object3D>) {
    const cam: any = world.camera;
    if (!cam) return;
    cam.getWorldPosition(_eye);
    cam.getWorldDirection(_fwd);
    _fwd.y = 0; // heading only — keep the panel upright even if the player looks up/down
    if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1);
    _fwd.normalize();
    _yaw.setFromAxisAngle(UP, Math.atan2(-_fwd.x, -_fwd.z));
    _offset.copy(SB_OFFSET).applyQuaternion(_yaw);
    o3d.position.copy(_eye).add(_offset);
    // Face the player from where it now stands (panel front is +Z).
    o3d.rotation.set(0, Math.atan2(_eye.x - o3d.position.x, _eye.z - o3d.position.z), 0);
    needsPlacement = false;
  }

  ticker.add(function () {
    const o3d = panel.object3D;
    if (!o3d || !o3d.visible) return;
    if (needsPlacement) placeScoreboard(o3d);
    update();
    panels.applyPanelOnTop(panel);
  });
}
