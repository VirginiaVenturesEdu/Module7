// ============================================================================
// stage3.ts  —  Gus's diversifying question, then the spread board at the Bank.
// Spreading money across more places keeps you secure when the surprise expense
// hits. The choice sets all three meters; the all-in plan, with nowhere safe to
// turn, actually loses Security. Finishing here opens the Money Report.
// ============================================================================

import { Interactable, PanelUI } from "@iwsdk/core";
import { choices, getPhase, updateScore } from "../state";
import { setupGusQuestion } from "./gus";
import { sfxClick, sfxCoin, sfxStage } from "../../sfx";
import { STATIONS } from "../../environment";
import type { Ctx } from "../context";
import type { PanelDoc, Stage3Plan } from "../types";

const STAGE3_PLANS: Record<string, Stage3Plan> = {
  one: {
    key: "one",
    security: -3,
    growth: 3,
    smarts: 0,
    surprise: "Ouch! All your money was in one place. To pay the $30, you had to pull from your only investment at a bad time.",
    takeaway: "Keeping everything in one place is risky. Spreading it out protects you.",
  },
  two: {
    key: "two",
    security: 8,
    growth: 8,
    smarts: 9,
    surprise: "Not bad! With your money in two places, you covered the $30 without much trouble.",
    takeaway: "Two places is safer than one. Even more places would protect you better.",
  },
  three: {
    key: "three",
    security: 14,
    growth: 12,
    smarts: 14,
    surprise: "Perfect! Your money was spread across three places, so paying the $30 was easy. One small dip did not hurt the rest.",
    takeaway: "Spreading your money out kept you safe and growing. That is diversifying!",
  },
};

export function setupStage3(ctx: Ctx, showReport: () => void) {
  const { world, panels } = ctx;

  const gus = setupGusQuestion(ctx, {
    config: "./ui/gus-stage3.json",
    phase: "stage3",
    lesson:
      "Spreading your money across different places is called diversifying. If one place has a problem, the others keep you safe. Let's see how you do!",
    radius: 3.0,
    objectiveAfter: "Now go to the Bank to make your final plan.",
  });

  const panel = world
    .createTransformEntity()
    .addComponent(PanelUI, { config: "./ui/stage3-spread.json", maxWidth: 2.6, maxHeight: 2.0 })
    .addComponent(Interactable);
  panel.object3D!.position.set(STATIONS.bank.x, 1.6, STATIONS.bank.z + 2.2);
  panel.object3D!.visible = false;
  panels.registerStoryPanel(panel);

  const flags = { done: false, engaged: false, planChosen: false, scored: false };
  let plan: Stage3Plan | null = null;

  panels.whenPanelReady(panel, function (doc: PanelDoc) {
    const beatPlan = doc.getElementById("beat-plan");
    const beatSurprise = doc.getElementById("beat-surprise");
    const beatOutcome = doc.getElementById("beat-outcome");
    const resultSurprise = doc.getElementById("result-surprise");
    const resultTakeaway = doc.getElementById("result-takeaway");

    beatPlan?.setProperties({ display: "flex" });
    beatSurprise?.setProperties({ display: "none" });
    beatOutcome?.setProperties({ display: "none" });

    function choosePlan(chosen: Stage3Plan) {
      if (flags.planChosen) return; // guard a fast double-tap from overwriting the plan
      flags.planChosen = true;
      sfxClick();
      plan = chosen;
      choices.stage3 = chosen.key; // remembered for the final money personality
      flags.engaged = true;
      beatPlan?.setProperties({ display: "none" });
      beatSurprise?.setProperties({ display: "flex" });
    }

    doc.getElementById("card-one")?.setProperties({ onClick: function () { choosePlan(STAGE3_PLANS.one); } });
    doc.getElementById("card-two")?.setProperties({ onClick: function () { choosePlan(STAGE3_PLANS.two); } });
    doc.getElementById("card-three")?.setProperties({ onClick: function () { choosePlan(STAGE3_PLANS.three); } });

    doc.getElementById("see-button")?.setProperties({
      onClick: function () {
        if (!plan || flags.scored) return; // a second tap must not score twice
        flags.scored = true;
        sfxCoin();
        updateScore("security", plan.security);
        updateScore("growth", plan.growth);
        updateScore("smarts", plan.smarts);
        resultSurprise?.setProperties({ text: plan.surprise });
        resultTakeaway?.setProperties({ text: plan.takeaway });
        beatSurprise?.setProperties({ display: "none" });
        beatOutcome?.setProperties({ display: "flex" });
      },
    });

    doc.getElementById("continue-button")?.setProperties({
      onClick: function () {
        sfxStage();
        flags.done = true;
        flags.engaged = false;
        panel.object3D!.visible = false;
        showReport();
      },
    });
  });

  panels.registerProximity(panel, { x: STATIONS.bank.x, z: STATIONS.bank.z }, 3.0, function () {
    if (flags.done) return "hide";
    if (getPhase() !== "stage3") return "hide";
    if (!gus.isDone()) return "hide";
    if (flags.engaged) return "show";
    return "proximity";
  });
}
