// ============================================================================
// gus.ts  —  one shared Gus quiz panel, used by all three stages.
// Each stage asks Gus a different question, but the shape is identical: a
// question beat with three answers, then a reply beat Gus explains, then Got It.
// The best answer earns Money Smarts (with a "+10 Smarts" chip); each WRONG
// answer gets its own gentle, specific correction, so a miss actually teaches.
// ============================================================================

import { Interactable, PanelUI } from "@iwsdk/core";
import { getChosenCharacter, getPhase, SMARTS_BEST, SMARTS_OK, updateScore } from "../state";
import { setObjective } from "../hud";
import { sfxClick, sfxCoin } from "../../sfx";
import { GUS_SPOT, setBeaconTarget } from "../../environment";
import type { Ctx } from "../context";
import type { PanelDoc, Phase } from "../types";

// One answer choice: whether it is the best answer, and Gus's reply to it.
export interface GusAnswer {
  best: boolean;
  reply: string;
}

export interface GusQuestionOptions {
  config: string; // e.g. "./ui/gus-stage1.json"
  phase: Phase; // the phase this question belongs to
  lesson: string; // Gus's shared teaching point, added after every reply
  radius: number; // how close you must be for it to open
  objectiveAfter: string; // the goal line once Gus is done
  beaconAfter: "bank" | "business"; // which station beacon lights once Gus is done
  answers: { a: GusAnswer; b: GusAnswer; c: GusAnswer }; // per-answer replies
  personalize?: boolean; // if set, Gus name-drops the explorer and their trait
}

export interface GusQuestion {
  isDone: () => boolean;
}

export function setupGusQuestion(ctx: Ctx, opts: GusQuestionOptions): GusQuestion {
  const { world, panels } = ctx;

  const panel = world
    .createTransformEntity()
    .addComponent(PanelUI, { config: opts.config, maxWidth: 2.4, maxHeight: 1.9 })
    .addComponent(Interactable);
  panel.object3D!.position.set(GUS_SPOT.x, 1.7, GUS_SPOT.z + 1.5);
  panel.object3D!.visible = false;
  panels.registerStoryPanel(panel);

  // Per-stage state, kept together instead of scattered as loose booleans.
  const stateFlags = { done: false, replying: false };

  panels.whenPanelReady(panel, function (doc: PanelDoc) {
    const beatQ = doc.getElementById("beat-q");
    const beatReply = doc.getElementById("beat-reply");
    const replyText = doc.getElementById("reply-text");
    const replyChip = doc.getElementById("reply-chip");

    beatQ?.setProperties({ display: "flex" });
    beatReply?.setProperties({ display: "none" });

    let answered = false; // only the first tap counts
    function answer(cfg: GusAnswer) {
      if (answered) return;
      answered = true;
      sfxCoin();
      updateScore("smarts", cfg.best ? SMARTS_BEST : SMARTS_OK);
      // The first time, Gus greets the explorer by name and nods to their trait.
      let lead = "";
      const character = getChosenCharacter();
      if (opts.personalize && character) {
        lead = character.name + ", I hear you " + character.trait + "! ";
      }
      replyText?.setProperties({ text: lead + cfg.reply + " " + opts.lesson });
      // The Smarts chip only shows when the best answer actually earned points.
      if (cfg.best) replyChip?.setProperties({ text: "+" + SMARTS_BEST + " Smarts", display: "flex" });
      else replyChip?.setProperties({ display: "none" });
      beatQ?.setProperties({ display: "none" });
      beatReply?.setProperties({ display: "flex" });
      stateFlags.replying = true;
    }

    doc.getElementById("answer-a")?.setProperties({ onClick: function () { answer(opts.answers.a); } });
    doc.getElementById("answer-b")?.setProperties({ onClick: function () { answer(opts.answers.b); } });
    doc.getElementById("answer-c")?.setProperties({ onClick: function () { answer(opts.answers.c); } });

    doc.getElementById("got-it-button")?.setProperties({
      onClick: function () {
        sfxClick();
        stateFlags.done = true;
        stateFlags.replying = false;
        panel.object3D!.visible = false;
        setObjective(opts.objectiveAfter);
        setBeaconTarget(opts.beaconAfter); // light the way to the station
      },
    });
  });

  // Open the question when you walk up to Gus in the right phase; keep the reply
  // up wherever you stand until Got It.
  panels.registerProximity(panel, { x: GUS_SPOT.x, z: GUS_SPOT.z }, opts.radius, function () {
    if (stateFlags.done) return "hide";
    if (getPhase() !== opts.phase) return "hide";
    if (stateFlags.replying) return "show";
    return "proximity";
  });

  return { isDone: () => stateFlags.done };
}
