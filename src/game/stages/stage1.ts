// ============================================================================
// stage1.ts  —  Gus's first question, then the money-plan board at the Bank.
// Tap coins into Spend / Save / Bank to split the week's money. Banking drives
// Growth, saving builds Security, and a balance is smart. The bank money then
// grows with interest, the first taste of "money that earns money".
// ============================================================================

import { Interactable, PanelUI } from "@iwsdk/core";
import { changeMoney, ECON, getPhase, updateScore } from "../state";
import { showPhase } from "../phase";
import { setObjective } from "../hud";
import { setupGusQuestion } from "./gus";
import { sfxCoin, sfxStage } from "../../sfx";
import { setStageLook, STATIONS } from "../../environment";
import type { Ctx } from "../context";
import type { PanelDoc } from "../types";

export function setupStage1(ctx: Ctx) {
  const { world, panels } = ctx;

  const gus = setupGusQuestion(ctx, {
    config: "./ui/gus-stage1.json",
    phase: "stage1",
    lesson:
      "If you spend it all at once, you have nothing left for later or for a surprise. Saving even a little keeps you ready. Let's see how you do!",
    radius: 3.0,
    objectiveAfter: "Now head to the Bank to make your money plan.",
  });

  const panel = world
    .createTransformEntity()
    .addComponent(PanelUI, { config: "./ui/stage1-money.json", maxWidth: 2.6, maxHeight: 2.0 })
    .addComponent(Interactable);
  panel.object3D!.position.set(STATIONS.bank.x, 1.6, STATIONS.bank.z + 2.2);
  panel.object3D!.visible = false;
  panels.registerStoryPanel(panel);

  const flags = { done: false, showingOutcome: false };

  panels.whenPanelReady(panel, function (doc: PanelDoc) {
    const beatPlan = doc.getElementById("beat-plan");
    const beatOutcome = doc.getElementById("beat-outcome");
    const resultSpend = doc.getElementById("result-spend");
    const resultPiggy = doc.getElementById("result-piggy");
    const resultBank = doc.getElementById("result-bank");
    const resultTakeaway = doc.getElementById("result-takeaway");

    beatPlan?.setProperties({ display: "flex" });
    beatOutcome?.setProperties({ display: "none" });

    // ---- Tap-the-jar budgeting: drop $5 at a time into Spend, Save, or Bank ----
    const COIN = 5;
    let coinsLeft = ECON.STARTING_MONEY + ECON.ALLOWANCE_PER_WEEK; // $30 to split
    let spent = 0;
    let piggy = 0;
    let banked = 0;

    const coinsLeftEl = doc.getElementById("coins-left");
    const jarSpendEl = doc.getElementById("jar-spend-amt");
    const jarSaveEl = doc.getElementById("jar-save-amt");
    const jarBankEl = doc.getElementById("jar-bank-amt");
    const doneBtn = doc.getElementById("jars-done");

    function refreshJars() {
      coinsLeftEl?.setProperties({ text: "Money left to split: $" + coinsLeft });
      jarSpendEl?.setProperties({ text: "$" + spent });
      jarSaveEl?.setProperties({ text: "$" + piggy });
      jarBankEl?.setProperties({ text: "$" + banked });
      if (coinsLeft === 0) doneBtn?.setProperties({ backgroundColor: "#c8962a" });
      else doneBtn?.setProperties({ backgroundColor: "#c9c2b5" });
    }
    refreshJars();

    function dropCoin(where: string) {
      if (coinsLeft === 0) return;
      coinsLeft = coinsLeft - COIN;
      if (where === "spend") {
        spent = spent + COIN;
        changeMoney(-COIN); // the money you spend leaves your pocket
      } else if (where === "save") {
        piggy = piggy + COIN; // safe at home, you still have it
      } else {
        banked = banked + COIN; // safe in the bank, and it will grow
      }
      sfxCoin();
      refreshJars();
    }

    doc.getElementById("jar-spend")?.setProperties({ onClick: function () { dropCoin("spend"); } });
    doc.getElementById("jar-save")?.setProperties({ onClick: function () { dropCoin("save"); } });
    doc.getElementById("jar-bank")?.setProperties({ onClick: function () { dropCoin("bank"); } });

    doneBtn?.setProperties({
      onClick: function () {
        if (coinsLeft !== 0) return; // still coins to place
        sfxStage();

        // NOTE: the original never set choices.stage1, so the report's "Free
        // Spender" branch is currently unreachable. Priority 1.1 rewrites this
        // stage (multi-week allowance) and will set the choice properly there;
        // kept as-is for now so this refactor changes no behavior.

        // Banking drives growth; saved money builds security; balance is smart.
        const growthGain = Math.round(banked * 1.1);
        const securityGain = Math.round((piggy + banked) * 0.55);
        let smartsGain = 4;
        if (banked > 0) smartsGain = smartsGain + 6;
        if (piggy + banked >= 20) smartsGain = smartsGain + 4;
        updateScore("growth", growthGain);
        updateScore("security", securityGain);
        updateScore("smarts", smartsGain);

        const interest = Math.round(banked * ECON.SAVINGS_INTEREST_RATE);
        if (interest > 0) changeMoney(interest);

        resultSpend?.setProperties({ text: "You spent $" + spent + " on things you wanted." });
        resultPiggy?.setProperties({ text: "Your piggy bank holds $" + piggy + ", safe at home." });
        if (banked > 0) {
          resultBank?.setProperties({
            text:
              "Your $" +
              banked +
              " in the bank grew to $" +
              (banked + interest) +
              ". The extra is interest, money you earn just for saving.",
          });
        } else {
          resultBank?.setProperties({ text: "You put nothing in the bank, so nothing grew this week." });
        }

        let take = "Spending is fun! Saving a bit more would help your money grow.";
        if (piggy + banked >= 20) take = "Very safe! Putting some money in the bank grows it, too.";
        if (banked >= 5) {
          if (spent >= 5) take = "Great balance. You spent a little, saved a little, and grew a little.";
        }
        resultTakeaway?.setProperties({ text: take });

        beatPlan?.setProperties({ display: "none" });
        beatOutcome?.setProperties({ display: "flex" });
        flags.showingOutcome = true;
      },
    });

    doc.getElementById("continue-button")?.setProperties({
      onClick: function () {
        sfxStage();
        flags.done = true;
        flags.showingOutcome = false;
        panel.object3D!.visible = false;
        showPhase("stage2");
        setStageLook(world, "stage2");
        setObjective("You are older now! Go find Gus to talk about your first paycheck.");
      },
    });
  });

  panels.registerProximity(panel, { x: STATIONS.bank.x, z: STATIONS.bank.z }, 3.0, function () {
    if (flags.done) return "hide";
    if (getPhase() !== "stage1") return "hide";
    if (!gus.isDone()) return "hide"; // talk to Gus first
    if (flags.showingOutcome) return "show";
    return "proximity";
  });
}
