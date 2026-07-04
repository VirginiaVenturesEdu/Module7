// ============================================================================
// stage1.ts  —  Gus's first question, then a 3-WEEK allowance loop at the Bank.
// Each week the student gets $10, splits it into Spend / Save / Bank, and then
// watches a week pass so the bank pays visible interest ("$10 earned $1 - now
// $11"). Between weeks 2 and 3 a friend offers a rare card for $15, taken from
// savings — a first, concrete taste of opportunity cost. After three weeks the
// summary sets the meters and the money personality.
// ============================================================================

import { Interactable, PanelUI } from "@iwsdk/core";
import { changeMoney, choices, ECON, finishStageRecord, getMoney, getPhase, updateScore } from "../state";
import { showPhase } from "../phase";
import { setObjective } from "../hud";
import { setupGusQuestion } from "./gus";
import { sfxClick, sfxCoin, sfxStage } from "../../sfx";
import { setBeaconTarget, setStageLook, STATIONS } from "../../environment";
import { setDeltaChips } from "../deltachips";
import type { Ctx } from "../context";
import type { PanelDoc, PanelElement } from "../types";

const WEEKS = 3;
const COIN = 5; // each tap is $5
const CARD_PRICE = ECON.FRIEND_OFFER_PRICE; // $15

// Show exactly one beat of the panel at a time.
type Beat = "plan" | "week" | "friend" | "outcome";

export function setupStage1(ctx: Ctx) {
  const { world, panels } = ctx;

  const gus = setupGusQuestion(ctx, {
    config: "./ui/gus-stage1.json",
    phase: "stage1",
    lesson:
      "If you spend it all at once, you have nothing left for later or for a surprise. Saving even a little keeps you ready. Let's see how you do!",
    radius: 3.0,
    objectiveAfter: "Now head to the Bank to make your money plan.",
    beaconAfter: "bank",
    personalize: true, // Gus greets the explorer by name on their first question
    answers: {
      a: { best: true, reply: "Exactly right!" },
      b: { best: false, reply: "Not quite. Spending every dollar right away leaves nothing for later or for a surprise." },
      c: { best: false, reply: "Careful - money does not always come when we want it to, so it is smart to keep some." },
    },
  });

  const panel = world
    .createTransformEntity()
    .addComponent(PanelUI, { config: "./ui/stage1-money.json", maxWidth: 2.6, maxHeight: 2.2 })
    .addComponent(Interactable);
  panel.object3D!.position.set(STATIONS.bank.x, 1.6, STATIONS.bank.z + 2.2);
  panel.object3D!.visible = false;
  panels.registerStoryPanel(panel);

  const flags = { done: false, engaged: false };

  panels.whenPanelReady(panel, function (doc: PanelDoc) {
    const el = (id: string): PanelElement | null => doc.getElementById(id);

    const beatPlan = el("beat-plan");
    const beatWeek = el("beat-week");
    const beatFriend = el("beat-friend");
    const beatOutcome = el("beat-outcome");

    const weekEyebrow = el("week-eyebrow");
    const weekIntro = el("week-intro");
    const coinsLeftEl = el("coins-left");
    const jarSpendEl = el("jar-spend-amt");
    const jarSaveEl = el("jar-save-amt");
    const jarBankEl = el("jar-bank-amt");
    const doneBtn = el("jars-done");

    const weekBankLine = el("week-bank-line");
    const weekTally = el("week-tally");
    const nextWeekBtn = el("next-week-button");
    const nextWeekLabel = el("next-week-label");

    const friendText = el("friend-text");
    const friendNote = el("friend-note");
    const friendChoices = el("friend-choices");
    const friendContinue = el("friend-continue");

    const resultSpend = el("result-spend");
    const resultPiggy = el("result-piggy");
    const resultBank = el("result-bank");
    const resultTakeaway = el("result-takeaway");

    // ---- running state across the three weeks ----
    let week = 1;
    let weekLeft = ECON.ALLOWANCE_PER_WEEK; // this week's $ to split
    let weekSpend = 0;
    let weekPiggy = 0;
    let weekBank = 0;
    let cumSpent = 0;
    let cumPiggy = 0;
    let cumBank = 0; // bank principal, compounds each week
    let friendResolved = false;

    function showBeat(beat: Beat) {
      beatPlan?.setProperties({ display: beat === "plan" ? "flex" : "none" });
      beatWeek?.setProperties({ display: beat === "week" ? "flex" : "none" });
      beatFriend?.setProperties({ display: beat === "friend" ? "flex" : "none" });
      beatOutcome?.setProperties({ display: beat === "outcome" ? "flex" : "none" });
    }

    function refreshJars() {
      coinsLeftEl?.setProperties({ text: "Money left to split: $" + weekLeft });
      jarSpendEl?.setProperties({ text: "$" + weekSpend });
      jarSaveEl?.setProperties({ text: "$" + weekPiggy });
      jarBankEl?.setProperties({ text: "$" + weekBank });
      doneBtn?.setProperties({ backgroundColor: weekLeft === 0 ? "#c8962a" : "#c9c2b5" });
    }

    // Begin a week: reset this week's jars and (for weeks 2-3) bring the new
    // allowance. Week 1's allowance already arrived as the stage opened.
    function startWeek(n: number) {
      week = n;
      weekLeft = ECON.ALLOWANCE_PER_WEEK;
      weekSpend = 0;
      weekPiggy = 0;
      weekBank = 0;
      weekEyebrow?.setProperties({ text: "WEEK " + n + " OF " + WEEKS });
      weekIntro?.setProperties({
        text:
          n === 1
            ? "You got $10 allowance! Each tap drops $5 into a jar. Spend it, save it at home, or bank it where it grows."
            : "Another $10 allowance this week! Split it into your jars.",
      });
      if (n >= 2) changeMoney(ECON.ALLOWANCE_PER_WEEK);
      refreshJars();
      showBeat("plan");
    }

    function dropCoin(where: string) {
      if (weekLeft === 0) return;
      weekLeft = weekLeft - COIN;
      if (where === "spend") {
        weekSpend = weekSpend + COIN;
        changeMoney(-COIN); // spent money leaves your pocket
      } else if (where === "save") {
        weekPiggy = weekPiggy + COIN; // safe at home, still your money
      } else {
        weekBank = weekBank + COIN; // safe in the bank, and it will grow
      }
      sfxCoin();
      refreshJars();
    }

    el("jar-spend")?.setProperties({ onClick: function () { dropCoin("spend"); } });
    el("jar-save")?.setProperties({ onClick: function () { dropCoin("save"); } });
    el("jar-bank")?.setProperties({ onClick: function () { dropCoin("bank"); } });

    // Finish the week: bank the jars, pay interest, and show the week result.
    doneBtn?.setProperties({
      onClick: function () {
        if (weekLeft !== 0) return; // still coins to place
        sfxStage();
        flags.engaged = true;

        cumSpent = cumSpent + weekSpend;
        cumPiggy = cumPiggy + weekPiggy;
        cumBank = cumBank + weekBank;

        const principal = cumBank;
        const interest = Math.round(principal * ECON.SAVINGS_INTEREST_RATE);
        if (interest > 0) changeMoney(interest);
        cumBank = principal + interest; // interest compounds into the balance

        if (principal > 0) {
          weekBankLine?.setProperties({
            text: "Your $" + principal + " in the bank earned $" + interest + " - now $" + (principal + interest) + ".",
          });
        } else {
          weekBankLine?.setProperties({ text: "Nothing in the bank yet - money there grows every week!" });
        }
        weekTally?.setProperties({
          text: "So far: spent $" + cumSpent + ", saved $" + cumPiggy + ", banked $" + cumBank + ".",
        });
        nextWeekLabel?.setProperties({ text: week < WEEKS ? "Next Week" : "See How You Did" });
        showBeat("week");
      },
    });

    // From a week result, move on: week 1 -> 2, week 2 -> friend offer, week 3 -> summary.
    nextWeekBtn?.setProperties({
      onClick: function () {
        sfxClick();
        if (week === 1) startWeek(2);
        else if (week === 2) showFriendOffer();
        else showOutcome();
      },
    });

    // The friend's offer, between weeks 2 and 3.
    function showFriendOffer() {
      friendResolved = false;
      friendNote?.setProperties({ text: "" });
      friendChoices?.setProperties({ display: "flex" });
      friendContinue?.setProperties({ display: "none" });
      const canAfford = cumPiggy + cumBank >= CARD_PRICE;
      friendText?.setProperties({
        text: canAfford
          ? "Your friend offers you a rare trading card for $15. You would pay for it from your savings."
          : "Your friend offers you a rare trading card for $15 - but you have not saved $15 yet. What do you do?",
      });
      showBeat("friend");
    }

    function resolveFriend(note: string) {
      friendResolved = true;
      friendChoices?.setProperties({ display: "none" });
      friendNote?.setProperties({ text: note });
      friendContinue?.setProperties({ display: "flex" });
    }

    el("friend-buy")?.setProperties({
      onClick: function () {
        if (friendResolved) return;
        if (cumPiggy + cumBank < CARD_PRICE) {
          // Can't afford it — saving would have kept the choice open.
          sfxClick();
          updateScore("smarts", 6);
          resolveFriend("You did not have $15 saved, so you could not buy it. Saving keeps your choices open!");
          return;
        }
        sfxCoin();
        // Pay from the piggy bank first, then the bank.
        let owe = CARD_PRICE;
        const fromPiggy = Math.min(owe, cumPiggy);
        cumPiggy = cumPiggy - fromPiggy;
        owe = owe - fromPiggy;
        cumBank = cumBank - owe;
        cumSpent = cumSpent + CARD_PRICE; // it counts as spending on a want
        changeMoney(-CARD_PRICE);
        updateScore("smarts", 6); // you weighed it — that earns some smarts
        resolveFriend(
          "Fun! You got the card. But that $15 is gone from your savings - that is the trade-off. Money you spend cannot also be saved.",
        );
      },
    });

    el("friend-pass")?.setProperties({
      onClick: function () {
        if (friendResolved) return;
        sfxClick();
        updateScore("smarts", 8);
        updateScore("security", 8); // protecting your savings builds security
        resolveFriend(
          "You passed. The card was cool, but keeping your savings means you are ready for what is next. That is opportunity cost - every yes is a no to something else.",
        );
      },
    });

    friendContinue?.setProperties({
      onClick: function () {
        sfxClick();
        startWeek(3);
      },
    });

    // After three weeks: tally up, set the meters, and name the money habit.
    function showOutcome() {
      const saved = cumPiggy + cumBank;

      // The dominant behavior over three weeks decides the Stage 1 choice, which
      // feeds the report's money personality (this is what makes Free Spender
      // reachable and keeps a saver from ever being called a spender).
      if (cumSpent > saved) choices.stage1 = "spend";
      else if (saved >= cumSpent * 2) choices.stage1 = "safe";
      else choices.stage1 = ""; // a balanced mix — decided by later stages

      const growthGain = Math.round(cumBank * 0.7);
      const securityGain = Math.round(saved * 0.4);
      let smartsGain = 4;
      if (cumBank > 0) smartsGain = smartsGain + 6;
      if (saved >= 20) smartsGain = smartsGain + 4;
      updateScore("growth", growthGain);
      updateScore("security", securityGain);
      updateScore("smarts", smartsGain);
      setDeltaChips(doc, { growth: growthGain, security: securityGain, smarts: smartsGain });

      resultSpend?.setProperties({ text: "Over three weeks you spent $" + cumSpent + " on things you wanted." });
      resultPiggy?.setProperties({ text: "You have $" + cumPiggy + " saved at home." });
      resultBank?.setProperties({
        text: cumBank > 0 ? "Your bank holds $" + cumBank + ", grown by interest along the way." : "You put nothing in the bank, so it never grew.",
      });

      let take = "Spending is fun! Saving a bit more would help your money grow.";
      if (saved >= 20) take = "Nice saving! Money in the bank grows all on its own.";
      if (cumBank >= 10 && cumSpent >= 10) take = "Great balance - you spent a little, saved a little, and grew a little.";
      resultTakeaway?.setProperties({ text: take });

      showBeat("outcome");
    }

    el("continue-button")?.setProperties({
      onClick: function () {
        sfxStage();
        finishStageRecord(1, getMoney(), "Saved $" + (cumPiggy + cumBank) + ", spent $" + cumSpent);
        setBeaconTarget("none");
        flags.done = true;
        flags.engaged = false;
        panel.object3D!.visible = false;
        showPhase("stage2");
        setStageLook(world, "stage2");
        setObjective("You are older now! Go find Gus to talk about your first paycheck.");
      },
    });

    // Initialize the week-1 display (no money change — week 1's allowance
    // already arrived as the stage opened).
    startWeek(1);
  });

  panels.registerProximity(panel, { x: STATIONS.bank.x, z: STATIONS.bank.z }, 3.0, function () {
    if (flags.done) return "hide";
    if (getPhase() !== "stage1") return "hide";
    if (!gus.isDone()) return "hide"; // talk to Gus first
    if (flags.engaged) return "show"; // keep the multi-week sequence anchored once begun
    return "proximity";
  });
}
