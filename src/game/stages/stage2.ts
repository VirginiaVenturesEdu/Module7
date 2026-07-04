// ============================================================================
// stage2.ts  —  Gus's investing question, then the invest board at the Business
// lot. The decision sets Security and Smarts; a random good/bad market outcome
// sets Growth, and only the all-in plan can actually lose ground.
// ============================================================================

import { Interactable, PanelUI } from "@iwsdk/core";
import { changeMoney, choices, ECON, getPhase, updateScore } from "../state";
import { showPhase } from "../phase";
import { setObjective } from "../hud";
import { setupGusQuestion } from "./gus";
import { sfxCoin, sfxStage } from "../../sfx";
import { setStageLook, STATIONS } from "../../environment";
import type { Ctx } from "../context";
import type { PanelDoc, Stage2Plan } from "../types";

const STAGE2_PLANS: Record<string, Stage2Plan> = {
  safe: {
    key: "safe",
    invest: 0,
    save: 100,
    security: 12,
    smarts: 6,
    growthGood: 0,
    growthBad: 0,
    takeawaySafe: "Saving keeps you secure! Investing a little could help your money grow more.",
  },
  some: {
    key: "some",
    invest: 40,
    save: 60,
    security: 10,
    smarts: 14,
    growthGood: 14,
    growthBad: 0,
    takeawayGood: "Smart move! You grew some money and kept plenty safe.",
    takeawayBad: "Investing has ups and downs. Risking only a little kept you safe.",
  },
  lots: {
    key: "lots",
    invest: 80,
    save: 20,
    security: 3,
    smarts: 6,
    growthGood: 18,
    growthBad: -5,
    takeawayGood: "Big reward this time! But investing almost everything is a gamble.",
    takeawayBad: "Risking almost everything can really hurt. Keep more money safe next time.",
  },
};

export function setupStage2(ctx: Ctx) {
  const { world, panels } = ctx;

  const gus = setupGusQuestion(ctx, {
    config: "./ui/gus-stage2.json",
    phase: "stage2",
    lesson:
      "Smart investors put in some money, not all of it. If an investment drops, you still have savings to fall back on. Let's see how you do!",
    radius: 3.0,
    objectiveAfter: "Now head to the Business lot to invest your paycheck.",
  });

  const panel = world
    .createTransformEntity()
    .addComponent(PanelUI, { config: "./ui/stage2-invest.json", maxWidth: 2.6, maxHeight: 2.0 })
    .addComponent(Interactable);
  panel.object3D!.position.set(STATIONS.business.x, 1.6, STATIONS.business.z + 2.2);
  panel.object3D!.visible = false;
  panels.registerStoryPanel(panel);

  const flags = { done: false, showingOutcome: false, planChosen: false };

  panels.whenPanelReady(panel, function (doc: PanelDoc) {
    const beatPlan = doc.getElementById("beat-plan");
    const beatOutcome = doc.getElementById("beat-outcome");
    const resultInvest = doc.getElementById("result-invest");
    const resultSave = doc.getElementById("result-save");
    const resultTakeaway = doc.getElementById("result-takeaway");

    beatPlan?.setProperties({ display: "flex" });
    beatOutcome?.setProperties({ display: "none" });

    function choosePlan(plan: Stage2Plan) {
      if (flags.planChosen) return; // a second tap must not score twice
      flags.planChosen = true;
      choices.stage2 = plan.key; // remembered for the final money personality
      sfxCoin();
      const isGood = ECON.INVEST_GOOD_PROBABILITY > Math.random();
      updateScore("security", plan.security);
      updateScore("smarts", plan.smarts);
      updateScore("growth", isGood ? plan.growthGood : plan.growthBad);

      if (plan.invest > 0) {
        const mult = isGood ? ECON.INVEST_GOOD_MULTIPLIER : ECON.INVEST_BAD_MULTIPLIER;
        const result = Math.round(plan.invest * mult);
        const diff = Math.abs(result - plan.invest);
        changeMoney(result - plan.invest); // Your Money rises on a gain, falls on a loss
        if (isGood) {
          resultInvest?.setProperties({
            text: "You invested $" + plan.invest + ", and it grew to $" + result + "! You earned $" + diff + ".",
          });
          resultTakeaway?.setProperties({ text: plan.takeawayGood });
        } else {
          resultInvest?.setProperties({
            text: "You invested $" + plan.invest + ", and it dropped to $" + result + ". You lost $" + diff + " this time.",
          });
          resultTakeaway?.setProperties({ text: plan.takeawayBad });
        }
        resultSave?.setProperties({ text: "You kept $" + plan.save + " safe in savings." });
      } else {
        resultInvest?.setProperties({ text: "You did not invest this time." });
        resultSave?.setProperties({ text: "You saved all $" + plan.save + ". It is safe, but it did not grow much." });
        resultTakeaway?.setProperties({ text: plan.takeawaySafe });
      }

      beatPlan?.setProperties({ display: "none" });
      beatOutcome?.setProperties({ display: "flex" });
      flags.showingOutcome = true;
    }

    doc.getElementById("card-safe")?.setProperties({ onClick: function () { choosePlan(STAGE2_PLANS.safe); } });
    doc.getElementById("card-some")?.setProperties({ onClick: function () { choosePlan(STAGE2_PLANS.some); } });
    doc.getElementById("card-lots")?.setProperties({ onClick: function () { choosePlan(STAGE2_PLANS.lots); } });

    doc.getElementById("continue-button")?.setProperties({
      onClick: function () {
        sfxStage();
        flags.done = true;
        flags.showingOutcome = false;
        panel.object3D!.visible = false;
        showPhase("stage3");
        setStageLook(world, "stage3");
        setObjective("You have saved up a lot! Find Gus for one last big lesson.");
      },
    });
  });

  panels.registerProximity(panel, { x: STATIONS.business.x, z: STATIONS.business.z }, 3.0, function () {
    if (flags.done) return "hide";
    if (getPhase() !== "stage2") return "hide";
    if (!gus.isDone()) return "hide";
    if (flags.showingOutcome) return "show";
    return "proximity";
  });
}
