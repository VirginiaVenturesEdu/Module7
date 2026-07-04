// ============================================================================
// stage2.ts  —  Gus's investing question, then the invest board at the Business
// lot. You pick how much of your $100 paycheck to invest, then WEEKS PASS and
// the market news comes in as a story (a heat wave that lifts lemonade sales, or
// a rainy month that slows them). The decision sets Security and Smarts; the
// news sets Growth. Play It Safe still earns a little interest — safe but slow.
// ============================================================================

import { Interactable, PanelUI } from "@iwsdk/core";
import { changeMoney, choices, ECON, finishStageRecord, getMoney, getPhase, updateScore } from "../state";
import { showPhase } from "../phase";
import { setObjective } from "../hud";
import { setupGusQuestion } from "./gus";
import { sfxCoin, sfxDown, sfxNotify, sfxStage } from "../../sfx";
import { setStageLook, STATIONS } from "../../environment";
import type { Ctx } from "../context";
import type { PanelDoc, PanelElement, Stage2Plan } from "../types";

// The market news, told as a story the way the outline asks for.
const NEWS_GOOD = "A heat wave hit and Main Street Lemonade sales soared!";
const NEWS_BAD = "A rainy month slowed Main Street Lemonade sales down.";
const SAFE_INTEREST_RATE = 0.05; // the small, steady return on the safe plan

const STAGE2_PLANS: Record<string, Stage2Plan> = {
  safe: {
    key: "safe",
    invest: 0,
    save: 100,
    security: 12,
    smarts: 6,
    growthGood: 3,
    growthBad: 3, // safe grows a little either way — slow but sure
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

type Beat = "plan" | "news" | "outcome";

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

  const flags = { done: false, engaged: false, planChosen: false, scored: false };

  panels.whenPanelReady(panel, function (doc: PanelDoc) {
    const beatPlan = doc.getElementById("beat-plan");
    const beatNews = doc.getElementById("beat-news");
    const beatOutcome = doc.getElementById("beat-outcome");
    const newsIntro = doc.getElementById("news-intro");
    const resultInvest = doc.getElementById("result-invest");
    const resultSave = doc.getElementById("result-save");
    const resultChip = doc.getElementById("result-chip");
    const resultTakeaway = doc.getElementById("result-takeaway");

    function showBeat(beat: Beat) {
      beatPlan?.setProperties({ display: beat === "plan" ? "flex" : "none" });
      beatNews?.setProperties({ display: beat === "news" ? "flex" : "none" });
      beatOutcome?.setProperties({ display: beat === "outcome" ? "flex" : "none" });
    }
    showBeat("plan");

    function setChip(el: PanelElement | null, word: string, amount: number, color: string) {
      el?.setProperties({ text: word + " — $" + amount, backgroundColor: color });
    }

    let chosen: Stage2Plan | null = null;
    let isGood = false;
    let summary = ""; // the key-choice line for the report timeline

    // Choosing rolls the market outcome but does NOT reveal it — first the news
    // beat builds a little suspense.
    function choosePlan(plan: Stage2Plan) {
      if (flags.planChosen) return; // a second tap must not score twice
      flags.planChosen = true;
      flags.engaged = true;
      chosen = plan;
      choices.stage2 = plan.key; // remembered for the final money personality
      isGood = ECON.INVEST_GOOD_PROBABILITY > Math.random();
      sfxNotify();
      newsIntro?.setProperties({
        text:
          plan.invest > 0
            ? "You invested $" + plan.invest + " in Main Street Lemonade Co. Weeks pass... the news is coming in!"
            : "You saved all $" + plan.save + ". Weeks pass — let's see how your savings did.",
      });
      showBeat("news");
    }

    // Revealing the news applies the meters, the money, and the story text.
    function revealOutcome() {
      const plan = chosen;
      if (!plan) return;
      updateScore("security", plan.security);
      updateScore("smarts", plan.smarts);

      if (plan.invest > 0) {
        updateScore("growth", isGood ? plan.growthGood : plan.growthBad);
        const mult = isGood ? ECON.INVEST_GOOD_MULTIPLIER : ECON.INVEST_BAD_MULTIPLIER;
        const result = Math.round(plan.invest * mult);
        const diff = Math.abs(result - plan.invest);
        changeMoney(result - plan.invest); // rises on a gain, falls on a loss
        if (isGood) {
          sfxCoin();
          resultInvest?.setProperties({
            text: NEWS_GOOD + " You invested $" + plan.invest + ", and it grew to $" + result + ".",
          });
          setChip(resultChip, "PROFIT: money you gained", diff, "#2e7d32");
          resultTakeaway?.setProperties({ text: plan.takeawayGood });
          summary = "Invested $" + plan.invest + ", it grew to $" + result;
        } else {
          sfxDown();
          resultInvest?.setProperties({
            text: NEWS_BAD + " You invested $" + plan.invest + ", and it dropped to $" + result + ".",
          });
          setChip(resultChip, "LOSS: money that went away", diff, "#a33b2a");
          resultTakeaway?.setProperties({ text: plan.takeawayBad });
          summary = "Invested $" + plan.invest + ", it dropped to $" + result;
        }
        resultSave?.setProperties({ text: "You kept $" + plan.save + " safe in savings." });
      } else {
        // Play It Safe: no market swing, but a small, steady bit of interest.
        updateScore("growth", plan.growthGood);
        const interest = Math.round(plan.save * SAFE_INTEREST_RATE);
        changeMoney(interest);
        sfxCoin();
        resultInvest?.setProperties({ text: "You played it safe. The lemonade news did not shake you at all." });
        resultSave?.setProperties({
          text: "Your $" + plan.save + " stayed safe and earned $" + interest + " in interest — safe but slow!",
        });
        setChip(resultChip, "INTEREST: money you earn for saving", interest, "#8a6118");
        resultTakeaway?.setProperties({ text: plan.takeawaySafe });
        summary = "Kept all $" + plan.save + " safe (+$" + interest + " interest)";
      }
      showBeat("outcome");
    }

    doc.getElementById("card-safe")?.setProperties({ onClick: function () { choosePlan(STAGE2_PLANS.safe); } });
    doc.getElementById("card-some")?.setProperties({ onClick: function () { choosePlan(STAGE2_PLANS.some); } });
    doc.getElementById("card-lots")?.setProperties({ onClick: function () { choosePlan(STAGE2_PLANS.lots); } });

    doc.getElementById("see-news-button")?.setProperties({
      onClick: function () {
        if (!chosen || flags.scored) return; // a second tap must not score twice
        flags.scored = true;
        revealOutcome();
      },
    });

    doc.getElementById("continue-button")?.setProperties({
      onClick: function () {
        sfxStage();
        finishStageRecord(2, getMoney(), summary);
        flags.done = true;
        flags.engaged = false;
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
    if (flags.engaged) return "show"; // keep news + outcome anchored once chosen
    return "proximity";
  });
}
