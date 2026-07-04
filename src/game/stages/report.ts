// ============================================================================
// report.ts  —  the finale. Names the money personality from the CHOICES the
// player actually made (so a spender is never called a saver), greets the
// chosen explorer, fills the three meter bars, and offers Play Again.
// ============================================================================

import { Interactable, PanelUI } from "@iwsdk/core";
import { choices, getChosenCharacter, getScores } from "../state";
import { showPhase, registerPhasePanel } from "../phase";
import { setObjective } from "../hud";
import { sfxClick, sfxFanfare } from "../../sfx";
import { STATIONS } from "../../environment";
import type { Ctx } from "../context";
import type { PanelDoc, Personality } from "../types";

// The report meter track is 100 wide in the .uikitml, drawn at 0.4 scale, so a
// full meter (100) fills 40 units. (Kept as a named width for clarity.)
const REPORT_TRACK_WIDTH = 40;

const PERSONALITIES: Record<string, Personality> = {
  bold: {
    name: "Bold Investor",
    blurb: "You love to grow your money and you are not afraid to take a chance. Just remember to keep some savings safe, too!",
  },
  saver: {
    name: "Careful Saver",
    blurb: "You keep your money safe and steady. Saving is a real strength! Try investing a little to help it grow even more.",
  },
  diversifier: {
    name: "Smart Diversifier",
    blurb: "You make smart choices and spread your money around. That is a great way to stay safe and keep growing!",
  },
  balanced: {
    name: "Balanced Builder",
    blurb: "You did a little of everything: spending, saving, and growing. Mixing it up is a great way to learn what works best for you!",
  },
  spender: {
    name: "Free Spender",
    blurb: "You love to enjoy your money right now, and that is okay! Try saving a little for later, too, so you are ready for a surprise.",
  },
};

export function setupReport(ctx: Ctx): { showReport: () => void } {
  const { world, panels } = ctx;

  const panel = world
    .createTransformEntity()
    .addComponent(PanelUI, { config: "./ui/report.json", maxWidth: 2.6, maxHeight: 2.2 })
    .addComponent(Interactable);
  panel.object3D!.position.set(STATIONS.bank.x, 1.6, STATIONS.bank.z + 2.2);
  panel.object3D!.visible = false;
  registerPhasePanel("report", panel);
  panels.registerStoryPanel(panel);

  let doc: PanelDoc | null = null;
  panels.whenPanelReady(panel, function (d: PanelDoc) {
    doc = d;
    d.getElementById("play-again-button")?.setProperties({
      onClick: function () {
        sfxClick();
        window.location.reload(); // a clean, full restart back to the title
      },
    });
  });

  function showReport() {
    const s = getScores();

    // The money personality reflects the CHOICES the player made, from the most
    // distinctive choice to the most general. This is why a player who spends
    // can never be called a saver: each archetype is gated on a real decision.
    let key = "balanced";
    if (choices.stage3 === "three") {
      key = "diversifier"; // you spread your money out in the big decision
    } else if (choices.stage2 === "lots") {
      key = "bold"; // you invested almost all of your paycheck
    } else if (choices.stage1 === "spend") {
      key = "spender"; // you chose to spend most of your money
    } else if (choices.stage1 === "safe" || choices.stage2 === "safe") {
      key = "saver"; // you kept your money safe instead of investing
    } else {
      key = "balanced"; // a steady little of everything
    }

    const p = PERSONALITIES[key];
    const character = getChosenCharacter();
    const name = character ? character.name : "explorer";

    if (doc) {
      doc.getElementById("greeting")?.setProperties({ text: "Great job, " + name + "!" });
      doc.getElementById("personality-name")?.setProperties({ text: p.name });
      doc.getElementById("personality-blurb")?.setProperties({ text: p.blurb });
      doc.getElementById("value-growth")?.setProperties({ text: String(s.growth) });
      doc.getElementById("value-security")?.setProperties({ text: String(s.security) });
      doc.getElementById("value-smarts")?.setProperties({ text: String(s.smarts) });
      doc.getElementById("fill-growth")?.setProperties({ width: Math.round((s.growth / 100) * REPORT_TRACK_WIDTH) });
      doc.getElementById("fill-security")?.setProperties({ width: Math.round((s.security / 100) * REPORT_TRACK_WIDTH) });
      doc.getElementById("fill-smarts")?.setProperties({ width: Math.round((s.smarts / 100) * REPORT_TRACK_WIDTH) });
    }

    sfxFanfare();
    showPhase("report");
    panels.presentPanel(panel); // place it comfortably in front, wherever you stand
    setObjective("You did it! Here is your money report.");
  }

  return { showReport };
}
