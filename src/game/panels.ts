// ============================================================================
// panels.ts  —  everything about SHOWING a story panel well.
// The player almost always walks right up to a panel's anchor, ending up far
// too close to read it, and Gus / a building can end up between them and the
// card. This manager snaps a panel to a comfortable, fully-in-view distance in
// front of the player the first time it appears (presentPanel), draws it over
// the world so nothing can hide it (applyPanelOnTop), and skips clicks on
// effectively-hidden panels (the guard). It also owns proximity registration,
// delegating the actual polling to the one shared ticker.
// ============================================================================

import { PanelDocument, Vector3, Box3 } from "@iwsdk/core";
import type { World } from "@iwsdk/core";
import type { PanelDoc, PanelEntity } from "./types";
import type { ProximityGate, Ticker } from "./ticker";

export interface PanelManager {
  whenPanelReady(entity: PanelEntity, callback: (doc: PanelDoc) => void): void;
  presentPanel(entity: PanelEntity): void;
  showPanel(entity: PanelEntity): void;
  applyPanelOnTop(entity: PanelEntity): void;
  registerStoryPanel(entity: PanelEntity): void;
  registerProximity(
    panel: PanelEntity,
    anchor: { x: number; z: number },
    radius: number,
    gate: () => ProximityGate,
  ): void;
}

export function createPanelManager(world: World, ticker: Ticker): PanelManager {
  const scene = world.scene;

  // --------------------------------------------------------------------------
  // Ready gate: a panel's UI document loads over a frame or two. Run wiring once.
  // --------------------------------------------------------------------------
  function whenPanelReady(entity: PanelEntity, callback: (doc: PanelDoc) => void) {
    const check = function () {
      if (entity.hasComponent(PanelDocument)) {
        const doc = entity.getValue(PanelDocument, "document") as PanelDoc | undefined;
        if (doc) {
          callback(doc);
          return;
        }
      }
      requestAnimationFrame(check);
    };
    check();
  }

  // --------------------------------------------------------------------------
  // Draw a panel OVER the 3D world so nothing can sit in front and hide it.
  // Turning off depth testing and lifting the render order keeps the whole
  // panel visible while preserving UIKit's own internal layering.
  // --------------------------------------------------------------------------
  function applyPanelOnTop(entity: PanelEntity) {
    const o3d = entity.object3D;
    if (!o3d) return;
    o3d.traverse(function (child: any) {
      if (!child.isMesh || !child.material) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) {
        m.depthTest = false;
        m.depthWrite = false;
      }
      if (!child.__onTop) {
        child.renderOrder = (child.renderOrder || 0) + 2000;
        child.__onTop = true;
      }
    });
  }

  // --------------------------------------------------------------------------
  // Snap a panel to a comfortable distance directly in front of the player,
  // sized from the panel's real bounds so the WHOLE panel fits, facing them.
  // --------------------------------------------------------------------------
  const _presEye = new Vector3();
  const _presFwd = new Vector3();
  const _presSize = new Vector3();
  const _presBox = new Box3();
  const PRESENT_MARGIN = 1.18; // breathing room so the panel is not edge-to-edge
  const PRESENT_MIN_DIST = 2.4; // never closer than this, however small the panel
  const PRESENT_MAX_DIST = 6.0; // never farther than this, however large the panel

  function presentPanel(entity: PanelEntity) {
    const cam: any = world.camera;
    const o3d = entity.object3D;
    if (!cam || !o3d) return;

    _presBox.setFromObject(o3d);
    _presBox.getSize(_presSize);
    const w = Math.hypot(_presSize.x, _presSize.z) || 2.6;
    const h = _presSize.y > 0.01 ? _presSize.y : 2.2;

    const tanV = Math.tan((cam.fov * Math.PI) / 360); // tan(halfFov)
    const aspect = cam.aspect || 1;
    const distH = h / 2 / tanV;
    const distW = w / 2 / (tanV * aspect);
    let dist = Math.max(distH, distW) * PRESENT_MARGIN;
    dist = Math.max(PRESENT_MIN_DIST, Math.min(PRESENT_MAX_DIST, dist));

    cam.getWorldPosition(_presEye);
    cam.getWorldDirection(_presFwd);
    _presFwd.y = 0;
    if (_presFwd.lengthSq() < 1e-6) _presFwd.set(0, 0, -1);
    _presFwd.normalize();
    const px = _presEye.x + _presFwd.x * dist;
    const pz = _presEye.z + _presFwd.z * dist;
    o3d.position.set(px, _presEye.y, pz);
    o3d.rotation.set(0, Math.atan2(_presEye.x - px, _presEye.z - pz), 0, "YXZ");
    applyPanelOnTop(entity);
  }

  // Make a panel visible, snapping it in front the first time it appears.
  // Idempotent while already shown, so reading/clicking it is stable.
  function showPanel(entity: PanelEntity) {
    const o3d = entity.object3D;
    if (!o3d) return;
    if (!o3d.visible) presentPanel(entity);
    o3d.visible = true;
  }

  // --------------------------------------------------------------------------
  // HIDDEN-PANEL CLICK GUARD
  // Pointer ray tests do NOT skip invisible meshes, so a hidden button can sit
  // in front of a real one and swallow the click. Each tick we mark effectively
  // hidden ray targets pointerEvents = "none" and restore them when shown.
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

  // --------------------------------------------------------------------------
  // Every story panel, kept drawing over the world frame after frame. UIKit
  // builds text/glyph meshes lazily as a panel's content is set, so a one-time
  // pass misses them; this re-applies to whichever panel is currently visible.
  // --------------------------------------------------------------------------
  const storyPanels: PanelEntity[] = [];
  function registerStoryPanel(entity: PanelEntity) {
    storyPanels.push(entity);
  }
  function onTopLoop() {
    for (const p of storyPanels) {
      if (p.object3D && p.object3D.visible) applyPanelOnTop(p);
    }
  }

  // Wire the two housekeeping loops into the single shared ticker.
  ticker.add(hitTestVisibilityLoop);
  ticker.add(onTopLoop);

  // Register a proximity-gated panel. The gate decides hide / force-open /
  // distance-test each tick; showPanel does the placement when it opens.
  function registerProximity(
    panel: PanelEntity,
    anchor: { x: number; z: number },
    radius: number,
    gate: () => ProximityGate,
  ) {
    ticker.addProximity({ panel, anchor, radius, gate, show: showPanel });
  }

  return {
    whenPanelReady,
    presentPanel,
    showPanel,
    applyPanelOnTop,
    registerStoryPanel,
    registerProximity,
  };
}
