// ============================================================================
// phase.ts  —  the master flow (Setup -> Stage 1 -> 2 -> 3 -> Report).
// showPhase sets the running money for the stage that is starting, updates the
// HUD stage label, and shows the one panel registered for that phase while
// hiding the rest. Stages call showPhase(...) as the player finishes each one.
// ============================================================================

import { ECON, setMoney, setPhase } from "./state";
import { hideMoneyRow, setHudStage } from "./hud";
import type { PanelEntity, Phase } from "./types";

// Panels that a phase owns outright (Setup's picker, the Report). Stage panels
// are gated by proximity instead, so they are not registered here.
const phasePanels: Partial<Record<Phase, PanelEntity>> = {};

export function registerPhasePanel(phase: Phase, panel: PanelEntity) {
  phasePanels[phase] = panel;
}

export function showPhase(phase: Phase) {
  setPhase(phase);
  setHudStage(phase);

  if (phase === "setup") setMoney(ECON.STARTING_MONEY);
  else if (phase === "stage1") setMoney(ECON.STARTING_MONEY + ECON.ALLOWANCE_PER_WEEK);
  else if (phase === "stage2") setMoney(ECON.PAYCHECK_STAGE2);
  else if (phase === "stage3") setMoney(ECON.BIG_DECISION_FUNDS);
  else hideMoneyRow();

  for (const key in phasePanels) {
    const panel = phasePanels[key as Phase];
    if (panel && panel.object3D) panel.object3D.visible = false;
  }
  const active = phasePanels[phase];
  if (active && active.object3D) active.object3D.visible = true;
  console.log("[PHASE] now in " + phase);
}
