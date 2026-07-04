// ============================================================================
// gus.ts  —  one shared Gus quiz panel, used by all three stages.
// Each stage asks Gus a different question, but the shape is identical: a
// question beat with three answers, then a reply beat Gus explains, then Got It.
// The best answer grows Money Smarts more; any answer earns some, because
// thinking it through is the point. This factors that shape into one place.
// ============================================================================

import { Interactable, PanelUI } from "@iwsdk/core";
import { getPhase, SMARTS_BEST, SMARTS_OK, updateScore } from "../state";
import { setObjective } from "../hud";
import { sfxClick, sfxCoin } from "../../sfx";
import { GUS_SPOT } from "../../environment";
import type { Ctx } from "../context";
import type { PanelDoc, Phase } from "../types";

export interface GusQuestionOptions {
  config: string; // e.g. "./ui/gus-stage1.json"
  phase: Phase; // the phase this question belongs to
  lesson: string; // Gus's explanation, shown after any answer
  radius: number; // how close you must be for it to open
  objectiveAfter: string; // the goal line once Gus is done
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

    beatQ?.setProperties({ display: "flex" });
    beatReply?.setProperties({ display: "none" });

    let answered = false; // only the first tap counts
    function answer(isBest: boolean, opener: string) {
      if (answered) return;
      answered = true;
      sfxCoin();
      updateScore("smarts", isBest ? SMARTS_BEST : SMARTS_OK);
      replyText?.setProperties({ text: opener + " " + opts.lesson });
      beatQ?.setProperties({ display: "none" });
      beatReply?.setProperties({ display: "flex" });
      stateFlags.replying = true;
    }

    doc.getElementById("answer-a")?.setProperties({ onClick: function () { answer(true, "Exactly right!"); } });
    doc.getElementById("answer-b")?.setProperties({ onClick: function () { answer(false, "Good guess! Here is the thing."); } });
    doc.getElementById("answer-c")?.setProperties({ onClick: function () { answer(false, "Good guess! Here is the thing."); } });

    doc.getElementById("got-it-button")?.setProperties({
      onClick: function () {
        sfxClick();
        stateFlags.done = true;
        stateFlags.replying = false;
        panel.object3D!.visible = false;
        setObjective(opts.objectiveAfter);
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
