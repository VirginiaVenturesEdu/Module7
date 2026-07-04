// ============================================================================
// context.ts  —  the small bundle of shared services each stage needs.
// The world (to make entities and read the camera) and the panel manager (to
// show/place/maintain panels). Everything else — state, hud, phase, sfx — the
// stages import directly, since those are plain module singletons.
// ============================================================================

import type { World } from "@iwsdk/core";
import type { PanelManager } from "./panels";

export interface Ctx {
  world: World;
  panels: PanelManager;
}
